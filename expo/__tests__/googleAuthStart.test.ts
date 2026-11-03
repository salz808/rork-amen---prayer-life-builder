// Wave 2, fix 8: unlike Apple, a non-conflict Google linkIdentity
// error had NO fallback to plain sign-in, so anonymous-user Google
// sign-in failed outright. Every link failure must now fall through
// to signInWithOAuth; the conflict path's outcome is unchanged (it
// already fell through).
import { resolveGoogleAuthStart, type GoogleAuthStartClient } from '../lib/googleAuth';

function fakeClient(overrides: Partial<GoogleAuthStartClient['auth']> = {}): {
  client: GoogleAuthStartClient;
  linkIdentity: jest.Mock;
  signInWithOAuth: jest.Mock;
} {
  const linkIdentity = jest.fn(async () => ({ data: { url: 'https://link.test' } }));
  const signInWithOAuth = jest.fn(async () => ({ data: { url: 'https://signin.test' } }));
  const client: GoogleAuthStartClient = {
    auth: { linkIdentity, signInWithOAuth, ...overrides },
  };
  return { client, linkIdentity, signInWithOAuth };
}

describe('resolveGoogleAuthStart', () => {
  it('signs in directly when not anonymous (no link attempt)', async () => {
    const { client, linkIdentity, signInWithOAuth } = fakeClient();
    const result = await resolveGoogleAuthStart(client, false, 'amen-app://auth/callback');
    expect(linkIdentity).not.toHaveBeenCalled();
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ url: 'https://signin.test' });
  });

  it('returns the link result when linking succeeds', async () => {
    const { client, linkIdentity, signInWithOAuth } = fakeClient();
    const result = await resolveGoogleAuthStart(client, true, 'amen-app://auth/callback');
    expect(linkIdentity).toHaveBeenCalledTimes(1);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(result.data).toEqual({ url: 'https://link.test' });
  });

  it('falls through to plain sign-in on an identity-conflict error (unchanged behaviour)', async () => {
    const { client, signInWithOAuth } = fakeClient({
      linkIdentity: jest.fn(async () => ({
        error: new Error('Identity is already linked to another user'),
      })),
    });
    await resolveGoogleAuthStart(client, true, 'amen-app://auth/callback');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('falls through to plain sign-in on a NON-conflict link error (the fix)', async () => {
    const { client, signInWithOAuth } = fakeClient({
      linkIdentity: jest.fn(async () => ({ error: new Error('Network request failed') })),
    });
    const result = await resolveGoogleAuthStart(client, true, 'amen-app://auth/callback');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ url: 'https://signin.test' });
  });

  it('falls through to plain sign-in when linkIdentity throws (the fix)', async () => {
    const { client, signInWithOAuth } = fakeClient({
      linkIdentity: jest.fn(async () => {
        throw new Error('link exploded');
      }),
    });
    await resolveGoogleAuthStart(client, true, 'amen-app://auth/callback');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });
});
