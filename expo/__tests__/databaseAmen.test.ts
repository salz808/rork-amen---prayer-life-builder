// P0-4 client switch (2026-11-16): amenEcho prefers the new
// increment_prayer_amen RPC and falls back to amen_community_echo
// only when the new function does not exist yet (PostgREST PGRST202 /
// HTTP 404) — the Expo preview runs against the live DB, where
// migration 20261116000002 is not applied yet. Same I/O-boundary
// mock strategy as bugReportUnconfigured.test.ts: the real
// DatabaseService, a stubbed supabase client with a mutable rpc mock.
import { DatabaseService } from '@/lib/database';

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {} },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (mockRpc as unknown as (...a: unknown[]) => unknown)(...args),
  },
  getSafeSession: async () => ({ user: { id: 'user-1' } }),
  hasAnonymousSession: async () => false,
  signInAnonymously: async () => null,
}));

const ECHO_ID = 'echo-123';

const pgrst202Error = {
  code: 'PGRST202',
  message: 'Could not find the function public.increment_prayer_amen(p_prayer_id) in the schema cache.',
  details: null,
  hint: null,
};

describe('DatabaseService.amenEcho — increment_prayer_amen switch', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('(a) new-RPC success returns { success: true, alreadyAmened: false } and never calls the legacy RPC', async () => {
    // increment_prayer_amen RETURNS integer (current amen count).
    mockRpc.mockResolvedValue({ data: 5, error: null });

    await expect(DatabaseService.amenEcho(ECHO_ID)).resolves.toEqual({
      success: true,
      alreadyAmened: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('increment_prayer_amen', { p_prayer_id: ECHO_ID });
  });

  it('(b) PGRST202 falls back to amen_community_echo with the existing behavior', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: pgrst202Error })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(DatabaseService.amenEcho(ECHO_ID)).resolves.toEqual({
      success: true,
      alreadyAmened: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'increment_prayer_amen', { p_prayer_id: ECHO_ID });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'amen_community_echo', { p_echo_id: ECHO_ID });
  });

  it('(b2) an HTTP 404 function-not-found error also falls back to the legacy RPC', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { status: 404, message: 'Not Found' } })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(DatabaseService.amenEcho(ECHO_ID)).resolves.toEqual({
      success: true,
      alreadyAmened: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'amen_community_echo', { p_echo_id: ECHO_ID });
  });

  it('(c) old-RPC unique-violation still maps to alreadyAmened: true', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: pgrst202Error })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "community_amens_pkey"',
        },
      });

    await expect(DatabaseService.amenEcho(ECHO_ID)).resolves.toEqual({
      success: false,
      alreadyAmened: true,
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('a non-not-found error from the new RPC throws without falling back', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Cannot amen your own request' },
    });

    await expect(DatabaseService.amenEcho(ECHO_ID)).rejects.toMatchObject({
      message: 'Cannot amen your own request',
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('increment_prayer_amen', { p_prayer_id: ECHO_ID });
  });
});
