import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json, readCappedJson } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';
import {
  DEFAULT_APPLE_CLIENT_ID,
  exchangeAppleAuthorizationCode,
  verifyAppleIdToken,
  type AppleSecrets,
} from '../_shared/apple.ts';

const MAX_BODY_BYTES = 4 * 1024;

/**
 * Store the Apple refresh token for a native Sign in with Apple user
 * (P0-5, Guideline 5.1.1(v), 2026-11-16; Item 2 binding, 2026-11-16).
 *
 * The client captures credential.authorizationCode AND
 * credential.identityToken at native sign-in and calls this function
 * immediately: the code is single-use and expires in ~10 minutes, so
 * it cannot wait until account deletion. The function first verifies
 * the id_token (signature against Apple's JWKS, iss/aud/exp, sub)
 * BEFORE exchanging the code, then checks the token's sub against
 * the user's Apple identity in Supabase (admin getUserById,
 * provider='apple', id === sub) — so a code can only be stored
 * against the Apple account it was issued for. It then exchanges the
 * code for a refresh token and upserts it into apple_refresh_tokens
 * (service-role only; see migration 20261116000003), storing the
 * verified apple_sub alongside. At account deletion, delete-account
 * revokes the stored token at Apple and drops the row.
 *
 * DEPLOY ORDER (owner): apply migration 20261116000003 first, then
 * set the Apple secrets in the Supabase dashboard (APPLE_TEAM_ID,
 * APPLE_KEY_ID, APPLE_PRIVATE_KEY_P8, APPLE_CLIENT_ID — the .p8 key
 * from the Apple Developer portal's Sign in with Apple key), then
 * deploy this function. Until the secrets exist this answers 503 and
 * the client treats it as best-effort — sign-in is unaffected.
 *
 * SECURITY: the authorization code, identity token, and refresh token
 * are never logged. A failure here never fails sign-in (the client
 * call is best-effort); a missing/mismatched id_token rejects THIS
 * store call only (400/401), not the sign-in. A store failure only
 * means a future deletion cannot revoke at Apple, which the
 * delete-account function now treats as a blocking 503 (Item 7).
 */
Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405);
  }

  const teamId = Deno.env.get('APPLE_TEAM_ID') ?? '';
  const keyId = Deno.env.get('APPLE_KEY_ID') ?? '';
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY_P8') ?? '';
  const clientId = Deno.env.get('APPLE_CLIENT_ID') ?? DEFAULT_APPLE_CLIENT_ID;
  if (!teamId || !keyId || !privateKey) {
    return errorResponse(request, 'Apple token storage is not configured', 503);
  }
  const secrets: AppleSecrets = { teamId, keyId, privateKey, clientId };

  try {
    let user: { id: string };
    try {
      ({ user } = await requireUser(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Same auth classification as delete-account: an auth problem is
      // a 401, not a generic 500.
      if (/missing bearer|unauthorized|jwt|expired|invalid token|invalid login|not authenticated/i.test(message)) {
        return errorResponse(request, 'Authentication required', 401);
      }
      throw error;
    }

    let authorizationCode = '';
    let identityToken = '';
    try {
      const parsed = await readCappedJson(request, MAX_BODY_BYTES);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rawCode = (parsed as { authorizationCode?: unknown }).authorizationCode;
        authorizationCode = typeof rawCode === 'string' ? rawCode.trim() : '';
        const rawToken = (parsed as { identityToken?: unknown }).identityToken;
        identityToken = typeof rawToken === 'string' ? rawToken.trim() : '';
      } else {
        return errorResponse(request, 'Request body must be a JSON object', 400);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Request body too large') {
        return errorResponse(request, 'Request body too large', 413);
      }
      return errorResponse(request, 'Malformed request JSON', 400);
    }

    if (!authorizationCode) {
      return errorResponse(request, 'authorizationCode is required', 400);
    }
    if (!identityToken) {
      return errorResponse(request, 'identityToken is required', 400);
    }

    // Item 2: verify the id_token BEFORE exchanging the code. The aud
    // for a native sign-in id_token is the bundle ID (the clientId
    // used for the exchange), not a Services ID.
    const verified = await verifyAppleIdToken(identityToken, clientId);
    if (!verified) {
      return errorResponse(request, 'Apple identity token could not be verified', 401);
    }

    // Bind the token to the user's Apple identity in Supabase: the
    // id_token sub must match an identity with provider='apple' whose
    // id equals the sub. A mismatch (or no Apple identity at all)
    // rejects the store call — a code must never be stored against
    // the wrong Apple account.
    const supabase = createAdminClient();
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(user.id);
    if (authUserError || !authUser?.user) {
      throw authUserError ?? new Error('store-apple-token: user lookup failed');
    }
    const appleIdentity = (authUser.user.identities ?? []).find(
      (identity) => identity.provider === 'apple' && identity.id === verified.sub,
    );
    if (!appleIdentity) {
      return errorResponse(request, 'Apple identity does not match this account', 401);
    }

    const refreshToken = await exchangeAppleAuthorizationCode(authorizationCode, secrets);
    if (!refreshToken) {
      // Apple rejected the code (spent, expired, or mismatched
      // client). Nothing to store; the client treats this as a
      // best-effort miss, not a sign-in failure.
      return errorResponse(request, 'Apple did not accept the authorization code', 502);
    }

    const { error } = await supabase.from('apple_refresh_tokens').upsert(
      {
        user_id: user.id,
        refresh_token: refreshToken,
        apple_sub: verified.sub,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      throw error;
    }

    return json(request, { ok: true, stored: true });
  } catch (error) {
    console.error('[store-apple-token] request failed');
    return errorResponse(request, 'Unable to store Apple token right now', 500);
  }
});
