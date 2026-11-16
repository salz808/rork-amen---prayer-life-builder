/**
 * Sign in with Apple — server-side token exchange and revocation
 * (P0-5, Guideline 5.1.1(v), 2026-11-16).
 *
 * Apple issues a single-use authorization code at native sign-in. The
 * client hands it to the `store-apple-token` edge function immediately;
 * this module exchanges it for a refresh token (stored in
 * apple_refresh_tokens) and, at account deletion, revokes that refresh
 * token at https://appleid.apple.com/auth/revoke so the Apple
 * authorization is fully disconnected.
 *
 * Dependency-free by design (WebCrypto + fetch globals only, no Deno
 * or npm imports): the pure parts are unit-testable under Node (see
 * expo/__tests__/appleTokenServer.test.ts). Callers pass secrets in —
 * this module never reads Deno.env itself.
 *
 * Secrets (Supabase dashboard → Edge Functions → Secrets; OWNER work,
 * not code): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_P8 (the
 * .p8 contents, PEM or raw base64, \n may be escaped), APPLE_CLIENT_ID
 * (defaults to the iOS bundle id com.iammadewhole.triad).
 */

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';
export const DEFAULT_APPLE_CLIENT_ID = 'com.iammadewhole.triad';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const unpadded = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Parse a .p8 EC private key (PEM with headers, or raw base64). */
export function parseApplePrivateKey(pemOrBase64: string): Uint8Array {
  const cleaned = pemOrBase64
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlDecode(cleaned);
}

export type AppleSecrets = {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
};

/**
 * Build the ES256 client_secret JWT Apple requires (signed with the
 * Sign in with Apple .p8 key; 5-minute expiry). `nowMs` is injectable
 * for tests; defaults to Date.now().
 */
export async function buildAppleClientSecret(
  secrets: AppleSecrets,
  nowMs: number = Date.now(),
): Promise<string> {
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: secrets.keyId })),
  );
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: secrets.teamId,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 300,
        aud: APPLE_TOKEN_AUDIENCE,
        sub: secrets.clientId,
      }),
    ),
  );
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const keyData = parseApplePrivateKey(secrets.privateKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    data,
  );
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Exchange a native authorization code for an Apple refresh token.
 * Returns the refresh token, or null when Apple rejects the code (it
 * is single-use and expires in ~10 minutes — a retry with the same
 * code can never succeed).
 */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  secrets: AppleSecrets,
): Promise<string | null> {
  const clientSecret = await buildAppleClientSecret(secrets);
  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secrets.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { refresh_token?: unknown };
  return typeof data.refresh_token === 'string' && data.refresh_token.length > 0
    ? data.refresh_token
    : null;
}

/**
 * Revoke a stored Apple refresh token. Returns true on Apple's 200.
 * A failure (unknown token, bad client_secret, network) returns false
 * — the caller logs it but must never block account deletion on it.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
  secrets: AppleSecrets,
): Promise<boolean> {
  const clientSecret = await buildAppleClientSecret(secrets);
  const response = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secrets.clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
  return response.ok;
}
