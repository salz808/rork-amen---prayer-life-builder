// P1-3d: the Profile "MINUTES IN PRAYER" tile must not read "0" for a
// real sub-minute prayer.
//
// Production code reads the RN global __DEV__; jest does not define it.
(global as unknown as { __DEV__: boolean }).__DEV__ = true;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.0' },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  View: () => null,
  Text: () => null,
  ScrollView: () => null,
  TextInput: () => null,
  Alert: { alert: jest.fn() },
  ActivityIndicator: () => null,
  KeyboardAvoidingView: () => null,
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({})),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: () => null }));
jest.mock('@/components/BackgroundGradient', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-haptics', () => ({}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/providers/AppProvider', () => ({
  useApp: jest.fn(() => ({})),
  AppProvider: () => null,
}));
jest.mock('@/hooks/useColors', () => ({ useColors: jest.fn(() => ({})) }));
jest.mock('@/hooks/useTypography', () => ({ useTypography: jest.fn(() => ({})) }));
jest.mock('@/constants/fonts', () => ({ Fonts: new Proxy({}, { get: () => 'System' }) }));
jest.mock('@/components/GlowButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AnimatedPressable', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/InsightsView', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  getSafeSession: jest.fn(async () => null),
}));
jest.mock('@/lib/crashReporter', () => ({ reportError: jest.fn() }));

// jest.mock calls above are hoisted, so this import must follow them.
// eslint-disable-next-line import/first
import { formatPrayerMinutes } from '../app/profile';

describe('formatPrayerMinutes (P1-3d)', () => {
  it('reads "<1" for a real prayer under 30s instead of "0"', () => {
    expect(formatPrayerMinutes(20)).toBe('<1');
    expect(formatPrayerMinutes(1)).toBe('<1');
    expect(formatPrayerMinutes(29)).toBe('<1');
  });

  it('reads "0" only when nothing was prayed', () => {
    expect(formatPrayerMinutes(0)).toBe('0');
  });

  it('rounds normally once a minute is reached', () => {
    expect(formatPrayerMinutes(40)).toBe('1');
    expect(formatPrayerMinutes(90)).toBe('2');
    expect(formatPrayerMinutes(3600)).toBe('60');
  });
});
