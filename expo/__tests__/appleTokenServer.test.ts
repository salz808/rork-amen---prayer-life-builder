// P0-5 server side (2026-11-16): the Apple client_secret is an ES256
// JWT signed with the Sign in with Apple .p8 key. This tests the
// dependency-free helper (backend/functions/_shared/apple.ts) under
// Node — WebCrypto + fetch globals only, no Deno imports.
import {
  buildAppleClientSecret,
  decodeJwtPayload,
  exchangeAppleAuthorizationCode,
  isSessionAuthRecent,
  mostRecentAmrTimestamp,
  parseApplePrivateKey,
  revokeAppleRefreshToken,
  verifyAppleIdToken,
  APPLE_ID_TOKEN_ISSUER,
  APPLE_JWKS_URL,
  APPLE_TOKEN_URL,
  APPLE_REVOKE_URL,
  type AppleSecrets,
} from '../../backend/functions/_shared/apple';

function base64UrlEncodeText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToString(input: string): string {
  const unpadded = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
  return atob(padded);
}

async function makeSecrets(): Promise<{ secrets: AppleSecrets; publicKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
  return {
    secrets: {
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: pem,
      clientId: 'com.iammadewhole.triad',
    },
    publicKey: keyPair.publicKey,
  };
}

describe('buildAppleClientSecret', () => {
  it('builds a verifiable ES256 JWT with the Apple claims', async () => {
    const { secrets, publicKey } = await makeSecrets();
    const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
    const jwt = await buildAppleClientSecret(secrets, nowMs);
    const [headerB64, payloadB64, signatureB64] = jwt.split('.');
    expect(headerB64).toBeTruthy();
    expect(payloadB64).toBeTruthy();
    expect(signatureB64).toBeTruthy();

    expect(JSON.parse(base64UrlDecodeToString(headerB64))).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    expect(payload).toEqual({
      iss: 'TEAM123456',
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + 300,
      aud: 'https://appleid.apple.com',
      sub: 'com.iammadewhole.triad',
    });

    const signature = new Uint8Array(
      [...base64UrlDecodeToString(signatureB64)].map((c) => c.charCodeAt(0)),
    );
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature.buffer as ArrayBuffer,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    expect(verified).toBe(true);
  });

  it('accepts a \\n-escaped private key (how Supabase secrets store PEMs)', async () => {
    const { secrets } = await makeSecrets();
    const escaped = { ...secrets, privateKey: secrets.privateKey.replace(/\n/g, '\\n') };
    const jwt = await buildAppleClientSecret(escaped, Date.parse('2026-11-16T10:00:00.000Z'));
    expect(jwt.split('.')).toHaveLength(3);
  });
});

describe('parseApplePrivateKey', () => {
  it('parses PEM and raw base64 to the same bytes', async () => {
    const { secrets } = await makeSecrets();
    const fromPem = parseApplePrivateKey(secrets.privateKey);
    const raw = secrets.privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');
    const fromRaw = parseApplePrivateKey(raw);
    expect(fromRaw).toEqual(fromPem);
    expect(fromPem.length).toBeGreaterThan(0);
  });
});

describe('Apple token endpoints', () => {
  const fetchMock = jest.fn();
  const secrets: AppleSecrets = {
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    // A real P-256 key is needed only for signing; reuse a generated one.
    privateKey: '',
    clientId: 'com.iammadewhole.triad',
  };

  beforeAll(async () => {
    const { secrets: real } = await makeSecrets();
    secrets.privateKey = real.privateKey;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('exchange posts the code and returns the refresh token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: 'refresh-abc', access_token: 'access-abc' }),
    });
    const token = await exchangeAppleAuthorizationCode('auth-code-123', secrets);
    expect(token).toBe('refresh-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(APPLE_TOKEN_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-123');
    expect(body.get('client_id')).toBe('com.iammadewhole.triad');
    expect(body.get('client_secret')).toMatch(/^eyJ/);
  });

  it('exchange returns null when Apple rejects the code', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    await expect(exchangeAppleAuthorizationCode('spent-code', secrets)).resolves.toBeNull();
  });

  it('revoke posts the refresh token and reports revoked on 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toEqual({
      outcome: 'revoked',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(APPLE_REVOKE_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe('refresh-abc');
    expect(body.get('token_type_hint')).toBe('refresh_token');
  });

  it("revoke reports already_revoked when Apple answers invalid_grant (safe to drop the row)", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toEqual({
      outcome: 'already_revoked',
    });
  });

  it("revoke reports failed on other Apple errors (caller blocks deletion, keeps the row)", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_client' }) });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toEqual({
      outcome: 'failed',
    });
  });

  it('revoke reports failed when the error body is empty or non-JSON (never already_revoked on a guess)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toEqual({
      outcome: 'failed',
    });
  });

  it('revoke reports failed (never throws) when the fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toEqual({
      outcome: 'failed',
    });
  });
});

describe('verifyAppleIdToken', () => {
  const fetchMock = jest.fn();
  const clientId = 'com.iammadewhole.triad';
  const nowMs = Date.parse('2026-11-16T10:00:00.000Z');

  let privateKey: CryptoKey;
  let jwks: { keys: Record<string, unknown>[] };

  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    privateKey = keyPair.privateKey;
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    jwks = {
      keys: [{ ...publicJwk, kid: 'apple-key-1', use: 'sig' }],
    };
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, json: async () => jwks });
  });

  async function makeIdToken(
    payloadOverrides: Record<string, unknown> = {},
    headerOverrides: Record<string, unknown> = {},
    signingKey: CryptoKey = privateKey,
  ): Promise<string> {
    const header = base64UrlEncodeText(
      JSON.stringify({ alg: 'RS256', kid: 'apple-key-1', typ: 'JWT', ...headerOverrides }),
    );
    const payload = base64UrlEncodeText(
      JSON.stringify({
        iss: APPLE_ID_TOKEN_ISSUER,
        aud: clientId,
        exp: Math.floor(nowMs / 1000) + 600,
        iat: Math.floor(nowMs / 1000),
        sub: 'apple-user-sub-123',
        ...payloadOverrides,
      }),
    );
    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      signingKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  }

  it('verifies a valid token and returns the sub', async () => {
    const token = await makeIdToken();
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toEqual({
      sub: 'apple-user-sub-123',
    });
    expect(fetchMock).toHaveBeenCalledWith(APPLE_JWKS_URL);
  });

  it('accepts aud as an array containing the client id', async () => {
    const token = await makeIdToken({ aud: ['other-aud', clientId] });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toEqual({
      sub: 'apple-user-sub-123',
    });
  });

  it('rejects a token whose aud is a Services ID, not the bundle ID', async () => {
    const token = await makeIdToken({ aud: 'com.iammadewhole.triad.signin' });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await makeIdToken({ exp: Math.floor(nowMs / 1000) - 1 });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('rejects a wrong issuer', async () => {
    const token = await makeIdToken({ iss: 'https://evil.example.com' });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('rejects a token with an unknown kid', async () => {
    const token = await makeIdToken({}, { kid: 'unknown-key' });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('rejects a tampered payload (bad signature)', async () => {
    const token = await makeIdToken();
    const [header, , signature] = token.split('.');
    const tamperedPayload = base64UrlEncodeText(
      JSON.stringify({
        iss: APPLE_ID_TOKEN_ISSUER,
        aud: clientId,
        exp: Math.floor(nowMs / 1000) + 600,
        sub: 'attacker-sub',
      }),
    );
    await expect(
      verifyAppleIdToken(`${header}.${tamperedPayload}.${signature}`, clientId, nowMs),
    ).resolves.toBeNull();
  });

  it('rejects a token signed with a different key', async () => {
    const otherPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const token = await makeIdToken({}, {}, otherPair.privateKey);
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('rejects a missing sub', async () => {
    const token = await makeIdToken({ sub: '' });
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('returns null when the JWKS fetch fails (never throws)', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const token = await makeIdToken();
    await expect(verifyAppleIdToken(token, clientId, nowMs)).resolves.toBeNull();
  });

  it('returns null for malformed tokens (never throws)', async () => {
    await expect(verifyAppleIdToken('not-a-jwt', clientId, nowMs)).resolves.toBeNull();
    await expect(verifyAppleIdToken('', clientId, nowMs)).resolves.toBeNull();
  });
});

describe('Supabase access-token claims (Item 3 per-session check)', () => {
  const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
  const nowSec = Math.floor(nowMs / 1000);

  function makeAccessToken(claims: Record<string, unknown>): string {
    return [
      base64UrlEncodeText(JSON.stringify({ alg: 'ES256', typ: 'JWT' })),
      base64UrlEncodeText(JSON.stringify(claims)),
      base64UrlEncodeText('signature-is-irrelevant-here'),
    ].join('.');
  }

  function sessionClaims(amr: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      sub: 'user-uuid-1',
      session_id: 'session-uuid-1',
      amr,
      ...extra,
    };
  }

  describe('decodeJwtPayload', () => {
    it('decodes the payload of a well-formed JWT', () => {
      const claims = decodeJwtPayload(makeAccessToken(sessionClaims([])));
      expect(claims?.sub).toBe('user-uuid-1');
      expect(claims?.session_id).toBe('session-uuid-1');
    });

    it('returns null for malformed tokens', () => {
      expect(decodeJwtPayload('not-a-jwt')).toBeNull();
      expect(decodeJwtPayload('')).toBeNull();
      expect(decodeJwtPayload('a.b')).toBeNull();
      expect(
        decodeJwtPayload(makeAccessToken({} as Record<string, unknown>)),
      ).not.toBeNull();
      // Non-object payload (an array) is rejected.
      const arrayPayload = [
        base64UrlEncodeText(JSON.stringify({ alg: 'none' })),
        base64UrlEncodeText(JSON.stringify(['x'])),
        base64UrlEncodeText('sig'),
      ].join('.');
      expect(decodeJwtPayload(arrayPayload)).toBeNull();
    });
  });

  describe('mostRecentAmrTimestamp', () => {
    it('returns the newest timestamp across entries', () => {
      expect(
        mostRecentAmrTimestamp(
          sessionClaims([
            { method: 'password', timestamp: nowSec - 7200 },
            { method: 'totp', timestamp: nowSec - 60 },
          ]),
        ),
      ).toBe(nowSec - 60);
    });

    it('ignores string-form amr entries (RFC-8176 form carries no timestamp)', () => {
      expect(mostRecentAmrTimestamp(sessionClaims(['password', 'otp']))).toBeNull();
    });

    it('returns null when amr is missing or not an array', () => {
      expect(mostRecentAmrTimestamp({ session_id: 's' })).toBeNull();
      expect(mostRecentAmrTimestamp(sessionClaims('password'))).toBeNull();
      expect(mostRecentAmrTimestamp(null)).toBeNull();
    });
  });

  describe('isSessionAuthRecent', () => {
    it('is fresh when the most recent amr timestamp is inside 10 minutes', () => {
      expect(
        isSessionAuthRecent(
          sessionClaims([{ method: 'password', timestamp: nowSec - 300 }]),
          nowMs,
        ),
      ).toBe(true);
    });

    it('is fresh exactly at the 10-minute boundary', () => {
      expect(
        isSessionAuthRecent(
          sessionClaims([{ method: 'password', timestamp: nowSec - 600 }]),
          nowMs,
        ),
      ).toBe(true);
    });

    it('is stale one second past the window, even with a valid session_id', () => {
      expect(
        isSessionAuthRecent(
          sessionClaims([{ method: 'password', timestamp: nowSec - 601 }]),
          nowMs,
        ),
      ).toBe(false);
    });

    it('uses the NEWEST amr entry: an old password plus a recent MFA verify is fresh', () => {
      expect(
        isSessionAuthRecent(
          sessionClaims([
            { method: 'password', timestamp: nowSec - 7200 },
            { method: 'totp', timestamp: nowSec - 120 },
          ]),
          nowMs,
        ),
      ).toBe(true);
    });

    it('fails closed without a session_id (per-user token, not a session)', () => {
      expect(
        isSessionAuthRecent(
          { sub: 'user-uuid-1', amr: [{ method: 'password', timestamp: nowSec }] },
          nowMs,
        ),
      ).toBe(false);
    });

    it('fails closed when amr is missing or string-only', () => {
      expect(isSessionAuthRecent({ sub: 'u', session_id: 's' }, nowMs)).toBe(false);
      expect(
        isSessionAuthRecent(sessionClaims(['password']), nowMs),
      ).toBe(false);
      expect(isSessionAuthRecent(null, nowMs)).toBe(false);
    });

    it('works end to end from a decoded JWT payload', () => {
      const claims = decodeJwtPayload(
        makeAccessToken(sessionClaims([{ method: 'oauth', timestamp: nowSec - 30 }])),
      );
      expect(isSessionAuthRecent(claims, nowMs)).toBe(true);
      const stale = decodeJwtPayload(
        makeAccessToken(sessionClaims([{ method: 'oauth', timestamp: nowSec - 3600 }])),
      );
      expect(isSessionAuthRecent(stale, nowMs)).toBe(false);
    });
  });
});
