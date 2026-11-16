// P0-5 (2026-11-16): the native Apple authorization code is handed to
// the store-apple-token edge function best-effort — sign-in must never
// fail because token storage did.
import { storeAppleAuthorizationCode } from '../lib/appleToken';

const mockInvoke = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe('storeAppleAuthorizationCode', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('invokes store-apple-token with the code and reports success', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(storeAppleAuthorizationCode('auth-code-123')).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('store-apple-token', {
      body: { authorizationCode: 'auth-code-123' },
    });
  });

  it('returns false without invoking when the code is empty', async () => {
    await expect(storeAppleAuthorizationCode('')).resolves.toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns false (never throws) when the function answers with an error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('not configured') });
    await expect(storeAppleAuthorizationCode('auth-code-123')).resolves.toBe(false);
  });

  it('returns false (never throws) when the mockInvoke itself throws', async () => {
    mockInvoke.mockRejectedValue(new Error('Network request failed'));
    await expect(storeAppleAuthorizationCode('auth-code-123')).resolves.toBe(false);
  });
});
