/**
 * Wave 2, fix 8: Google anonymous-upgrade start, mirroring Apple's
 * fall-through.
 *
 * Previously, startAuth returned a linkIdentity result verbatim
 * whenever the error was NOT an identity conflict — and the handler
 * threw on any returned error. So a non-conflict link failure (or a
 * linkIdentity throw) failed anonymous-user Google sign-in outright,
 * where Apple's link attempt falls through to native sign-in on ANY
 * failure. Now every link failure falls through to plain
 * signInWithOAuth: the conflict path is unchanged in outcome (it
 * already fell through to "sign in there instead"), and the
 * non-conflict/throw paths change from hard failure to fall-through.
 * A fall-through that resolves to a different account is covered by
 * the handler's existing stranded-account alert and the Wave-1
 * sign-in migration marker — same shape as Apple's native fallback.
 * This module has no dependencies so it stays importable under jest.
 */

export type GoogleAuthStartClient = {
  auth: {
    linkIdentity: (args: {
      provider: 'google';
      options: { redirectTo: string; skipBrowserRedirect: boolean };
    }) => Promise<{ data?: unknown; error?: unknown }>;
    signInWithOAuth: (args: {
      provider: 'google';
      options: { redirectTo: string; skipBrowserRedirect: boolean };
    }) => Promise<{ data?: unknown; error?: unknown }>;
  };
};

function devLog(...args: unknown[]): void {
  // typeof-guard: __DEV__ is an RN global and is undefined under jest.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

export async function resolveGoogleAuthStart(
  client: GoogleAuthStartClient,
  isAnonymous: boolean,
  redirectTo: string,
): Promise<{ data?: unknown; error?: unknown }> {
  if (!isAnonymous) {
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
  }

  // Upgrade in place: link Google to the anonymous account so amens,
  // wall posts, and synced progress keep the same user id.
  try {
    const link = await client.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (!link.error) {
      return link;
    }
    // Any link error — conflict or not — falls through to plain
    // sign-in (Apple parity). Previously only the conflict error did;
    // a non-conflict error was returned and the handler threw on it.
    devLog('[Auth] Google link failed, falling back to plain sign-in:', link.error);
  } catch (linkError) {
    // linkIdentity itself threw: same fall-through, never a hard fail.
    devLog('[Auth] Google link threw, falling back to plain sign-in:', linkError);
  }
  return client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
}
