/**
 * Email sign-in helpers for expo/app/auth.tsx.
 *
 * Pure functions only (no Supabase, no React Native imports) so they are
 * unit-testable in jest without the auth client. The screen itself owns
 * every Supabase call; this module only normalises input, validates it,
 * and interprets results — it never stores, logs, or sends an email
 * anywhere except as an argument to a supabase.auth call on the screen.
 *
 * Why password, not OTP: Supabase's anonymous-upgrade path for email is
 * updateUser({ email, password }) on the anonymous session, which keeps
 * the SAME user id, so prayers/progress/amens carry over exactly like
 * linkIdentity does for Google/Apple. signInWithOtp / verifyOtp cannot
 * link to an anonymous session — they sign into (or create) a separate
 * account, which would strand the anonymous user's data the same way a
 * failed OAuth link does. Password sign-in also needs no browser
 * redirect or deep-link callback, unlike OAuth and unlike OTP links.
 *
 * Password reset is the one email flow that DOES need a deep link: the
 * reset email lands on /auth/reset-password (RESET_PASSWORD_REDIRECT_URL),
 * which establishes the recovery session from the link's code or tokens
 * (parseRecoveryUrl) and lets the user set a new password
 * (validateResetPassword). The screen owns every Supabase call; this
 * module only parses and validates.
 */

export type EmailAuthMode = 'signIn' | 'signUp';

/** Trim + lowercase: Supabase treats email case-insensitively, but the
 *  input the user typed should never be the thing compared or stored. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

const MIN_SIGNUP_PASSWORD_LENGTH = 8;

/** Deep link the reset email lands on. Single source of truth — the
 *  auth screen sends it as redirectTo, the reset screen is the route
 *  it resolves to, and the invalid-link resend reuses it. It must be
 *  allowlisted in the Supabase dashboard (Auth → URL Configuration →
 *  Redirect URLs) or Supabase refuses to send the reset email. */
export const RESET_PASSWORD_REDIRECT_URL = 'amen-app://auth/reset-password';

/**
 * Client-side validation. Sign-in deliberately requires only a non-empty
 * password: an existing account may predate any length rule, and
 * rejecting its (shorter) password client-side would lock its owner
 * out. Sign-up requires 8+ characters; the Supabase dashboard's own
 * password rules (minimum length, leaked-password protection) still
 * apply server-side and can reject a password this accepts.
 * Returns a user-facing message, or null when the input is usable.
 */
export function validateEmailPassword(
  email: string,
  password: string,
  mode: EmailAuthMode,
): string | null {
  if (!isValidEmail(email)) {
    return 'Please enter a valid email address.';
  }
  if (mode === 'signUp' && password.length < MIN_SIGNUP_PASSWORD_LENGTH) {
    return 'Please choose a password with at least 8 characters.';
  }
  if (mode === 'signIn' && password.length === 0) {
    return 'Please enter your password.';
  }
  return null;
}

/**
 * Client-side validation for the new password on the reset screen.
 * Same 8-character minimum as sign-up (the existing rule), plus the
 * two entries must match. Returns a user-facing message, or null
 * when the input is usable. Server-side rules (minimum length,
 * leaked-password protection) still apply and can reject a password
 * this accepts.
 */
export function validateResetPassword(password: string, confirmPassword: string): string | null {
  if (password.length === 0) {
    return 'Please enter a new password.';
  }
  if (password.length < MIN_SIGNUP_PASSWORD_LENGTH) {
    return 'Please choose a password with at least 8 characters.';
  }
  if (password !== confirmPassword) {
    return 'Those passwords do not match. Please try again.';
  }
  return null;
}

/** What a recovery deep link carries. Supabase sends recovery links
 *  in two shapes depending on the project's auth flow: PKCE puts a
 *  `code` query param on the redirect URL, implicit flow puts
 *  `access_token`/`refresh_token` in the URL fragment. An expired or
 *  already-used link redirects with `error` params instead (query or
 *  fragment). Null means the URL carries no recovery material at all
 *  (e.g. the route was opened by hand). */
export type RecoveryCredentials =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; error: string; description: string | null };

/**
 * Reads recovery credentials out of a deep-link URL. Pure — the reset
 * screen owns the supabase calls (exchangeCodeForSession / setSession);
 * this only parses. An error redirect wins over any credentials: an
 * expired link must never be treated as usable.
 */
export function parseRecoveryUrl(url: string | null | undefined): RecoveryCredentials | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const pick = (name: string): string | null => query.get(name) ?? hash.get(name);
  const error = pick('error');
  if (error) {
    return { kind: 'error', error, description: pick('error_description') };
  }
  const code = query.get('code') ?? hash.get('code');
  if (code) return { kind: 'code', code };
  const accessToken = pick('access_token');
  const refreshToken = pick('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  return null;
}
export function isAlreadyRegisteredError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = message.toLowerCase();
  return (
    lower.includes('already') &&
    (lower.includes('registered') || lower.includes('exists') || lower.includes('identity'))
  );
}

/** Result of a non-anonymous signUp call. */
export type SignUpOutcome = 'signedIn' | 'confirmationPending';

/**
 * With "Confirm email" ON (the Supabase default), signUp returns no
 * session until the user clicks the confirmation email — that is NOT a
 * failure and must NOT navigate home or record an age attestation.
 * With it OFF, signUp returns a session immediately.
 */
export function interpretSignUp(hasSession: boolean): SignUpOutcome {
  return hasSession ? 'signedIn' : 'confirmationPending';
}

/** Result of linking email+password onto an anonymous session. */
export type AnonymousLinkOutcome =
  | 'upgraded'
  | 'confirmationPending'
  | 'stranded'
  | 'unchanged';

export interface AnonymousLinkUser {
  id: string;
  is_anonymous?: boolean;
}

/**
 * updateUser on an anonymous session keeps the same user id when it
 * converts the account. With "Confirm email" ON the account stays
 * anonymous (same id) until the confirmation email is clicked, and the
 * password does not work until then — that pending state must be shown
 * honestly, not presented as a completed upgrade. A different id (not
 * expected from updateUser, but checked anyway, mirroring the Apple
 * fallback's L3 guard) means the guest data did NOT carry over.
 * Callers must still navigate home on 'stranded' (after telling the
 * user plainly): the session IS signed in on the new account, and
 * returning without navigating strands the user on the auth screen
 * (audit fix F6 in app/auth.tsx). The auth screen's focus re-check
 * is the backstop for a signed-in session that appears while the
 * screen is already mounted.
 * Fail-closed on the anonymous flag: only an EXPLICIT false counts as
 * upgraded. A missing is_anonymous (unknown state) is treated as
 * pending, never upgraded — presenting an unconfirmed upgrade as done
 * would strand the user on a password that does not work yet.
 */
export function interpretAnonymousLink(
  anonymousUserId: string,
  after: AnonymousLinkUser | null | undefined,
): AnonymousLinkOutcome {
  if (!after) return 'unchanged';
  if (after.id !== anonymousUserId) return 'stranded';
  if (after.is_anonymous !== false) return 'confirmationPending';
  return 'upgraded';
}
