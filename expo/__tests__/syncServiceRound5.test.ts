// Round-5 core-lane tests for SyncService logic that lives behind
// React-Native imports (the module cannot load in node jest without
// these two I/O-boundary mocks — the real database/supabase modules are
// never loaded, so only SyncService's own logic is under test).
// NOTE: imports sit above the jest.mock calls for import/first;
// babel-plugin-jest-hoist still hoists the mock registrations above
// them in the compiled output, so mocking is unaffected.
import { SyncService } from '@/lib/syncService';
import { DatabaseService } from '@/lib/database';
import type { AppState, UserProfile } from '@/types';

// React Native defines __DEV__ globally; node jest does not. The module
// under test reads it in a catch path, so define it here (false = prod).
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
    // NOTE: the fn is created INSIDE the factory (not referenced from an
    // outer mock* const): a static field initializer runs eagerly at
    // factory time, before outer consts initialize, so an outer
    // reference lands as undefined. Tests assert through
    // DatabaseService.syncAppState itself (see below). The explicit
    // jest.Mock annotations silence TS7022 (anonymous-class static
    // field self-inference) in the factory.
    static syncAppState: jest.Mock = jest.fn(async () => undefined);
    static loadAppState: jest.Mock = jest.fn(async () => null);
    static clearLoadSnapshot: jest.Mock = jest.fn();
    static bumpSyncGeneration: jest.Mock = jest.fn();
  },
}));

jest.mock('@/lib/supabase', () => ({
  getSafeSession: async () => ({ user: { id: 'user-1' } }),
}));

// Local-noon instant for a prayer-day key: prayerDayKey runs in the
// runtime's local zone, and a local-noon instant always belongs to its
// own local date's prayer day in every zone.
function noonIso(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
}

function baseState(overrides: Partial<AppState>): AppState {
  return {
    journeyPass: 1,
    progress: [],
    graceDaysUsed: [],
    ...overrides,
  } as unknown as AppState;
}

beforeEach(() => {
  mockAsyncStore.clear();
  (DatabaseService.syncAppState as unknown as jest.Mock).mockClear();
});

describe('mergeStates streak derivation (round-5 lane-3 H2)', () => {
  it('counts the grace-bridged run: Mon(12) -> Tue missed -> Wed grace -> Thu = 13', async () => {
    const progress = Array.from({ length: 12 }, (_, i) => ({
      day: i + 1,
      completed: true,
      completedAt: noonIso(`2026-10-${String(8 + i).padStart(2, '0')}`),
      duration: 300,
    }));
    progress.push({ day: 13, completed: true, completedAt: noonIso('2026-10-22'), duration: 300 });
    const merged = await SyncService.mergeStates(
      baseState({ progress, graceDaysUsed: ['2026-10-21'] }),
      {},
    );
    expect(merged.streakCount).toBe(13);
  });
});

describe('mergeStates pending profile edits (round-5 lane-3 M2)', () => {
  const localUser: UserProfile = {
    id: 'user-1',
    firstName: 'Kai',
    prayerLife: 'growing',
    onboardingComplete: true,
    displayName: 'New Name',
  };
  const cloudUser: UserProfile = {
    id: 'user-1',
    firstName: 'Kai',
    prayerLife: 'growing',
    onboardingComplete: true,
    displayName: 'Old Name',
  };

  it('applies a pending edit over the cloud value', async () => {
    mockAsyncStore.set(
      'amen_pending_profile_edit',
      JSON.stringify({ userId: 'user-1', displayName: 'New Name' }),
    );
    const merged = await SyncService.mergeStates(
      baseState({ user: localUser }),
      { user: cloudUser },
    );
    expect(merged.user?.displayName).toBe('New Name');
    // Not yet confirmed (cloud still says Old) so the record stays.
    expect(mockAsyncStore.has('amen_pending_profile_edit')).toBe(true);
  });

  it('drops the record once the cloud shows the edit landed', async () => {
    mockAsyncStore.set(
      'amen_pending_profile_edit',
      JSON.stringify({ userId: 'user-1', displayName: 'New Name' }),
    );
    const merged = await SyncService.mergeStates(
      baseState({ user: localUser }),
      { user: { ...cloudUser, displayName: "New Name" } },
    );
    expect(merged.user?.displayName).toBe('New Name');
    expect(mockAsyncStore.has('amen_pending_profile_edit')).toBe(false);
  });

  it('ignores a pending record for another user', async () => {
    mockAsyncStore.set(
      'amen_pending_profile_edit',
      JSON.stringify({ userId: 'someone-else', displayName: 'Intruder' }),
    );
    const merged = await SyncService.mergeStates(
      baseState({ user: localUser }),
      { user: cloudUser },
    );
    expect(merged.user?.displayName).toBe('Old Name');
  });
});

describe('uploadMerged hash skip (round-5 lane-4 H1)', () => {
  it('uploads once for identical states and again after a change', async () => {
    const state = baseState({
      user: {
        id: 'user-1',
        firstName: 'Kai',
        prayerLife: 'growing',
        onboardingComplete: true,
      },
      streakCount: 5,
    });
    const upload = (SyncService as unknown as { uploadMerged: (s: AppState) => Promise<boolean> })
      .uploadMerged.bind(SyncService);
    expect(await upload(state)).toBe(true);
    expect(DatabaseService.syncAppState).toHaveBeenCalledTimes(1);
    expect(await upload(state)).toBe(true);
    expect(DatabaseService.syncAppState).toHaveBeenCalledTimes(1);
    expect(await upload({ ...state, streakCount: 6 })).toBe(true);
    expect(DatabaseService.syncAppState).toHaveBeenCalledTimes(2);
  });
});
