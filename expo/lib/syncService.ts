import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { AppState, SyncTombstone, UserTier } from '@/types';
import { getSafeSession } from './supabase';
import { prayerDayKey, shiftPrayerDayKey } from './prayerDay';

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

// Audit round 4, SYNC-9 (hoisted round-2 M7): future instants are clamped
// to now before any newest-wins comparison, so a future-dated device can
// never win a merge slot forever. Round-2 M7 extends the same clamp to
// the holes SYNC-9 left: daily-log comparisons, the checklist stamp,
// the completion-clear marker, and the reset marker.
function clampTime(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.min(t, Date.now());
}

// Same clamp for a stamp that is itself stored/returned: a future stamp
// becomes "now" (ISO), so later real edits are never stuck behind it.
function clampIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(Math.min(t, Date.now())).toISOString();
}

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

  /** Audit round 4, SYNC-7: backgroundSync must respect this lock —
   * it previously ran concurrently with syncToCloud. Read-only
   * accessor so appSync can check without touching the flag. */
  static get syncing(): boolean {
    return this.isSyncing;
  }

  // Audit round 4, Low L3: sync-failure signal. The provider subscribes
  // and folds failures into the existing stateLoadError banner (Home +
  // Journal) — no new toast system. Success clears it.
  private static syncFailureListeners = new Set<(failed: boolean) => void>();
  static onSyncFailureChange(listener: (failed: boolean) => void): () => void {
    this.syncFailureListeners.add(listener);
    return () => {
      this.syncFailureListeners.delete(listener);
    };
  }
  private static notifySyncFailure(failed: boolean): void {
    for (const listener of this.syncFailureListeners) {
      try {
        listener(failed);
      } catch {
        // Listener failure must never break sync.
      }
    }
  }

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
      // Audit round 4, SYNC-10: stamp-or-drop. A persist with no live
      // session used to write an unstamped blob that the next account
      // legacy-accepted — a post-sign-out state write landing in the
      // next user's cache. Refuse it: no session, no write.
      const session = await getSafeSession();
      if (!session?.user?.id) {
        if (__DEV__) {
          console.warn('[SyncService] Refusing unstamped persist with no live session');
        }
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSubscriptionState(state)));
      // Stamp the owning user so a later session under a different user id
      // never hydrates from (or uploads) this state. Legacy states without
      // a stamp are accepted once for backward compatibility, then stamped
      // on the next save.
      await AsyncStorage.setItem(OWNER_KEY, session.user.id);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to save local state:', error);
      }
    }
  }

  static async clearLocalState(): Promise<void> {
    // Audit round 4, SYNC-2/SYNC-7: sign-out / delete-account both call
    // this (after stopAutoSync). Clearing the load proof here means a
    // new account never inherits the old account's lastLoadOk, and
    // bumping the sync generation aborts any in-flight sync sequence.
    DatabaseService.clearLoadSnapshot();
    DatabaseService.bumpSyncGeneration();
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
      // Round-2 M3 (stronger form): a stamped blob belongs to an
      // account, never to a guest — so when a stamp exists but there
      // is NO live session user at all (e.g. a kill mid-sign-out after
      // the session cleared but before the blob was wiped), return null
      // rather than hydrating the previous user's private state as a
      // guest. Guest-first-run blobs are never stamped (saveLocalState
      // refuses unstamped persists with no live session), so they are
      // unaffected by this branch.
      const owner = await AsyncStorage.getItem(OWNER_KEY);
      if (owner) {
        const session = await getSafeSession();
        if (!session?.user?.id) {
          if (__DEV__) {
            console.warn('[SyncService] Ignoring stamped local state with no live session');
          }
          return null;
        }
        if (owner !== session.user.id) {
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

  /** Upload a state that has already been merged (fullSync's path).
   * Owns the isSyncing lock and the user-id match gate. */
  private static async uploadMerged(state: AppState): Promise<boolean> {
    if (this.isSyncing) return false;
    if (this.hydrationPending) return false;
    try {
      const session = await getSafeSession();
      if (!session?.user) return false;
      const stateUserId = (state.user as { id?: string } | null)?.id ?? null;
      if (!stateUserId || session.user.id !== stateUserId) return false;

      this.isSyncing = true;
      await DatabaseService.syncAppState(state);
      await this.setLastSyncTime(Date.now());
      this.notifySyncFailure(DatabaseService.lastSyncFailed);
      return !DatabaseService.lastSyncFailed;
    } catch (error) {
      if (__DEV__) {
        console.warn('[SyncService] Cloud sync skipped:', getSafeErrorMessage(error));
      }
      this.notifySyncFailure(true);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  static async syncToCloud(state: AppState): Promise<boolean> {
    // Audit round 4, SYNC-2: the 30s autosync used to upload raw state
    // with no merge — a stale device clobbered newer cloud state just
    // by launching. Autosync now routes through load+merge, exactly
    // like fullSync, and skips the upload entirely if the load fails
    // (a failed load is not an empty cloud). Audit round 3, J-B1 gates
    // still apply inside uploadMerged (hydration window + user match).
    if (this.isSyncing) return false;
    if (this.hydrationPending) return false;
    try {
      const session = await getSafeSession();
      if (!session?.user) return false;
      const stateUserId = (state.user as { id?: string } | null)?.id ?? null;
      if (!stateUserId || session.user.id !== stateUserId) return false;

      const cloudState = await this.loadFromCloud();
      if (!cloudState) {
        // Failed load (not first-run): never upload raw state over
        // cloud rows we could not read.
        if (DatabaseService.lastLoadFailed) return false;
        return this.uploadMerged(state);
      }
      const mergedState = await this.mergeStates(state, cloudState);
      return this.uploadMerged(mergedState);
    } catch (error) {
      if (__DEV__) {
        console.warn('[SyncService] Cloud sync skipped:', getSafeErrorMessage(error));
      }
      this.notifySyncFailure(true);
      return false;
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

    // Audit round 4, SYNC-3: tombstones apply BEFORE any union, on
    // both sides. A tombstoned id is dropped even if the other side
    // still holds it — that is the whole point: the other side's copy
    // is the stale one. Union of both sides' tombstone sets (a delete
    // known to either device is a delete).
    const tombstoneSet = new Set<string>();
    for (const t of [...(localState.syncTombstones ?? []), ...(cloudState.syncTombstones ?? [])]) {
      tombstoneSet.add(`${t.list}:${t.itemId}`);
    }
    const tombstoned = (list: SyncTombstone['list'], itemId: string) =>
      tombstoneSet.has(`${list}:${itemId}`);
    const mergedTombstones: SyncTombstone[] = Array.from(tombstoneSet).map((key) => {
      const sep = key.indexOf(':');
      const list = key.slice(0, sep);
      const itemId = key.slice(sep + 1);
      const all = [...(localState.syncTombstones ?? []), ...(cloudState.syncTombstones ?? [])];
      const found = all.find((t) => t.list === list && t.itemId === itemId);
      return {
        list: list as SyncTombstone['list'],
        itemId,
        deletedAt: found?.deletedAt ?? new Date().toISOString(),
      };
    });

    // Audit round 4, SYNC-5: a reset marker newer than a side's
    // knowledge kills that side's pre-reset progress. Rows completed
    // AFTER the marker survive (they are post-reset work); rows at or
    // before it are dead. Without a marker, fresh-install and reset
    // are indistinguishable — that was the defect. The marker rides
    // journey_stats.reset_at.
    const localResetAt = localState.journeyResetAt ?? null;
    const cloudResetAt = cloudState.journeyResetAt ?? null;
    // Round-2 M7: clamp the winning reset marker to now, so a
    // future-dated reset cannot wipe pre-marker progress on all
    // devices until real time passes it.
    const effectiveResetAt = clampIso([localResetAt, cloudResetAt]
      .filter((v): v is string => v != null)
      .sort()
      .pop() ?? null);
    const resetTime = effectiveResetAt ? new Date(effectiveResetAt).getTime() : 0;
    const survivesReset = (completedAt: string | undefined | null): boolean => {
      if (!effectiveResetAt || !Number.isFinite(resetTime)) return true;
      if (!completedAt) return false;
      const t = new Date(completedAt).getTime();
      return Number.isFinite(t) && t > resetTime;
    };
    const localProgressKept = (localState.progress ?? []).filter((p) => survivesReset(p.completedAt));
    const cloudProgressKept = (cloudState.progress ?? []).filter((p) => survivesReset(p.completedAt));
    const mergedProgress = [...localProgressKept];

    if (cloudState.progress) {
      for (const cloudDay of cloudProgressKept) {
        const localIndex = mergedProgress.findIndex(p => p.day === cloudDay.day);
        if (localIndex >= 0) {
          const local = mergedProgress[localIndex];
          const localTime = clampTime(local.completedAt);
          const cloudTime = clampTime(cloudDay.completedAt);

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
      // Round-2 M7: clamp before comparing, as SYNC-9 does for progress.
      if (!existingEntry || clampTime(entry.completedAt) > clampTime(existingEntry.completedAt)) {
        mergedDailyPrayerMap.set(entry.date, entry);
      }
    }

    const mergedDailyPrayerLog = Array.from(mergedDailyPrayerMap.values()).sort((left, right) => (
      clampTime(right.completedAt) - clampTime(left.completedAt)
    ));

    for (const [phase, cloudSeconds] of Object.entries(cloudState.phaseTimings || {})) {
      const localSeconds = localState.phaseTimings[phase] || 0;
      mergedPhaseTimings[phase] = Math.max(localSeconds, cloudSeconds);
    }

    // Audit round 4, SYNC-6: one rule for streak, enforced on every
    // path — DERIVED from merged progress at sync time, never
    // local-wins / cloud-wins / fresh-local. Consecutive prayer days
    // ending at the newest kept completion (future instants clamped to
    // today). The provider's calculateStreak (with grace days) remains
    // the display authority at hydration; this is the sync-time value
    // that gets uploaded, so two devices converge instead of flapping.
    // (Grace extension: graceDaysUsed is local-only, so a grace-held
    // streak can read one day lower here until the next completion —
    // documented in the lane report, not a rule change.)
    const deriveStreakFromProgress = (progress: typeof mergedProgress): number => {
      const days = new Set<string>();
      for (const p of progress) {
        if (!p.completed || !p.completedAt) continue;
        const t = new Date(p.completedAt).getTime();
        if (!Number.isFinite(t)) continue;
        days.add(prayerDayKey(new Date(Math.min(t, Date.now()))));
      }
      if (days.size === 0) return 0;
      const sorted = Array.from(days).sort();
      let streak = 1;
      let cursor = sorted[sorted.length - 1];
      while (true) {
        const prev = shiftPrayerDayKey(cursor, -1);
        if (days.has(prev)) {
          streak += 1;
          cursor = prev;
        } else {
          break;
        }
      }
      return streak;
    };
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
    // Audit round 4, SYNC-5: derivation runs on the RESET-FILTERED
    // progress, not the raw sides — otherwise a reset device's empty
    // list still derived "complete" from the cloud flag below.
    const derivationProgress = localPassAhead
      ? [...localProgressKept]
      : cloudPassAhead
        ? [...cloudProgressKept]
        : mergedProgress;
    const completedDays = new Set(derivationProgress.filter((p) => p.completed).map((p) => p.day));
    let consecutive = 0;
    while (consecutive < 30 && completedDays.has(consecutive + 1)) consecutive++;
    const all30 = consecutive >= 30;
    const derivedCurrentDay = all30 ? 30 : consecutive + 1;
    // The completion flag is pass-scoped too: a finished pass 1 must not
    // mark a fresh pass 2 complete (the old OR did exactly that).
    // Audit round 4, SYNC-5: the sticky OR is further gated by the
    // completion-clear marker — whichever side cleared completion most
    // recently (resetJourney / continueDaily) wins over the other
    // side's stale true flag; all30 of the kept progress still wins.
    const localClearedAt = localState.completionClearedAt ?? null;
    const cloudClearedAt = cloudState.completionClearedAt ?? null;
    // Round-2 M7: the winning clear marker is clamped to now, and the
    // side-wins test compares clamped times (not raw strings), so a
    // future-dated clear cannot hold the flag hostage — nor can the
    // clamp itself resurrect a stale true flag.
    const mergedCompletionClearedAt = clampIso([localClearedAt, cloudClearedAt]
      .filter((v): v is string => v != null)
      .sort()
      .pop() ?? null);
    const clearedSideWins = (sideClearedAt: string | null): boolean =>
      sideClearedAt != null && localClearedAt !== cloudClearedAt
      && clampTime(sideClearedAt) >= clampTime(sideClearedAt === localClearedAt ? cloudClearedAt : localClearedAt);
    const flagComplete = localPassAhead
      ? localState.journeyComplete
      : cloudPassAhead
        ? cloudState.journeyComplete
        : (localState.journeyComplete === false && clearedSideWins(localClearedAt))
          ? false
          : (cloudState.journeyComplete === false && clearedSideWins(cloudClearedAt))
            ? false
            : (localState.journeyComplete || cloudState.journeyComplete);
    const derivedJourneyComplete = Boolean(flagComplete || all30);
    const completedInstants = derivationProgress
      .filter((p) => p.completed && p.completedAt)
      .map((p) => new Date(p.completedAt!).getTime())
      .filter((t) => Number.isFinite(t));
    // Audit round 4, SYNC-9: future completion instants clamp to now,
    // so lastCompletedDate can never sit in the future and zero the
    // streak via calculateStreak's "not recent" branch.
    const derivedLastCompletedDate = completedInstants.length > 0
      ? prayerDayKey(new Date(Math.min(Math.max(...completedInstants), Date.now())))
      : (localPassAhead
        ? (localState.lastCompletedDate ?? null)
        : cloudPassAhead
          ? (cloudState.lastCompletedDate ?? null)
          : (cloudState.lastCompletedDate ?? localState.lastCompletedDate ?? null));
    // Audit round 4, SYNC-6: checklist is last-write-wins by stamp, not
    // a union — a union resurrects unchecks. The side with the newer
    // firstStepsUpdatedAt wins wholesale; ties / missing stamps keep
    // the union as a safe fallback. Round-2 M7: stamps compare clamped
    // and the merged stamp is clamped, so a future-dated checklist
    // cannot veto every later real edit from another device.
    const localChecklistAt = localState.firstStepsUpdatedAt ?? null;
    const cloudChecklistAt = cloudState.firstStepsUpdatedAt ?? null;
    const mergedFirstStepsCompletedIds = localChecklistAt && cloudChecklistAt && localChecklistAt !== cloudChecklistAt
      ? (clampTime(localChecklistAt) > clampTime(cloudChecklistAt)
        ? [...(localState.firstStepsCompletedIds ?? [])]
        : [...(cloudState.firstStepsCompletedIds ?? [])])
      : Array.from(new Set([
        ...(localState.firstStepsCompletedIds ?? []),
        ...(cloudState.firstStepsCompletedIds ?? []),
      ]));
    const mergedFirstStepsUpdatedAt = clampIso([localChecklistAt, cloudChecklistAt]
      .filter((v): v is string => v != null)
      .sort()
      .pop() ?? null);

    // Prayer lists: union by id. The old spread (...localState, ...cloudState)
    // let the cloud's older/empty lists overwrite local prayers wholesale, so
    // a fresh sign-in wiped prayers that had never been uploaded. On an id
    // conflict the answered version wins (more progress), else local wins.
    // Round-2 M5, DOCUMENTED conflict rule (not a code change): prayer /
    // answered-prayer TEXT has no updatedAt, so on an id conflict the
    // iteration below keeps the FIRST-seen row — [...cloud, ...local]
    // means the cloud row wins a plain text conflict, unless the local
    // row is answered and the cloud row is not (the isAnswered rule).
    // That is first-seen-wins for prayer text in practice (the app has
    // no prayer-text edit UI today; same-prayer-answered on both
    // devices is handled by the isAnswered rule). Reflections, by
    // contrast, are newest-wins by date below; checklist items are LWW
    // by stamp. No updatedAt newest-wins was built for prayer text in
    // this window, per the round-2 fix list.
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
    // Audit round 4, SYNC-3: tombstoned ids are filtered BEFORE the
    // union on both lists, so a delete cannot re-enter via the union.
    const mergedPrayerRequests = mergePrayers(
      (localState.prayerRequests ?? []).filter((r) => !tombstoned('prayerRequests', r.id)),
      (cloudState.prayerRequests ?? []).filter((r) => !tombstoned('prayerRequests', r.id)),
    );
    const mergedAnsweredPrayers = mergePrayers(
      (localState.answeredPrayers ?? []).filter((p) => !tombstoned('answeredPrayers', p.id)) as { id: string; isAnswered?: boolean }[],
      (cloudState.answeredPrayers ?? []).filter((p) => !tombstoned('answeredPrayers', p.id)) as { id: string; isAnswered?: boolean }[],
    ) as AppState['answeredPrayers'];
    const mergedDeclarationFavorites = Array.from(new Set([
      ...(localState.declarationFavorites ?? []).filter((id) => !tombstoned('favorites', id)),
      ...(cloudState.declarationFavorites ?? []).filter((id) => !tombstoned('favorites', id)),
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
    // Audit round 4, SYNC-3/L4: tombstoned weeks are dropped, and
    // merged reflection dates are normalized to ISO (local dates were
    // locale strings, which made newest-wins locale-fragile).
    const normalizeReflectionDate = (r: AppState['reflections'][number]) => {
      const t = new Date(r.date).getTime();
      return Number.isFinite(t) ? { ...r, date: new Date(t).toISOString() } : r;
    };
    const rawMergedReflections = localPassAhead
      ? [...(localState.reflections ?? [])]
      : cloudPassAhead
        ? [...(cloudState.reflections ?? [])]
        : mergeReflections(localState.reflections ?? [], cloudState.reflections ?? []);
    const mergedReflections = rawMergedReflections
      .filter((r) => !tombstoned('reflections', `${localPassAhead ? localPass : cloudPassAhead ? cloudPass : mergedPass}:${r.week}`))
      .map(normalizeReflectionDate);
    // Audit round 4, SYNC-6: open streak converges by MAX (it is a
    // monotonic counter, like phase totals); the spread's cloud-wins
    // used to cap a daily-opening offline device at the older cloud row.
    const mergedOpenStreakCount = Math.max(
      localState.openStreakCount ?? 0,
      cloudState.openStreakCount ?? 0,
    );

    return {
      ...localState,
      ...cloudState,
      progress: derivationProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: derivedCurrentDay,
      journeyComplete: derivedJourneyComplete,
      lastCompletedDate: derivedLastCompletedDate,
      journeyPass: mergedPass,
      journeyResetAt: effectiveResetAt,
      completionClearedAt: mergedCompletionClearedAt,
      syncTombstones: mergedTombstones,
      firstStepsUpdatedAt: mergedFirstStepsUpdatedAt,
      openStreakCount: mergedOpenStreakCount,
      streakCount: deriveStreakFromProgress(derivationProgress),
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
      await this.uploadMerged(mergedState);

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
    // Audit round 4, SYNC-7: stopping autosync (sign-out and
    // delete-account both do this first) also bumps the sync
    // generation, aborting any in-flight syncAppState sequence.
    DatabaseService.bumpSyncGeneration();
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
