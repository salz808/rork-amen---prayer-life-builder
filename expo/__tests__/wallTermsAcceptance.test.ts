// D2 (2026-11-17, ChatGPT second-opinion audit): the Wall Terms
// acceptance is recorded server-side via record_wall_terms_acceptance,
// best-effort — it must NEVER throw, so a missing RPC (staged
// migration not yet applied) or a network failure can never break the
// first-post flow. Same I/O-boundary mock strategy as
// databaseAmen.test.ts: the real DatabaseService, a stubbed supabase
// client with a mutable rpc mock.
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

describe('DatabaseService.recordWallTermsAcceptance — server record (D2)', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('calls record_wall_terms_acceptance with the version and resolves', async () => {
    await expect(DatabaseService.recordWallTermsAcceptance('v1')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('record_wall_terms_acceptance', { p_version: 'v1' });
  });

  it('never throws when the RPC does not exist yet (PGRST202)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.record_wall_terms_acceptance(p_version) in the schema cache.',
      },
    });

    await expect(DatabaseService.recordWallTermsAcceptance('v1')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('record_wall_terms_acceptance', { p_version: 'v1' });
  });

  it('never throws on a network error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });

    await expect(DatabaseService.recordWallTermsAcceptance('v1')).resolves.toBeUndefined();
  });

  it('never throws when the RPC call itself rejects', async () => {
    mockRpc.mockRejectedValue(new Error('fetch failed'));

    await expect(DatabaseService.recordWallTermsAcceptance('v1')).resolves.toBeUndefined();
  });
});
