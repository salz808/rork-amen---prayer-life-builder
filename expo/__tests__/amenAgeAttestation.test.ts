// D1 (2026-11-17, ChatGPT second-opinion audit): amenEcho must surface
// a missing age attestation as AGE_ATTESTATION_REQUIRED instead of a
// generic RPC error, on BOTH RPC paths — the new increment_prayer_amen
// RPC and the legacy amen_community_echo fallback — so the Wall can
// prompt the 13+ attestation instead of showing a failed Amen.
// Same I/O-boundary mock strategy as databaseAmen.test.ts: the real
// DatabaseService, a stubbed supabase client with a mutable rpc mock.
import { DatabaseService, AGE_ATTESTATION_REQUIRED_ERROR } from '@/lib/database';

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

const ageAttestationError = {
  code: 'P0001',
  message: 'Age attestation required: confirm you are 13 or older before Amens',
  details: null,
  hint: null,
};

describe('DatabaseService.amenEcho — age attestation (D1)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('throws AGE_ATTESTATION_REQUIRED_ERROR when increment_prayer_amen reports a missing attestation', async () => {
    mockRpc.mockResolvedValue({ data: null, error: ageAttestationError });

    let caught: unknown;
    try {
      await DatabaseService.amenEcho(ECHO_ID);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(AGE_ATTESTATION_REQUIRED_ERROR);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('increment_prayer_amen', { p_prayer_id: ECHO_ID });
  });

  it('throws AGE_ATTESTATION_REQUIRED_ERROR when the legacy amen_community_echo path reports a missing attestation', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: pgrst202Error })
      .mockResolvedValueOnce({ data: null, error: ageAttestationError });

    let caught: unknown;
    try {
      await DatabaseService.amenEcho(ECHO_ID);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(AGE_ATTESTATION_REQUIRED_ERROR);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'amen_community_echo', { p_echo_id: ECHO_ID });
  });
});
