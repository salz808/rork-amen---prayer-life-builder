import { supabase } from './supabase';

/**
 * Apple refresh-token hand-off (P0-5, Guideline 5.1.1(v), 2026-11-16).
 *
 * Native Sign in with Apple returns a single-use authorization code
 * (expires in ~10 minutes) alongside the identity token. The identity
 * token alone signs the user in — but it gives the server no Apple
 * refresh token, so at account deletion there is nothing to revoke.
 * This hands the code to the `store-apple-token` edge function the
 * moment sign-in succeeds, so the server can exchange it for a refresh
 * token and store it for a future deletion-time revocation.
 *
 * Best-effort by design: sign-in must never fail because token
 * storage did (secrets unconfigured, network down, code already
 * spent). The delete-account function treats a missing stored token
 * as "nothing to revoke" and deletes the account anyway.
 *
 * Item 2 (2026-11-16): the identity token is sent alongside the
 * code so the server can verify it (JWKS signature, iss/aud/exp)
 * and bind the stored refresh token to the Apple account it was
 * issued for. A missing identityToken still sends the code — the
 * server rejects the store call (400), never the sign-in.
 */
export async function storeAppleAuthorizationCode(
  authorizationCode: string,
  identityToken?: string,
): Promise<boolean> {
  if (!authorizationCode || !supabase) {
    return false;
  }
  try {
    const { error } = await supabase.functions.invoke('store-apple-token', {
      body: { authorizationCode, identityToken },
    });
    if (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[AppleToken] store-apple-token failed:', error);
      }
      return false;
    }
    return true;
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[AppleToken] store-apple-token threw:', error);
    }
    return false;
  }
}
