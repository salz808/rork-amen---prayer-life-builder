// Route-known signal for the launch splash (2026-11-17):
// `isUserLoaded` from AppProvider (providers/AppProvider.tsx).
//
// Why this file tests a reducer, not the provider: no provider-render
// test exists in this repo — AppProvider pulls in Purchases / NetInfo /
// notifications and cannot render under node Jest (see the note in
// __tests__/dailyPrayer.test.ts). The repo convention is to pin the
// helper the provider calls, so these tests pin `userLoadGateReducer`,
// the pure transition function the provider drives with useReducer
// (initial state false), and document the two call sites that must
// stay wired for the contract to hold in the app:
//
//   - `load-settled` — dispatched ONLY on the guarded hydration apply
//     path (after the generation check and the live-session user
//     check). That path runs for a successful load AND for a failed
//     load, because the state query's queryFn catches every failure
//     and resolves with defaultState (flagging stateLoadFailed) — so
//     "failed load" settles the signal exactly like "successful load":
//     known, no profile, onboardingComplete at whatever the load
//     produced (default false). The signal can never hang the splash
//     on a failed load.
//   - `reload-started` — dispatched in the SIGNED_IN branch before the
//     refetch, while handleUserUpdate has already defaulted
//     onboardingComplete to false. The signal stays false until the
//     reload's data is applied (next `load-settled`), so the splash
//     waits out the reload and the first screen shown is the route
//     the cloud profile actually names.
//
// A stale settle cannot resurrect the signal: the provider dispatches
// `load-settled` only after the generation guard, so a settle for a
// superseded sign-in never reaches this reducer while a newer reload
// is pending. That guard lives in the provider, not here — the
// sequence in "fresh-sign-in reload" below is the contract it must
// preserve.
//
// The mocks below exist only so this test can import the reducer from
// the real provider module: AppProvider's import graph pulls in
// native/ESM modules node Jest cannot load (Purchases,
// create-context-hook's ESM build, NetInfo, expo-router, SecureStore,
// expo-constants via database/crashReporter). The hook itself never
// runs here — only the exported reducer is exercised — so every mock
// is a bare import-time stub, never a behaviour double.
// NOTE: imports sit above the jest.mock calls for import/first;
// babel-plugin-jest-hoist still hoists the mock registrations above
// them in the compiled output, so mocking is unaffected.
import { userLoadGateReducer } from '@/providers/AppProvider';

// React Native defines __DEV__ globally; node jest does not. The module
// under test reads it in log paths, so define it here (false = prod).
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('@nkzw/create-context-hook', () => ({
  __esModule: true,
  default: () => [() => null, () => null],
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true })),
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
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
    multiRemove: async (keys: string[]) => {
      keys.forEach((key) => mockAsyncStore.delete(key));
    },
  },
}));

jest.mock('@/lib/supabase', () => ({
  getSafeSession: jest.fn(async () => null),
  supabase: null,
}));

jest.mock('@/lib/database', () => ({
  DatabaseService: class {
    static lastSyncFailed = false;
    static lastLoadFailed = false;
    static getAgeAttested: jest.Mock = jest.fn(async () => false);
    static syncAppState: jest.Mock = jest.fn(async () => undefined);
    static loadAppState: jest.Mock = jest.fn(async () => null);
    static clearLoadSnapshot: jest.Mock = jest.fn();
    static bumpSyncGeneration: jest.Mock = jest.fn();
  },
}));

jest.mock('@/lib/syncService', () => ({
  SyncService: class {
    static hydrationPending = false;
    static hydrationUserId: string | null = null;
    static suppressSync = false;
  },
}));

jest.mock('@/lib/sync/appSync', () => ({
  AppSync: { suppressSync: false },
}));

jest.mock('@/lib/crashReporter', () => ({
  reportError: jest.fn(),
}));

jest.mock('@/lib/truthWidget', () => ({
  refreshTruthWidget: jest.fn(async () => undefined),
}));

jest.mock('@/lib/secureStorage', () => ({
  deleteStoredEncryptionKey: jest.fn(async () => undefined),
  clearStoredAuthSession: jest.fn(async () => undefined),
}));

jest.mock('@/lib/deleteAccount', () => ({
  isRecentLogin: jest.fn(() => false),
  isRecentLoginError: jest.fn(() => false),
}));

jest.mock('@/lib/clearGuestActivity', () => ({
  consumeGuestClearKeepLocalMarker: jest.fn(async () => false),
}));

jest.mock('@/lib/appQueryClient', () => ({
  clearAppQueryCache: jest.fn(),
}));

jest.mock('@/lib/appStoreReview', () => ({
  getWriteReviewUrl: jest.fn(() => null),
  showAppReviewPrompt: jest.fn(),
}));

jest.mock('@/services/entitlements', () => ({
  getTierFromEntitlements: jest.fn(() => 0),
  hasFeature: jest.fn(() => false),
  normalizeEntitlements: jest.fn(() => []),
}));

describe('isUserLoaded route-known signal', () => {
  it('starts unknown: false before any load settles', () => {
    // The provider passes `false` as the useReducer initial state.
    // A reload-started event before any settle must not flip it true.
    expect(userLoadGateReducer(false, { type: 'reload-started' })).toBe(false);
  });

  it('becomes true after a successful load settles', () => {
    expect(userLoadGateReducer(false, { type: 'load-settled' })).toBe(true);
  });

  it('becomes true after a FAILED load settles — known: no profile, never hung', () => {
    // There is no separate failure event: the provider dispatches
    // `load-settled` from the hydration apply path for both outcomes,
    // because the queryFn catches failures and resolves with
    // defaultState. A network error or a missing profile row must
    // therefore resolve the signal, with onboardingComplete left at
    // whatever the load produced (default false) — the splash may
    // lift onto onboarding for a genuinely new user, never hang.
    expect(userLoadGateReducer(false, { type: 'load-settled' })).toBe(true);
  });

  it('fresh-sign-in reload: true -> false while the reload is in flight -> true when it lands', () => {
    // A veteran is mid-session (route known) when a fresh SIGNED_IN
    // arrives: handleUserUpdate defaults onboardingComplete to false
    // and the provider dispatches reload-started before the refetch.
    let loaded = true;
    loaded = userLoadGateReducer(loaded, { type: 'reload-started' });
    expect(loaded).toBe(false);
    // While false the splash must not lift: the flag is still the
    // optimistic false, not the cloud value.
    loaded = userLoadGateReducer(loaded, { type: 'reload-started' });
    expect(loaded).toBe(false);
    // The reload lands and the hydration effect applies the cloud
    // profile (onboardingComplete true for the veteran): known again.
    loaded = userLoadGateReducer(loaded, { type: 'load-settled' });
    expect(loaded).toBe(true);
  });

  it('is idempotent: repeat settles stay true, repeat reload-starts stay false', () => {
    expect(userLoadGateReducer(true, { type: 'load-settled' })).toBe(true);
    expect(userLoadGateReducer(false, { type: 'reload-started' })).toBe(false);
  });

  it('a settle after the initial load — e.g. a foreground refetch — keeps the route known', () => {
    // Only the SIGNED_IN reload branch resets the signal; background
    // refetches (foreground after a load failure) settle without
    // ever marking the route unknown, so the splash is never
    // re-gated once it has lifted.
    expect(userLoadGateReducer(true, { type: 'load-settled' })).toBe(true);
  });
});
