// D2 (2026-11-17, ChatGPT second-opinion audit): accepting the Wall
// Terms sets the local flag AND attempts the server record via
// DatabaseService.recordWallTermsAcceptance(WALL_TERMS_VERSION). The
// server attempt is best-effort: a failed record must never lose the
// local acceptance or throw. Same AsyncStorage-map mock pattern as
// wallTerms.test.ts; the DatabaseService is mocked (its own tests in
// wallTermsAcceptance.test.ts cover the RPC call).
import {
  hasAcceptedWallTerms,
  recordWallTermsAccepted,
  WALL_TERMS_ACCEPTED_KEY,
  WALL_TERMS_VERSION,
} from '../lib/wallTerms';

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
  },
}));

const mockRecordWallTermsAcceptance = jest.fn();
jest.mock('@/lib/database', () => ({
  DatabaseService: {
    recordWallTermsAcceptance: (...args: unknown[]) =>
      (mockRecordWallTermsAcceptance as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

describe('wall Terms of Use acceptance — server record (D2)', () => {
  beforeEach(() => {
    mockAsyncStore.clear();
    mockRecordWallTermsAcceptance.mockReset().mockResolvedValue(undefined);
  });

  it('WALL_TERMS_VERSION is v1', () => {
    expect(WALL_TERMS_VERSION).toBe('v1');
  });

  it('sets the local flag and attempts the server record with the version', async () => {
    await recordWallTermsAccepted();

    expect(mockAsyncStore.get(WALL_TERMS_ACCEPTED_KEY)).toBe('1');
    await expect(hasAcceptedWallTerms()).resolves.toBe(true);
    expect(mockRecordWallTermsAcceptance).toHaveBeenCalledTimes(1);
    expect(mockRecordWallTermsAcceptance).toHaveBeenCalledWith(WALL_TERMS_VERSION);
  });

  it('keeps the local flag and does not throw when the server record fails', async () => {
    mockRecordWallTermsAcceptance.mockRejectedValue(new Error('Network request failed'));

    await expect(recordWallTermsAccepted()).resolves.toBeUndefined();
    expect(mockAsyncStore.get(WALL_TERMS_ACCEPTED_KEY)).toBe('1');
    await expect(hasAcceptedWallTerms()).resolves.toBe(true);
  });
});
