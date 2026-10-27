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
 * True when a Supabase error means "this email already belongs to
 * another account". Kept separate from lib/supabase's
 * isIdentityConflictError so this module stays importable in jest
 * without the auth client; the two predicates overlap on purpose
 * (the screen checks both).
 */
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
 */
export function interpretAnonymousLink(
  anonymousUserId: string,
  after: AnonymousLinkUser | null | undefined,
): AnonymousLinkOutcome {
  if (!after) return 'unchanged';
  if (after.id !== anonymousUserId) return 'stranded';
  if (after.is_anonymous === true) return 'confirmationPending';
  return 'upgraded';
}
