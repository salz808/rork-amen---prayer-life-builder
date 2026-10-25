import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { AppState, UserTier } from '@/types';
import { getSafeSession } from './supabase';
import { prayerDayKey } from './prayerDay';

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    const message = candidate.message;
    const code = candidate.code;

    if (typeof message === 'string' && message.trim().length > 0) {
      return typeof code === 'string' && code.trim().length > 0 ? `${message} | ${code}` : message;
    }
  }

  return 'Unknown sync error';
}

const STORAGE_KEY = 'amen_app_state';
const LAST_SYNC_KEY = 'amen_last_sync';
const OWNER_KEY = 'amen_state_owner';
const SYNC_INTERVAL = 30000;

// Audit round 3, J-B13: local storage must never claim a subscription
// (the store is the source of truth), but theme/voiceover are user
// PREFERENCES, not entitlements — the old sanitize destroyed them on
// every save, so Monastic + voiceover reset on every restart. Only the
// subscription fields are stripped now; the RevenueCat listener re-gates
// premium-only values against the live tier at runtime.
function sanitizeSubscriptionState(state: AppState): AppState {
  return {
    ...state,
    isSubscriber: false,
    entitlements: [],
    tierLevel: UserTier.FREE,
  };
}

export class SyncService {
  private static syncTimer: ReturnType<typeof setInterval> | null = null;
  private static isSyncing = false;

  // Audit round 3, J-B1: hydration gate. Set true on a fresh SIGNED_IN
  // (provider) until the sign-in reload's hydration lands; while true,
  // syncToCloud and backgroundSync refuse to upload — the provider
  // state in that window is still the previous session's (or a fresh
  // default), and uploading it would clobber the new user's cloud
  // stats. hydrationUserId records whose hydration completed, so the
  // sign-out suppression lifts only for that user's states.
  static hydrationPending = false;
  static hydrationUserId: string | null = null;

  static async saveLocalState(state: AppState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSubscriptionState(state)));
      // Stamp the owning user so a later session under a different user id
      // never hydrates from (or uploads) this state. Legacy states without
      // a stamp are accepted once for backward compatibility, then stamped
      // on the next save.
      const session = await getSafeSession();
      if (session?.user?.id) {
        await AsyncStorage.setItem(OWNER_KEY, session.user.id);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to save local state:', error);
      }
    }
  }

  static async clearLocalState(): Promise<void> {
    try {
      // Plus every other per-user key the app writes: track progress,
      // completions, the active track, and the journey publish stamp all
      // survived sign-out before and could hydrate the next account.
      // (Key strings duplicated from trackProgress/journeyTogether to avoid
      // an import cycle; keep them in sync with those modules.)
      await AsyncStorage.multiRemove([
        STORAGE_KEY,
        LAST_SYNC_KEY,
        OWNER_KEY,
        '@triad/activeTrackId',
        '@triad/trackProgress',
        '@triad/trackCompletions',
        '@triad/lastPublishedJourneyProgress',
      ]);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to clear local state:', error);
      }
      throw error;
    }
  }

  static async loadLocalState(): Promise<AppState | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }

      // Owner guard: if this cache was stamped by another user, ignore it
      // instead of hydrating the current session from someone else's data.
      const owner = await AsyncStorage.getItem(OWNER_KEY);
      if (owner) {
        const session = await getSafeSession();
        if (session?.user?.id && owner !== session.user.id) {
          if (__DEV__) {
            console.warn('[SyncService] Ignoring local state stamped by another user');
          }
          return null;
        }
      }

      return sanitizeSubscriptionState(JSON.parse(stored) as AppState);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to load local state:', error);
      }
      return null;
    }
  }

  static async getLastSyncTime(): Promise<number> {
    try {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return lastSync ? parseInt(lastSync, 10) : 0;
    } catch {
      return 0;
    }
  }

  static async setLastSyncTime(time: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, time.toString());
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to set last sync time:', error);
      }
    }
  }

  static async syncToCloud(state: AppState): Promise<boolean> {
    if (this.isSyncing) return false;
    // Audit round 3, J-B1: never upload during the sign-in hydration
    // window, and never upload a state for a different user than the
    // live session (the 30s auto-sync used to do exactly that).
    if (this.hydrationPending) return false;

    try {
      const session = await getSafeSession();
      if (!session?.user) return false;
      const stateUserId = (state.user as { id?: string } | null)?.id ?? null;
      if (!stateUserId || session.user.id !== stateUserId) return false;

      this.isSyncing = true;

      await DatabaseService.syncAppState(state);
      await this.setLastSyncTime(Date.now());
      return true;
    } catch (error) {
      if (__DEV__) {
        console.warn('[SyncService] Cloud sync skipped:', getSafeErrorMessage(error));
      }
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  static async loadFromCloud(): Promise<Partial<AppState> | null> {
    try {
      const session = await getSafeSession();
      if (!session?.user) return null;

      const cloudState = await DatabaseService.loadAppState();
      if (cloudState) {
        await this.setLastSyncTime(Date.now());
      }
      return cloudState;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to load from cloud:', getSafeErrorMessage(error));
      }
      return null;
    }
  }

  static async mergeStates(
    localState: AppState,
    cloudState: Partial<AppState>
  ): Promise<AppState> {
    // Audit round 3, J-B3: passes are compared first — when the local
    // pass is ahead of the cloud's, the cloud's older-pass rows are not
    // a newer truth, so the local pass's journey fields win outright
    // (applied below, after the per-day merge).
    const localPass = localState.journeyPass ?? 1;
    const cloudPass = cloudState.journeyPass ?? 1;
    const mergedPass = Math.max(localPass, cloudPass);
    const localPassAhead = localPass > cloudPass;

    const mergedProgress = [...localState.progress];

    if (cloudState.progress) {
      for (const cloudDay of cloudState.progress) {
        const localIndex = mergedProgress.findIndex(p => p.day === cloudDay.day);
        if (localIndex >= 0) {
          const local = mergedProgress[localIndex];
          const localTime = local.completedAt ? new Date(local.completedAt).getTime() : 0;
          const cloudTime = cloudDay.completedAt ? new Date(cloudDay.completedAt).getTime() : 0;

          if (cloudTime > localTime) {
            mergedProgress[localIndex] = cloudDay;
          }
        } else {
          mergedProgress.push(cloudDay);
        }
      }
    }

    const mergedPhaseTimings = {
      ...localState.phaseTimings,
      ...cloudState.phaseTimings,
    };

    const cloudDailyPrayerLog = cloudState.dailyPrayerLog ?? [];
    const localDailyPrayerLog = localState.dailyPrayerLog ?? [];
    const mergedDailyPrayerMap = new Map<string, AppState['dailyPrayerLog'][number]>();

    for (const entry of [...localDailyPrayerLog, ...cloudDailyPrayerLog]) {
      const existingEntry = mergedDailyPrayerMap.get(entry.date);
      if (!existingEntry || new Date(entry.completedAt).getTime() > new Date(existingEntry.completedAt).getTime()) {
        mergedDailyPrayerMap.set(entry.date, entry);
      }
    }

    const mergedDailyPrayerLog = Array.from(mergedDailyPrayerMap.values()).sort((left, right) => (
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
    ));

    for (const [phase, cloudSeconds] of Object.entries(cloudState.phaseTimings || {})) {
      const localSeconds = localState.phaseTimings[phase] || 0;
      mergedPhaseTimings[phase] = Math.max(localSeconds, cloudSeconds);
    }

    const mergedStreakCount = localState.currentDay === 1 && localState.progress.length === 0 ? (cloudState.streakCount || 0) : localState.streakCount;
    // Audit round 3, J-B5: currentDay, journeyComplete, and
    // lastCompletedDate are DERIVED from the merged progress — never
    // inherited from one side's snapshot. A stale local day used to
    // beat an ahead cloud (and a cloud false used to clear a local
    // completion). Derivation: currentDay is the highest consecutively
    // completed day + 1 (capped at 30, with journeyComplete when all 30
    // are present); journeyComplete is sticky once either side has it;
    // lastCompletedDate is the prayer day of the newest completion.
    // Audit round 3, J-B3: progress is pass-scoped — when either side's
    // pass is ahead, that side's progress replaces the merged set
    // outright before derivation (a per-day union across passes would
    // mix two different journeys' days together).
    const cloudPassAhead = cloudPass > localPass;
    const derivationProgress = localPassAhead
      ? [...(localState.progress ?? [])]
      : cloudPassAhead
        ? [...(cloudState.progress ?? [])]
        : mergedProgress;
    const completedDays = new Set(derivationProgress.filter((p) => p.completed).map((p) => p.day));
    let consecutive = 0;
    while (consecutive < 30 && completedDays.has(consecutive + 1)) consecutive++;
    const all30 = consecutive >= 30;
    const derivedCurrentDay = all30 ? 30 : consecutive + 1;
    // The completion flag is pass-scoped too: a finished pass 1 must not
    // mark a fresh pass 2 complete (the old OR did exactly that).
    const flagComplete = localPassAhead
      ? localState.journeyComplete
      : cloudPassAhead
        ? cloudState.journeyComplete
        : (localState.journeyComplete || cloudState.journeyComplete);
    const derivedJourneyComplete = Boolean(flagComplete || all30);
    const completedInstants = derivationProgress
      .filter((p) => p.completed && p.completedAt)
      .map((p) => new Date(p.completedAt!).getTime())
      .filter((t) => Number.isFinite(t));
    const derivedLastCompletedDate = completedInstants.length > 0
      ? prayerDayKey(new Date(Math.max(...completedInstants)))
      : (localPassAhead
        ? (localState.lastCompletedDate ?? null)
        : cloudPassAhead
          ? (cloudState.lastCompletedDate ?? null)
          : (cloudState.lastCompletedDate ?? localState.lastCompletedDate ?? null));
    const mergedFirstStepsCompletedIds = Array.from(new Set([
      ...(localState.firstStepsCompletedIds ?? []),
      ...(cloudState.firstStepsCompletedIds ?? []),
    ]));

    // Prayer lists: union by id. The old spread (...localState, ...cloudState)
    // let the cloud's older/empty lists overwrite local prayers wholesale, so
    // a fresh sign-in wiped prayers that had never been uploaded. On an id
    // conflict the answered version wins (more progress), else local wins.
    const mergePrayers = <T extends { id: string; isAnswered?: boolean }>(local: T[], cloud: T[]): T[] => {
      const map = new Map<string, T>();
      for (const item of [...cloud, ...local]) {
        const existing = map.get(item.id);
        if (!existing) {
          map.set(item.id, item);
        } else if (item.isAnswered && !existing.isAnswered) {
          map.set(item.id, item);
        }
      }
      return Array.from(map.values());
    };
    const mergedPrayerRequests = mergePrayers(localState.prayerRequests ?? [], cloudState.prayerRequests ?? []);
    const mergedAnsweredPrayers = mergePrayers(
      (localState.answeredPrayers ?? []) as { id: string; isAnswered?: boolean }[],
      (cloudState.answeredPrayers ?? []) as { id: string; isAnswered?: boolean }[],
    ) as AppState['answeredPrayers'];
    const mergedDeclarationFavorites = Array.from(new Set([
      ...(localState.declarationFavorites ?? []),
      ...(cloudState.declarationFavorites ?? []),
    ]));

    // Audit round 3, J-B8: reflections merge by week (which holds the
    // journey day, 1-30), newest date wins. The old spread let the
    // cloud's older reflection overwrite a newer local edit outright.
    // Local wins ties (it is the edit the user just made); unparseable
    // dates lose to parseable ones (local dates are locale strings,
    // cloud dates are ISO created_at — both parse, in practice).
    const mergeReflections = (
      local: AppState['reflections'],
      cloud: AppState['reflections']
    ): AppState['reflections'] => {
      const map = new Map<number, AppState['reflections'][number]>();
      for (const item of [...(cloud ?? []), ...(local ?? [])]) {
        const existing = map.get(item.week);
        if (!existing) {
          map.set(item.week, item);
          continue;
        }
        const existingTime = new Date(existing.date).getTime();
        const itemTime = new Date(item.date).getTime();
        if (Number.isFinite(itemTime) && (!Number.isFinite(existingTime) || itemTime >= existingTime)) {
          map.set(item.week, item);
        }
      }
      return Array.from(map.values()).sort((a, b) => a.week - b.week);
    };
    // Reflections are pass-scoped (loaded per journey_pass), so when
    // either side's pass is ahead, that side's reflections win outright
    // — merging across passes would resurrect the old pass's entries.
    const mergedReflections = localPassAhead
      ? [...(localState.reflections ?? [])]
      : cloudPassAhead
        ? [...(cloudState.reflections ?? [])]
        : mergeReflections(localState.reflections ?? [], cloudState.reflections ?? []);

    return {
      ...localState,
      ...cloudState,
      progress: derivationProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: derivedCurrentDay,
      journeyComplete: derivedJourneyComplete,
      lastCompletedDate: derivedLastCompletedDate,
      journeyPass: mergedPass,
      streakCount: mergedStreakCount,
      dailyPrayerLog: mergedDailyPrayerLog,
      firstStepsCompletedIds: mergedFirstStepsCompletedIds,
      prayerRequests: mergedPrayerRequests,
      answeredPrayers: mergedAnsweredPrayers,
      declarationFavorites: mergedDeclarationFavorites,
      reflections: mergedReflections,
      isSubscriber: false,
      entitlements: [],
      tierLevel: UserTier.FREE,
      // Audit round 3, J-B13: same rule as sanitize — preferences survive
      // the merge (cloud wins, local fallback), monaticTheme mirrors the
      // preserved theme. Tier gating stays the RevenueCat listener's job.
      themePreference: cloudState.themePreference ?? localState.themePreference,
      monaticTheme: (cloudState.themePreference ?? localState.themePreference) === 'monastic',
    };
  }

  static async fullSync(currentState: AppState): Promise<AppState> {
    const session = await getSafeSession();
    if (!session?.user) return currentState;

    try {
      const cloudState = await this.loadFromCloud();

      if (!cloudState) {
        // Audit round 3, J-S13: a null cloud state after a FAILED load
        // is not a first-time user — never seed-push a defaulted local
        // state over real cloud stats. The provider reads lastLoadFailed
        // and suppresses persistence for the session.
        if (DatabaseService.lastLoadFailed) {
          return currentState;
        }
        await this.syncToCloud(currentState);
        return currentState;
      }

      const mergedState = await this.mergeStates(currentState, cloudState);

      await this.saveLocalState(mergedState);
      await this.syncToCloud(mergedState);

      return mergedState;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Full sync failed:', getSafeErrorMessage(error));
      }
      return currentState;
    }
  }

  static startAutoSync(getCurrentState: () => AppState): void {
    this.stopAutoSync();

    this.syncTimer = setInterval(async () => {
      const state = getCurrentState();
      await this.syncToCloud(state);
    }, SYNC_INTERVAL);
  }

  static stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  static async initialize(currentState: AppState): Promise<AppState> {
    try {
      // Local storage is always the merge base. Using a fresh default state here
      // can overwrite progress that has not reached the cloud yet.
      const localState = await this.loadLocalState();
      const mergeBase = localState ?? currentState;
      const session = await getSafeSession();

      if (!session?.user) {
        return mergeBase;
      }

      return await this.fullSync(mergeBase);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Initialization failed, using local state:', getSafeErrorMessage(error));
      }
      const localState = await this.loadLocalState();
      return localState || currentState;
    }
  }
}
