// P1-3 / P1-4 track tests: date clamps, phase-duration formatting,
// and the TTS abort-signal wire-through.
//
// Production code reads the RN global __DEV__; jest does not define it.
(global as unknown as { __DEV__: boolean }).__DEV__ = true;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.0' },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  View: () => null,
  Text: () => null,
  ScrollView: () => null,
  Animated: { Value: jest.fn(), View: () => null },
  Pressable: () => null,
  Modal: () => null,
  Share: { share: jest.fn() },
  Alert: { alert: jest.fn() },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ write: jest.fn(), uri: 'file:///cache/tts_test.mp3' })),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('expo-file-system/legacy', () => ({ readDirectoryAsync: jest.fn(async () => []) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({})),
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/providers/AppProvider', () => ({
  useApp: jest.fn(() => ({})),
  AppProvider: () => null,
}));
jest.mock('@/hooks/useColors', () => ({ useColors: jest.fn(() => ({})) }));
jest.mock('@/hooks/useTypography', () => ({ useTypography: jest.fn(() => ({})) }));
jest.mock('@/constants/fonts', () => ({ Fonts: new Proxy({}, { get: () => 'System' }) }));
jest.mock('@/mocks/content', () => ({
  getDayContent: jest.fn(),
  getDeclarationText: jest.fn(),
}));
jest.mock('@/components/AnimatedPressable', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/FeatureLockSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/entitlements', () => ({ getFeatureRequirement: jest.fn() }));

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/x.mp3' } }) }),
    },
    from: () => ({ upsert: jest.fn(async () => ({ error: null })) }),
  },
  getSafeSession: jest.fn(async () => null),
  hasAnonymousSession: jest.fn(async () => false),
  signInAnonymously: jest.fn(),
}));
jest.mock('@/lib/anonymousAgeAttestation', () => ({
  clearAnonymousAgeAttestationPending: jest.fn(),
  consumeAnonymousAgeAttestationPending: jest.fn(),
  getAnonymousAgeAttestation: jest.fn(),
  recordAnonymousAgeAttestation: jest.fn(),
}));
jest.mock('@/lib/crashReporter', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/dailyPrayer', () => ({ DAILY_PRAYER_CLOUD_SYNC_ENABLED: false }));
jest.mock('@/lib/bugReport', () => ({
  buildBugReportDiagnostics: jest.fn(),
  validateBugReportDescription: jest.fn(),
}));
jest.mock('@/services/narration', () => ({
  getBakedAudioUrl: jest.fn(async () => null),
  SPEED_SESSION: 92,
}));

// jest.mock calls above are hoisted, so these imports must follow them.
// eslint-disable-next-line import/first
import { clampLastCompletedDate } from '../lib/database';
// eslint-disable-next-line import/first
import { formatPhaseSeconds } from '../components/InsightsView';
// eslint-disable-next-line import/first
import { prayerDayKey } from '../lib/prayerDay';
// eslint-disable-next-line import/first
import { getGoogleTTSAudio } from '../services/tts';

describe('clampLastCompletedDate (P1-3a)', () => {
  it('clamps a future date to today', () => {
    expect(clampLastCompletedDate('2026-11-17', '2026-11-16')).toBe('2026-11-16');
  });

  it('passes today and past dates through untouched', () => {
    expect(clampLastCompletedDate('2026-11-16', '2026-11-16')).toBe('2026-11-16');
    expect(clampLastCompletedDate('2026-11-15', '2026-11-16')).toBe('2026-11-15');
  });

  it('passes null through', () => {
    expect(clampLastCompletedDate(null, '2026-11-16')).toBeNull();
  });

  it('defaults "today" to the local prayer day, not the UTC date', () => {
    // A far-future value clamps to whatever prayerDayKey() says today
    // is — the local 4 AM-boundary day, never a UTC calendar date.
    expect(clampLastCompletedDate('2999-01-01')).toBe(prayerDayKey());
    expect(clampLastCompletedDate('2000-01-01')).toBe('2000-01-01');
  });
});

describe('formatPhaseSeconds (P1-3c)', () => {
  it('floors the seconds remainder — 59.6s is "59s", never "60s"', () => {
    expect(formatPhaseSeconds(59.6)).toBe('59s');
    expect(formatPhaseSeconds(59.9)).toBe('59s');
    expect(formatPhaseSeconds(59)).toBe('59s');
  });

  it('carries into minutes at 60s', () => {
    expect(formatPhaseSeconds(60)).toBe('1m');
    expect(formatPhaseSeconds(119.6)).toBe('1m');
    expect(formatPhaseSeconds(150)).toBe('2m');
  });

  it('renders zero as "0m"', () => {
    expect(formatPhaseSeconds(0)).toBe('0m');
  });
});

describe('getGoogleTTSAudio abort signal (P1-4a)', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes the AbortController signal to functions.invoke', async () => {
    mockInvoke.mockResolvedValue({
      data: { audioContent: 'aGVsbG8=' },
      error: null,
    });
    const url = await getGoogleTTSAudio('hello world', 'signal-key-1');
    expect(url).toBe('file:///cache/tts_test.mp3');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const options = mockInvoke.mock.calls[0][1] as { signal?: unknown };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect((options.signal as AbortSignal).aborted).toBe(false);
  });

  it('aborts the in-flight request when the 12s timeout fires', async () => {
    jest.useFakeTimers();
    // Never resolves: the real edge client would reject on abort, but
    // the mock only needs to prove the signal itself flips.
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    const pending = getGoogleTTSAudio('hello world', 'abort-key-1');
    await jest.advanceTimersByTimeAsync(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const options = mockInvoke.mock.calls[0][1] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(12000);
    expect(options.signal?.aborted).toBe(true);
    // The request never settles under the never-resolving mock; drop
    // the reference so the pending promise cannot leak into other tests.
    void pending;
  });
});
