// Wave-1 guest fix (#10) tests for SyncService guest persistence +
// sign-in migration. Same I/O-boundary mock strategy as
// syncServiceRound5.test.ts: AsyncStorage is a Map, database/supabase
// are stubbed, react-native is stubbed to just the AppState surface
// startAutoSync touches. The session mock is MUTABLE (unlike the
// round-5 file) because these tests drive the no-session -> signed-in
// transition that the migration exists for.
// NOTE: imports sit above the jest.mock calls for import/first;
// babel-plugin-jest-hoist still hoists the mock registrations above
// them in the compiled output, so mocking is unaffected.
import { SyncService } from '@/lib/syncService';
import { DatabaseService } from '@/lib/database';
import type { AppState, UserProfile } from '@/types';

// React Native defines __DEV__ globally; node jest does not. The module
// under test reads it in log paths, so define it here (false = prod).
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

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

jest.mock('@/lib/database', () => ({
  DatabaseService: class {
    static lastSyncFailed = false;
    static lastLoadFailed = false;
    static syncAppState: jest.Mock = jest.fn(async () => undefined);
    static loadAppState: jest.Mock = jest.fn(async () => null);
    static clearLoadSnapshot: jest.Mock = jest.fn();
    static bumpSyncGeneration: jest.Mock = jest.fn();
  },
}));

// Mutable session: tests set the current session (null = guest) before
// each act step. The mock* prefix is what lets the factory reference it.
const mockGetSafeSession = jest.fn(async (): Promise<{ user: { id: string } } | null> => null);
jest.mock('@/lib/supabase', () => ({
  getSafeSession: (...args: unknown[]) => (mockGetSafeSession as unknown as (...a: unknown[]) => unknown)(...args),
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const MAIN_KEY = 'amen_app_state';
const OWNER_KEY = 'amen_state_owner';
const GUEST_KEY = 'amen_guest_state';
const MARKER_KEY = 'amen_migration_source_id';

function noonIso(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
}

function sevenDayProgress() {
  return Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    completed: true,
    completedAt: noonIso(`2026-10-${String(20 + i).padStart(2, '0')}`),
    duration: 300,
  }));
}

function guestState(overrides: Partial<AppState> = {}): AppState {
  return {
    user: {
      firstName: 'Kai',
      prayerLife: 'growing',
      onboardingComplete: true,
      reminderTime: '8:00 AM',
    } as UserProfile,
    currentDay: 8,
    progress: sevenDayProgress(),
    streakCount: 7,
    lastCompletedDate: '2026-10-26',
    journeyComplete: false,
    reflections: [],
    prayerRequests: [],
    answeredPrayers: [],
    dailyPrayerLog: [],
    declarationFavorites: [],
    firstStepsCompletedIds: [],
    carriedPrayers: [],
    wallAmenedLocal: [],
    connectionCheckins: [],
    graceDaysUsed: [],
    journeyPass: 1,
    ...overrides,
  } as unknown as AppState;
}

function defaultState(): AppState {
  return {
    user: null,
    currentDay: 1,
    progress: [],
    streakCount: 0,
    journeyPass: 1,
  } as unknown as AppState;
}

function setSession(userId: string | null): void {
  mockGetSafeSession.mockImplementation(async () => (userId ? { user: { id: userId } } : null));
}

beforeEach(() => {
  mockAsyncStore.clear();
  mockGetSafeSession.mockReset();
  setSession(null);
  (DatabaseService.loadAppState as unknown as jest.Mock).mockReset();
  (DatabaseService.loadAppState as unknown as jest.Mock).mockResolvedValue(null);
  (DatabaseService as unknown as { lastLoadFailed: boolean }).lastLoadFailed = false;
  (DatabaseService as unknown as { lastSyncFailed: boolean }).lastSyncFailed = false;
  SyncService.hydrationPending = false;
});

describe('guest persistence (no session)', () => {
  it('writes guest progress to the guest key, never the main key, and reads it back', async () => {
    await SyncService.saveLocalState(guestState());
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(true);
    expect(mockAsyncStore.has(MAIN_KEY)).toBe(false);
    expect(mockAsyncStore.has(OWNER_KEY)).toBe(false);

    const loaded = await SyncService.loadLocalState();
    expect(loaded).not.toBeNull();
    expect(loaded!.progress.filter((p) => p.completed)).toHaveLength(7);
    expect(loaded!.currentDay).toBe(8);
  });

  it('sanitizes subscription fields on the guest blob too', async () => {
    const state = guestState({ isSubscriber: true, tierLevel: 2 } as Partial<AppState>);
    await SyncService.saveLocalState(state);
    const loaded = await SyncService.loadLocalState();
    expect(loaded!.isSubscriber).toBe(false);
  });

  it('signed-in saves still stamp the main key and never touch the guest key', async () => {
    setSession('user-1');
    const state = guestState({ user: { id: 'user-1', firstName: 'Kai', prayerLife: 'new', onboardingComplete: true } as UserProfile });
    await SyncService.saveLocalState(state);
    expect(mockAsyncStore.has(MAIN_KEY)).toBe(true);
    expect(mockAsyncStore.get(OWNER_KEY)).toBe('user-1');
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(false);
  });

  it('a guest load never reads a stamped main-key blob (previous account leftover)', async () => {
    mockAsyncStore.set(MAIN_KEY, JSON.stringify(guestState()));
    mockAsyncStore.set(OWNER_KEY, 'someone-else');
    expect(await SyncService.loadLocalState()).toBeNull();
  });
});

describe('hasGuestProgress / warning conditions', () => {
  it('empty default state is not progress', () => {
    expect(SyncService.hasGuestProgress(defaultState())).toBe(false);
  });

  it('settings-only state (theme, no journey data) is not progress', () => {
    expect(SyncService.hasGuestProgress(guestState({
      progress: [],
      currentDay: 1,
      streakCount: 0,
      themePreference: 'monastic',
    } as Partial<AppState>))).toBe(false);
  });

  it('one completed day, a journal entry, or a seed amen each count', () => {
    expect(SyncService.hasGuestProgress(guestState({ progress: sevenDayProgress().slice(0, 1) }))).toBe(true);
    expect(SyncService.hasGuestProgress(guestState({
      progress: [],
      currentDay: 1,
      streakCount: 0,
      prayerRequests: [{ id: 'p1', text: 'pray', date: '2026-10-26', isAnswered: false }],
    } as Partial<AppState>))).toBe(true);
    expect(SyncService.hasGuestProgress(guestState({
      progress: [],
      currentDay: 1,
      streakCount: 0,
      wallAmenedLocal: ['seed-1'],
    } as Partial<AppState>))).toBe(true);
  });

  it('getGuestProgressSummary reports days for guests and null once signed in', async () => {
    await SyncService.saveLocalState(guestState());
    await expect(SyncService.getGuestProgressSummary()).resolves.toEqual({ hasProgress: true, daysCompleted: 7 });
    setSession('user-2');
    await expect(SyncService.getGuestProgressSummary()).resolves.toBeNull();
  });
});

describe('migrateLocalStateToAccount', () => {
  it('adopts a guest blob into a fresh account: progress, streak, profile fields, new id', async () => {
    await SyncService.saveLocalState(guestState());
    setSession('user-2');

    const migrated = await SyncService.migrateLocalStateToAccount();
    expect(migrated).not.toBeNull();
    expect(migrated!.progress.filter((p) => p.completed)).toHaveLength(7);
    expect(migrated!.currentDay).toBe(8);
    expect(migrated!.streakCount).toBe(7);
    expect(migrated!.user!.id).toBe('user-2');
    expect(migrated!.user!.firstName).toBe('Kai');
    expect(migrated!.user!.onboardingComplete).toBe(true);
    expect(migrated!.user!.reminderTime).toBe('8:00 AM');
    // Consumed + re-stamped: guest key gone, main key owned by user-2.
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(false);
    expect(mockAsyncStore.get(OWNER_KEY)).toBe('user-2');
    // And the adopted state is what a signed-in load now returns.
    expect(await SyncService.loadLocalState()).not.toBeNull();
    expect((await SyncService.loadLocalState())!.user!.id).toBe('user-2');
  });

  it('does NOT overwrite an existing account: cloud state wins, guest blob kept', async () => {
    await SyncService.saveLocalState(guestState());
    setSession('user-2');
    (DatabaseService.loadAppState as unknown as jest.Mock).mockResolvedValue({
      progress: [{ day: 1, completed: true, completedAt: noonIso('2026-10-01'), duration: 300 }],
      user: { id: 'user-2' },
    });

    await expect(SyncService.migrateLocalStateToAccount()).resolves.toBeNull();
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(true);
    expect(mockAsyncStore.has(MAIN_KEY)).toBe(false);
  });

  it('defers on a failed cloud load: a failed load is not an empty account', async () => {
    await SyncService.saveLocalState(guestState());
    setSession('user-2');
    (DatabaseService as unknown as { lastLoadFailed: boolean }).lastLoadFailed = true;

    await expect(SyncService.migrateLocalStateToAccount()).resolves.toBeNull();
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(true);
  });

  it('does nothing when a usable local state already exists (race-persist case)', async () => {
    // Layout: the handleUserUpdate race persist already carried guest
    // progress into the main key stamped with the new id, plus a stale
    // guest blob. Migration must leave the existing path alone.
    setSession('user-2');
    const signedIn = guestState({ user: { id: 'user-2', firstName: 'Kai', prayerLife: 'new', onboardingComplete: true } as UserProfile });
    mockAsyncStore.set(MAIN_KEY, JSON.stringify(signedIn));
    mockAsyncStore.set(OWNER_KEY, 'user-2');
    mockAsyncStore.set(GUEST_KEY, JSON.stringify(guestState()));
    await expect(SyncService.migrateLocalStateToAccount()).resolves.toBeNull();
    expect(mockAsyncStore.get(OWNER_KEY)).toBe('user-2');
  });

  it('adopts a marker-matched stranded anonymous blob, not a mismatched one', async () => {
    const anonState = guestState({ user: { id: 'anon-1', firstName: 'Kai', prayerLife: 'new', onboardingComplete: true } as UserProfile });
    mockAsyncStore.set(MAIN_KEY, JSON.stringify(anonState));
    mockAsyncStore.set(OWNER_KEY, 'anon-1');
    await SyncService.recordMigrationSourceId('anon-1');
    setSession('user-2');

    const migrated = await SyncService.migrateLocalStateToAccount();
    expect(migrated).not.toBeNull();
    expect(migrated!.progress.filter((p) => p.completed)).toHaveLength(7);
    expect(migrated!.user!.id).toBe('user-2');
    expect(mockAsyncStore.get(OWNER_KEY)).toBe('user-2');
    expect(mockAsyncStore.has(MARKER_KEY)).toBe(false);
  });

  it('refuses a stranded blob whose owner does not match the marker', async () => {
    const otherState = guestState({ user: { id: 'other-user', firstName: 'Pat', prayerLife: 'new', onboardingComplete: true } as UserProfile });
    mockAsyncStore.set(MAIN_KEY, JSON.stringify(otherState));
    mockAsyncStore.set(OWNER_KEY, 'other-user');
    await SyncService.recordMigrationSourceId('anon-1');
    setSession('user-2');

    await expect(SyncService.migrateLocalStateToAccount()).resolves.toBeNull();
    expect(mockAsyncStore.get(OWNER_KEY)).toBe('other-user');
  });

  it('consumes an empty guest shell instead of adopting it', async () => {
    await SyncService.saveLocalState(defaultState());
    setSession('user-2');
    await expect(SyncService.migrateLocalStateToAccount()).resolves.toBeNull();
    expect(mockAsyncStore.has(GUEST_KEY)).toBe(false);
  });
});

describe('initialize() with guest migration', () => {
  it('returns the migrated state, never a default, on first sign-in after guest use', async () => {
    await SyncService.saveLocalState(guestState());
    setSession('user-2');
    const result = await SyncService.initialize(defaultState());
    expect(result.progress.filter((p) => p.completed)).toHaveLength(7);
    expect(result.user!.id).toBe('user-2');
    expect(result.currentDay).toBe(8);
  });

  it('is unchanged with no guest blob: fresh sign-in takes the existing fullSync path', async () => {
    setSession('user-2');
    const result = await SyncService.initialize(defaultState());
    expect(result.currentDay).toBe(1);
    expect(result.progress).toHaveLength(0);
  });
});
