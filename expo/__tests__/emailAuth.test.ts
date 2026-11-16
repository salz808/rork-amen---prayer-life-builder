import {
  interpretAnonymousLink,
  interpretSignUp,
  isAlreadyRegisteredError,
  isValidEmail,
  normalizeEmail,
  parseRecoveryUrl,
  RESET_PASSWORD_REDIRECT_URL,
  validateEmailPassword,
  validateResetPassword,
} from '@/lib/emailAuth';

describe('normalizeEmail / isValidEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Kai@Example.COM ')).toBe('kai@example.com');
  });

  it('accepts ordinary addresses and rejects malformed ones', () => {
    expect(isValidEmail('kai@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a @b.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateEmailPassword', () => {
  it('rejects a bad email in both modes', () => {
    expect(validateEmailPassword('bad', 'longenoughpassword', 'signIn')).not.toBeNull();
    expect(validateEmailPassword('bad', 'longenoughpassword', 'signUp')).not.toBeNull();
  });

  it('requires 8+ characters only for sign-up, so older short passwords can still sign in', () => {
    expect(validateEmailPassword('kai@example.com', 'short', 'signUp')).not.toBeNull();
    expect(validateEmailPassword('kai@example.com', 'short', 'signIn')).toBeNull();
    expect(validateEmailPassword('kai@example.com', '', 'signIn')).not.toBeNull();
    expect(validateEmailPassword('kai@example.com', 'longenough', 'signUp')).toBeNull();
  });
});

describe('isAlreadyRegisteredError', () => {
  it('matches Supabase already-registered wording', () => {
    expect(isAlreadyRegisteredError(new Error('A user with this email address has already been registered'))).toBe(true);
    expect(isAlreadyRegisteredError(new Error('User already exists'))).toBe(true);
    expect(isAlreadyRegisteredError(new Error('Invalid login credentials'))).toBe(false);
    expect(isAlreadyRegisteredError(null)).toBe(false);
  });
});

describe('interpretSignUp', () => {
  it('treats a missing session as confirmation pending, not success', () => {
    expect(interpretSignUp(false)).toBe('confirmationPending');
    expect(interpretSignUp(true)).toBe('signedIn');
  });
});

describe('interpretAnonymousLink', () => {
  it('upgraded only when the id is unchanged and the user is no longer anonymous', () => {
    expect(interpretAnonymousLink('anon-1', { id: 'anon-1', is_anonymous: false })).toBe('upgraded');
    expect(interpretAnonymousLink('anon-1', { id: 'anon-1', is_anonymous: true })).toBe('confirmationPending');
    expect(interpretAnonymousLink('anon-1', { id: 'other', is_anonymous: false })).toBe('stranded');
    expect(interpretAnonymousLink('anon-1', null)).toBe('unchanged');
    expect(interpretAnonymousLink('anon-1', undefined)).toBe('unchanged');
  });

  it('unknown anonymous flag is pending, never upgraded (fail-closed)', () => {
    // A missing is_anonymous must not present an unconfirmed upgrade
    // as done — the user sees the confirmation notice and signs in
    // after confirming, instead of landing on a password that does
    // not work yet.
    expect(interpretAnonymousLink('anon-1', { id: 'anon-1' })).toBe('confirmationPending');
  });
});

describe('RESET_PASSWORD_REDIRECT_URL', () => {
  it('is the auth/reset-password deep link the reset screen owns', () => {
    expect(RESET_PASSWORD_REDIRECT_URL).toBe('amen-app://auth/reset-password');
  });
});

describe('validateResetPassword', () => {
  it('requires a password of at least 8 characters, matching the sign-up rule', () => {
    expect(validateResetPassword('', '')).not.toBeNull();
    expect(validateResetPassword('short', 'short')).not.toBeNull();
    expect(validateResetPassword('longenough', 'longenough')).toBeNull();
    expect(validateResetPassword('exactly8', 'exactly8')).toBeNull();
  });

  it('rejects mismatched confirmation', () => {
    expect(validateResetPassword('longenough', 'different1')).not.toBeNull();
  });
});

describe('parseRecoveryUrl', () => {
  it('reads a PKCE code from the query string', () => {
    expect(parseRecoveryUrl('amen-app://auth/reset-password?code=abc123')).toEqual({
      kind: 'code',
      code: 'abc123',
    });
  });

  it('reads implicit-flow tokens from the URL fragment', () => {
    expect(
      parseRecoveryUrl(
        'amen-app://auth/reset-password#access_token=at-value&refresh_token=rt-value&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'at-value', refreshToken: 'rt-value' });
  });

  it('reads tokens from the query string too (defensive)', () => {
    expect(
      parseRecoveryUrl('amen-app://auth/reset-password?access_token=at&refresh_token=rt'),
    ).toEqual({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt' });
  });

  it('treats an error redirect as invalid, even when credentials are also present', () => {
    expect(
      parseRecoveryUrl(
        'amen-app://auth/reset-password?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&code=abc123',
      ),
    ).toEqual({
      kind: 'error',
      error: 'access_denied',
      description: 'Email link is invalid or has expired',
    });
    expect(parseRecoveryUrl('amen-app://auth/reset-password#error=access_denied')).toEqual({
      kind: 'error',
      error: 'access_denied',
      description: null,
    });
  });

  it('returns null when the URL carries no recovery material', () => {
    expect(parseRecoveryUrl('amen-app://auth/reset-password')).toBeNull();
    expect(parseRecoveryUrl('amen-app://auth/reset-password?foo=bar')).toBeNull();
    expect(parseRecoveryUrl(null)).toBeNull();
    expect(parseRecoveryUrl(undefined)).toBeNull();
    expect(parseRecoveryUrl('not a url')).toBeNull();
  });

  it('needs both tokens, not just one', () => {
    expect(parseRecoveryUrl('amen-app://auth/reset-password#access_token=only-one')).toBeNull();
  });
});
