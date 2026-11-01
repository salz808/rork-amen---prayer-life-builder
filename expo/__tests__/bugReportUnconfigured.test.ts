// Build 8 fix: when the Supabase client is unconfigured, submitting a bug
// report must fail visibly instead of silently succeeding. The form screen
// maps the thrown 'Supabase is not configured' error to a visible error
// message and stays on the form (never the 'done' success state).
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

jest.mock('@/lib/supabase', () => ({
  supabase: null,
  getSafeSession: async () => null,
  hasAnonymousSession: async () => false,
  signInAnonymously: async () => null,
}));

import { DatabaseService } from '@/lib/database';

describe('submitBugReport when Supabase is unconfigured', () => {
  it('throws instead of silently succeeding', async () => {
    await expect(DatabaseService.submitBugReport('App crashed on open')).rejects.toThrow(
      'Supabase is not configured',
    );
  });
});
