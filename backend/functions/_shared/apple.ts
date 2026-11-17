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
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_ID_TOKEN_ISSUER = 'https://appleid.apple.com';
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
 * Revoke a stored Apple refresh token. Returns a result object so the
 * caller can tell "Apple says this token is already gone" apart from
 * "Apple could not be reached / refused" — the distinction matters at
 * account deletion (Item 7, 2026-11-16): an already-revoked token is
 * safe to drop, any other failure must BLOCK the deletion and keep
 * the row. A fetch-level failure (network) is 'failed', never a throw:
 * the caller maps it to a retryable 503. A client_secret build failure
 * (misconfigured .p8 key) still throws — that is a configuration error,
 * and the caller treats any throw from this function as 'failed'.
 */
export type AppleRevokeResult = {
  outcome: 'revoked' | 'already_revoked' | 'failed';
};

export async function revokeAppleRefreshToken(
  refreshToken: string,
  secrets: AppleSecrets,
): Promise<AppleRevokeResult> {
  const clientSecret = await buildAppleClientSecret(secrets);
  let response: Response;
  try {
    response = await fetch(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: secrets.clientId,
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
    });
  } catch {
    return { outcome: 'failed' };
  }
  if (response.ok) {
    return { outcome: 'revoked' };
  }
  // Apple answers 400 with { "error": "invalid_grant" } when the token
  // is unknown / already revoked; any other error (invalid_client,
  // invalid_request, 5xx) is a real failure. The body may be empty or
  // non-JSON, so parse defensively — an unparseable error body is
  // 'failed', never 'already_revoked'.
  let errorCode = '';
  try {
    const data = (await response.json()) as { error?: unknown };
    errorCode = typeof data.error === 'string' ? data.error : '';
  } catch {
    errorCode = '';
  }
  return { outcome: errorCode === 'invalid_grant' ? 'already_revoked' : 'failed' };
}

// =====================================================================
// Apple identity-token (id_token) verification — Item 2, 2026-11-16.
// The native sign-in hands the server an authorization code AND an
// id_token. The id_token is verified BEFORE the code is exchanged, so
// a code can only be stored against the Apple account it was issued
// for: verify the RS256 signature against Apple's JWKS, then iss, aud
// (the clientId used for the exchange — for native sign-in the aud is
// the bundle ID, NOT a Services ID), exp, and a non-empty sub.
// =====================================================================

function decodeJwtPartToString(part: string): string | null {
  try {
    const bytes = base64UrlDecode(part);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Verify an Apple id_token and return its subject (the stable Apple
 * user id) or null on ANY failure (bad shape, unknown kid, bad
 * signature, wrong iss/aud, expired, missing sub). Never throws, and
 * never logs the token. `nowMs` is injectable for tests.
 */
export async function verifyAppleIdToken(
  idToken: string,
  expectedAudience: string,
  nowMs: number = Date.now(),
): Promise<{ sub: string } | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const headerText = decodeJwtPartToString(headerB64);
    const payloadText = decodeJwtPartToString(payloadB64);
    if (!headerText || !payloadText) return null;
    const header = JSON.parse(headerText) as { alg?: unknown; kid?: unknown };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
      return null;
    }
    const payload = JSON.parse(payloadText) as {
      iss?: unknown;
      aud?: unknown;
      exp?: unknown;
      sub?: unknown;
    };
    if (payload.iss !== APPLE_ID_TOKEN_ISSUER) return null;
    const aud = payload.aud;
    const audMatches =
      (typeof aud === 'string' && aud === expectedAudience) ||
      (Array.isArray(aud) && aud.includes(expectedAudience));
    if (!audMatches) return null;
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Math.floor(nowMs / 1000)) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    const jwksResponse = await fetch(APPLE_JWKS_URL);
    if (!jwksResponse.ok) return null;
    const jwks = (await jwksResponse.json()) as {
      keys?: Array<Record<string, unknown>>;
    };
    const key = (jwks.keys ?? []).find(
      (candidate) => candidate.kid === header.kid && candidate.kty === 'RSA',
    );
    if (!key) return null;
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = base64UrlDecode(signatureB64);
    const verified = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      publicKey,
      signature.buffer as ArrayBuffer,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!verified) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

// =====================================================================
// Supabase access-token claims — Item 3 (per-session delete check),
// 2026-11-16. Pure helpers, unit-tested in appleTokenServer.test.ts.
//
// RESEARCH VERDICT (GoTrue v2.198.0 source, supabase/auth master, and
// https://supabase.com/docs/guides/auth/jwt-fields): BOTH claims are
// verifiable. `session_id` is a REQUIRED claim, always present in
// access tokens (docs "always present"; AccessTokenClaims.SessionId in
// internal/tokens/service.go). `amr` is an OPTIONAL claim, but for a
// normal sign-in it is always populated: the sign-in path
// (IssueRefreshToken) calls AddClaimToSession, which upserts a row in
// auth.mfa_amr_claims with updated_at = sign-in time, and
// CalculateAALAndAMR builds the claim from those rows with
// timestamp = claim.updated_at, sorted newest-first. Crucially, the
// token-refresh path (RefreshTokenGrant) NEVER calls
// AddClaimToSession — it only updates the session's RefreshedAt — so
// a refresh does not move any amr timestamp and adds no
// "token_refresh" entry (that method value exists in the enum and in
// the custom-access-token-hook input, but no amr row is written for
// it). A mid-session MFA re-verification DOES add/move that method's
// claim — that is a genuine fresh credential check, so it correctly
// counts as fresh auth. The check below therefore requires BOTH a
// session_id AND a most-recent amr timestamp inside the window, and
// fails closed when either is missing or malformed.
// =====================================================================

/**
 * Decode a JWT payload WITHOUT verifying the signature. ONLY call
 * this on a token whose signature has already been verified by a
 * trusted party (here: requireUser → supabase.auth.getUser()). The
 * payload is untrusted input until that verification has happened.
 * Returns the payload object, or null on any malformed input.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadText = decodeJwtPartToString(parts[1]);
    if (!payloadText) return null;
    const payload = JSON.parse(payloadText) as unknown;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The most recent amr timestamp (unix seconds) in the claims, or null
 * when there is no usable timestamp. amr entries are objects
 * { method, timestamp } (GoTrue's form); a custom access-token hook
 * may instead emit plain strings (RFC-8176 form), which carry no
 * timestamp and are ignored — a string-only amr yields null, which
 * fails closed in isSessionAuthRecent.
 */
export function mostRecentAmrTimestamp(claims: Record<string, unknown> | null): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  let latest: number | null = null;
  for (const entry of claims.amr as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

/**
 * True only when the access token proves a FRESH authentication in
 * THIS session: a session_id is present, and the most recent amr
 * timestamp is within windowMs of nowMs. Missing/malformed claims,
 * a missing session_id, a missing amr, or a stale newest timestamp
 * all return false (fail closed). `windowMs` defaults to 10 minutes.
 */
export function isSessionAuthRecent(
  claims: Record<string, unknown> | null,
  nowMs: number = Date.now(),
  windowMs: number = 10 * 60 * 1000,
): boolean {
  if (!claims) return false;
  if (typeof claims.session_id !== 'string' || claims.session_id.length === 0) {
    return false;
  }
  const latest = mostRecentAmrTimestamp(claims);
  if (latest === null) return false;
  return nowMs - latest * 1000 <= windowMs;
}
