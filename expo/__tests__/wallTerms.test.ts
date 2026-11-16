// P1-6 (2026-11-16): the first wall post requires an explicit Terms
// of Use acceptance, recorded once per device. Same AsyncStorage-mock
// pattern as bannerDismissals.test.ts.
import {
  hasAcceptedWallTerms,
  recordWallTermsAccepted,
  WALL_TERMS_ACCEPTED_KEY,
  WALL_TERMS_URL,
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

describe('wall Terms of Use acceptance', () => {
  beforeEach(() => {
    mockAsyncStore.clear();
  });

  it('starts unaccepted', async () => {
    await expect(hasAcceptedWallTerms()).resolves.toBe(false);
  });

  it('records acceptance once and reads it back', async () => {
    await recordWallTermsAccepted();
    await expect(hasAcceptedWallTerms()).resolves.toBe(true);
    expect(mockAsyncStore.get(WALL_TERMS_ACCEPTED_KEY)).toBe('1');
  });

  it('points at the live Terms of Use URL', () => {
    expect(WALL_TERMS_URL).toBe('https://tearsandoil.com/triadterms');
  });
});
