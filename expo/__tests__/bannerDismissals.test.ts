// Wave 2, fix 6 (feedback #27): Home banner dismissals persist per
// banner in AsyncStorage, so a dismissed banner stays dismissed.
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
    getAllKeys: async () => [...mockAsyncStore.keys()],
    multiGet: async (keys: string[]) =>
      keys.map((k) => [k, mockAsyncStore.has(k) ? mockAsyncStore.get(k)! : null]),
    multiRemove: async (keys: string[]) => {
      keys.forEach((k) => mockAsyncStore.delete(k));
    },
  },
}));

import {
  dismissHomeBanner,
  homeBannerDismissalKey,
  loadDismissedHomeBanners,
} from '../lib/bannerDismissals';

describe('home banner dismissals', () => {
  beforeEach(() => {
    mockAsyncStore.clear();
  });

  it('keys the reminder banner per suggestion value', () => {
    expect(homeBannerDismissalKey('reminder', '12:00 PM')).toBe('reminder:12:00 PM');
    expect(homeBannerDismissalKey('reminder', '1:00 PM')).not.toBe(
      homeBannerDismissalKey('reminder', '12:00 PM'),
    );
    expect(homeBannerDismissalKey('annual')).toBe('annual');
    expect(homeBannerDismissalKey('reminderSetup')).toBe('reminderSetup');
  });

  it('a dismissed banner loads back as dismissed', async () => {
    await dismissHomeBanner(homeBannerDismissalKey('annual'));
    const dismissed = await loadDismissedHomeBanners();
    expect(dismissed.has('annual')).toBe(true);
    expect(dismissed.has('reminderSetup')).toBe(false);
  });

  it('dismissing one reminder suggestion does not dismiss a different one', async () => {
    await dismissHomeBanner(homeBannerDismissalKey('reminder', '12:00 PM'));
    const dismissed = await loadDismissedHomeBanners();
    expect(dismissed.has('reminder:12:00 PM')).toBe(true);
    expect(dismissed.has('reminder:1:00 PM')).toBe(false);
  });

  it('ignores unrelated storage keys', async () => {
    mockAsyncStore.set('amen_guest_state', '{}');
    await dismissHomeBanner(homeBannerDismissalKey('reminderSetup'));
    const dismissed = await loadDismissedHomeBanners();
    expect([...dismissed].sort()).toEqual(['reminderSetup']);
  });
});
