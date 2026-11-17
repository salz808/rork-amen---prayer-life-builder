// GPT-6 item 11 (2026-11-16): getUserAmenedEchoIds reads the amen
// ledger through the caller-only get_my_amened_prayer_ids RPC and
// falls back to the legacy community_amens read only when the new
// function does not exist yet (PostgREST PGRST202 / HTTP 404) —
// same I/O-boundary mock strategy as databaseAmen.test.ts: the real
// DatabaseService, a stubbed supabase client with mutable rpc/from
// mocks.
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
const mockGetSafeSession = jest.fn<Promise<{ user: { id: string } } | null>, unknown[]>();
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (mockRpc as unknown as (...a: unknown[]) => unknown)(...args),
    from: (...args: unknown[]) => (mockFrom as unknown as (...a: unknown[]) => unknown)(...args),
  },
  getSafeSession: (...args: unknown[]) => (mockGetSafeSession as unknown as (...a: unknown[]) => unknown)(...args),
  hasAnonymousSession: async () => false,
  signInAnonymously: async () => null,
}));

const pgrst202Error = {
  code: 'PGRST202',
  message: 'Could not find the function public.get_my_amened_prayer_ids(uuid[]) in the schema cache.',
  details: null,
  hint: null,
};

describe('DatabaseService.getUserAmenedEchoIds — get_my_amened_prayer_ids switch', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockGetSafeSession.mockReset();
    mockGetSafeSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('(a) new-RPC success with page ids returns the amened set and passes the ids through', async () => {
    mockRpc.mockResolvedValue({
      data: [{ prayer_id: 'echo-1' }, { prayer_id: 'echo-2' }],
      error: null,
    });

    await expect(DatabaseService.getUserAmenedEchoIds(['echo-1', 'echo-2', 'echo-3'])).resolves.toEqual(
      new Set(['echo-1', 'echo-2']),
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_my_amened_prayer_ids', {
      p_prayer_ids: ['echo-1', 'echo-2', 'echo-3'],
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(b) no ids passes null (unbounded legacy behavior) and returns the whole history', async () => {
    mockRpc.mockResolvedValue({ data: [{ prayer_id: 'echo-9' }], error: null });

    await expect(DatabaseService.getUserAmenedEchoIds()).resolves.toEqual(new Set(['echo-9']));
    expect(mockRpc).toHaveBeenCalledWith('get_my_amened_prayer_ids', { p_prayer_ids: null });
  });

  it('(c) an empty id list returns an empty set without any RPC call', async () => {
    await expect(DatabaseService.getUserAmenedEchoIds([])).resolves.toEqual(new Set());
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(d) PGRST202 falls back to the legacy community_amens read', async () => {
    const mockIn = jest.fn().mockResolvedValue({ data: [{ echo_id: 'legacy-1' }], error: null });
    const mockEq = jest.fn(() => ({ in: mockIn }));
    const mockSelect = jest.fn(() => ({ eq: mockEq }));
    mockFrom.mockReturnValue({ select: mockSelect });
    mockRpc.mockResolvedValueOnce({ data: null, error: pgrst202Error });

    await expect(DatabaseService.getUserAmenedEchoIds(['legacy-1', 'legacy-2'])).resolves.toEqual(
      new Set(['legacy-1']),
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_my_amened_prayer_ids', {
      p_prayer_ids: ['legacy-1', 'legacy-2'],
    });
    expect(mockFrom).toHaveBeenCalledWith('community_amens');
    expect(mockIn).toHaveBeenCalledWith('echo_id', ['legacy-1', 'legacy-2']);
  });

  it('(e) a non-PGRST202 RPC error fails to an empty set and never touches the legacy table', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(DatabaseService.getUserAmenedEchoIds(['echo-1'])).resolves.toEqual(new Set());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(f) no session returns an empty set without any RPC call', async () => {
    mockGetSafeSession.mockResolvedValue(null);

    await expect(DatabaseService.getUserAmenedEchoIds(['echo-1'])).resolves.toEqual(new Set());
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
