// D1 (2026-11-17, ChatGPT second-opinion audit): the anonymous
// 13+ attestation is no longer device-local only —
// DatabaseService.recordAnonymousAgeAttestation stamps the local
// AsyncStorage map AND best-effort calls the record_age_attestation
// RPC when an anonymous session exists, never throwing on RPC failure.
// Same I/O-boundary mock strategy as databaseAmen.test.ts (real
// DatabaseService, stubbed supabase client) plus the AsyncStorage-map
// mock pattern from wallTerms.test.ts. Storage keys are the literals
// from lib/anonymousAgeAttestation.ts (not exported).
import { DatabaseService } from '@/lib/database';

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {} },
}));

const mockAsyncStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => (mockAsyncStore.has(key) ? mockAsyncStore.get(key)! : null),
    setItem: async (key: string, value: string) => {
      mockAsyncStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockAsyncStore.delete(key);
    },
    multiRemove: async () => undefined,
  },
}));

const mockRpc = jest.fn();
const mockGetSafeSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => (mockRpc as unknown as (...a: unknown[]) => unknown)(...args),
  },
  getSafeSession: (...args: unknown[]) =>
    (mockGetSafeSession as unknown as (...a: unknown[]) => unknown)(...args),
  hasAnonymousSession: async () => false,
  signInAnonymously: async () => null,
}));

const ANON_AGE_MAP_KEY = 'triad_anon_age_attested_v1';
const ANON_AGE_PENDING_KEY = 'triad_anon_age_attested_pending_v1';
const ANON_USER = { id: 'anon-1', is_anonymous: true };

describe('DatabaseService.recordAnonymousAgeAttestation — server record (D1)', () => {
  beforeEach(() => {
    mockAsyncStore.clear();
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    mockGetSafeSession.mockReset().mockResolvedValue({ user: ANON_USER });
  });

  it('stamps the local map under the anonymous id AND calls the record_age_attestation RPC', async () => {
    await expect(DatabaseService.recordAnonymousAgeAttestation()).resolves.toBeUndefined();

    const map = JSON.parse(mockAsyncStore.get(ANON_AGE_MAP_KEY) ?? '{}') as Record<string, boolean>;
    expect(map[ANON_USER.id]).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('record_age_attestation');
  });

  it('does not throw and still stamps the local map when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(DatabaseService.recordAnonymousAgeAttestation()).resolves.toBeUndefined();
    const map = JSON.parse(mockAsyncStore.get(ANON_AGE_MAP_KEY) ?? '{}') as Record<string, boolean>;
    expect(map[ANON_USER.id]).toBe(true);
  });

  it('does not throw and still stamps the local map when the RPC call itself rejects', async () => {
    mockRpc.mockRejectedValue(new Error('Network request failed'));

    await expect(DatabaseService.recordAnonymousAgeAttestation()).resolves.toBeUndefined();
    const map = JSON.parse(mockAsyncStore.get(ANON_AGE_MAP_KEY) ?? '{}') as Record<string, boolean>;
    expect(map[ANON_USER.id]).toBe(true);
  });

  it('with no session yet: sets the pending flag and does not call the RPC', async () => {
    mockGetSafeSession.mockResolvedValue(null);

    await expect(DatabaseService.recordAnonymousAgeAttestation()).resolves.toBeUndefined();
    expect(mockAsyncStore.get(ANON_AGE_PENDING_KEY)).toBe('1');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('signed-in session: no-op — no map stamp, no RPC call', async () => {
    mockGetSafeSession.mockResolvedValue({ user: { id: 'user-1', is_anonymous: false } });

    await expect(DatabaseService.recordAnonymousAgeAttestation()).resolves.toBeUndefined();
    expect(mockAsyncStore.has(ANON_AGE_MAP_KEY)).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
