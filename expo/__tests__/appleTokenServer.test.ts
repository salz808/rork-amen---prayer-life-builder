// P0-5 server side (2026-11-16): the Apple client_secret is an ES256
// JWT signed with the Sign in with Apple .p8 key. This tests the
// dependency-free helper (backend/functions/_shared/apple.ts) under
// Node — WebCrypto + fetch globals only, no Deno imports.
import {
  buildAppleClientSecret,
  exchangeAppleAuthorizationCode,
  parseApplePrivateKey,
  revokeAppleRefreshToken,
  APPLE_TOKEN_URL,
  APPLE_REVOKE_URL,
  type AppleSecrets,
} from '../../backend/functions/_shared/apple';

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

  it('revoke posts the refresh token and reports success on 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(APPLE_REVOKE_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe('refresh-abc');
    expect(body.get('token_type_hint')).toBe('refresh_token');
  });

  it('revoke reports false on a non-200 (caller logs, never blocks deletion)', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_client' }) });
    await expect(revokeAppleRefreshToken('refresh-abc', secrets)).resolves.toBe(false);
  });
});
