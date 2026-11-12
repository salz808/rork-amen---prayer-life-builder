import AsyncStorage from '@react-native-async-storage/async-storage';
// Static NAMED import only (aliased: AppState here is the app's state
// type from '@/types'). This must never become a dynamic
// import('react-native') or a namespace import: Metro's async-import
// path enumerates every export of react-native (metroImportAll), which
// triggers the lazy PushNotificationIOS getter, whose module scope
// constructs `new NativeEventEmitter(<native module>)` — and that
// native module is absent in a standalone Expo build, so the getter
// throws "Invariant Violation: `new NativeEventEmitter()` requires a
// non-null argument" and the app fatals on launch (build 9, 2026-11-03
// device log). A named import touches only the AppState getter.
import { AppState as RNAppState } from 'react-native';
import { DatabaseService } from './database';
import { AppState, SyncTombstone, UserTier } from '@/types';
import { getSafeSession } from './supabase';
import { prayerDayKey, countCoveredStreak } from './prayerDay';

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
// Wave-1 guest fix (#10): device-local, owner-less guest blob. Guests
// have no session, so the SYNC-10 stamp-or-drop rule below used to
// refuse every guest persist — Foundations progress, streak, and
// journal lived only in memory and vanished at sign-in or restart.
// Guest writes now land here, NEVER in STORAGE_KEY, so a guest blob
// can never be legacy-accepted as a signed-in user's state: the main
// key is only ever read under the owner guard, and the guest key is
// only ever read with no session (loadLocalState) or by the one-time
// sign-in migration (migrateLocalStateToAccount). The guest key is
// never uploaded and is wiped by sign-out / delete-account via
// clearLocalState, exactly like the main key.
const GUEST_KEY = 'amen_guest_state';
// Wave-1 guest fix (#10): migration-source marker. auth.tsx writes the
// anonymous user id here BEFORE a sign-in attempt; the sign-in
// migration adopts the stranded main-key blob ONLY when its owner
// stamp equals this marker — proving it is the just-upgraded
// anonymous session's data, not a previous account's leftover.
const MIGRATION_SOURCE_KEY = 'amen_migration_source_id';
const SYNC_INTERVAL = 30000;
// Round-14 M2: backgrounded autosync backs off to 5 minutes — a
// backgrounded app has no user waiting on fresh cloud state, and the
// foreground tick resumes on return.
const BACKGROUND_SYNC_INTERVAL = 300000;
// Round-5 lane-3 M2: durable pending profile edits. The provider
// records a displayName/reminderTime edit here BEFORE its direct-write
// push runs, so an offline failure or a kill mid-push leaves a record
// the next merge applies (pending wins for those two fields) instead of
// cloud-wins silently reverting an edit the UI already showed as saved.
// The record is dropped by mergeStates once a cloud load shows the edit
// landed, and by sign-out (clearLocalState). Keyed by user id so a
// record can never apply to another account.
const PENDING_PROFILE_KEY = 'amen_pending_profile_edit';
type PendingProfileEdit = {
  userId: string;
  displayName?: string | null;
  reminderTime?: string;
};

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

  // Round-14 M2 dirty flag: true until a sync successfully uploads.
  // saveLocalState is the provider's persist path (persistState /
  // saveMutation and the direct save call sites), so any local change
  // marks dirty and any successful upload clears it. Starts true so
  // ticks run until the first successful upload proves otherwise.
  // Assumption, stated not hidden: a mutation path that changed
  // in-memory state WITHOUT persisting would also skip its tick
  // upload until the next persist — same exposure as the existing
  // hash-skip, which keys off uploaded state. Direct syncToCloud
  // callers (fullSync, AppSync backgroundSync) are NOT gated by this
  // flag; only the 30s tick is.
  private static localDirty = true;
  private static autoSyncStateGetter: (() => AppState) | null = null;
  private static autoSyncAppStateSubscription: { remove: () => void } | null = null;
  private static autoSyncIntervalMs = SYNC_INTERVAL;

  // Round-5 lane-4 H1: serialization of the last successfully uploaded
  // state (in-memory only — a restart simply uploads once more). See
  // uploadMerged.
  private static lastUploadedStateHash: string | null = null;

  // Round-5 lane-4 M7 (ordering half only): local persists are chained
  // so completion order matches call order — two rapid mutations used
  // to complete their AsyncStorage writes out of order and the older
  // blob could overwrite the newer. The chain never rejects (saves
  // swallow errors internally), so a slow save delays but never blocks
  // later saves permanently. The 3x-serialization cost itself is NOT
  // changed here (see the fix report: it needs a dirty-flag refactor
  // plus device profiling to justify).
  private static saveChain: Promise<void> = Promise.resolve();

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
    // Round-14 M2: any persist marks local state dirty for the tick
    // (set synchronously, before the chained write, so a tick firing
    // mid-chain still sees the change).
    this.localDirty = true;
    // Round-5 lane-4 M7: serialize through the save chain (see the
    // field comment) so an older blob can never land after a newer one.
    const run = this.saveChain.then(() => this.saveLocalStateInner(state));
    this.saveChain = run.catch(() => {});
    return run;
  }

  private static async saveLocalStateInner(state: AppState): Promise<void> {
    try {
      // Audit round 4, SYNC-10, as amended by the wave-1 guest fix
      // (#10): a persist with no live session must never write an
      // unstamped blob into the MAIN key — the next account used to
      // legacy-accept it. Instead it writes the separate, owner-less
      // GUEST_KEY, which no signed-in load ever reads (see
      // loadLocalState and migrateLocalStateToAccount). Guest progress
      // therefore survives restarts without an account, and can never
      // land in another user's cache.
      const session = await getSafeSession();
      if (!session?.user?.id) {
        await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(sanitizeSubscriptionState(state)));
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

  /** Round-5 lane-3 M2: record a profile edit before its direct-write
   * push runs. Field-wise merged with any pending record for the same
   * user; a record for another user is replaced (sign-out also clears
   * it via clearLocalState). Best-effort: a storage failure here must
   * never fail the edit itself. */
  static async recordPendingProfileEdit(
    userId: string,
    patch: { displayName?: string | null; reminderTime?: string },
  ): Promise<void> {
    try {
      const hasField = patch.displayName !== undefined || patch.reminderTime !== undefined;
      if (!hasField) return;
      const existing = await this.readPendingProfileEdit();
      const next: PendingProfileEdit = {
        ...(existing && existing.userId === userId ? existing : { userId }),
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.reminderTime !== undefined ? { reminderTime: patch.reminderTime } : {}),
      };
      next.userId = userId;
      await AsyncStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(next));
    } catch {
      // Best effort — the direct push still runs; without a record the
      // pre-existing revert behavior applies to this edit only.
    }
  }

  static async readPendingProfileEdit(): Promise<PendingProfileEdit | null> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingProfileEdit>;
      if (typeof parsed.userId !== 'string' || parsed.userId.length === 0) return null;
      return {
        userId: parsed.userId,
        ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
        ...(parsed.reminderTime !== undefined ? { reminderTime: parsed.reminderTime } : {}),
      };
    } catch {
      return null;
    }
  }

  static async clearPendingProfileEdit(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_PROFILE_KEY);
    } catch {
      // Best effort.
    }
  }

  static async clearLocalState(): Promise<void> {
    // Audit round 4, SYNC-2/SYNC-7: sign-out / delete-account both call
    // this (after stopAutoSync). Clearing the load proof here means a
    // new account never inherits the old account's lastLoadOk, and
    // bumping the sync generation aborts any in-flight sync sequence.
    // Round-14 M2: the new account likewise never inherits the old
    // account's upload hash or clean flag — its first tick must run.
    this.localDirty = true;
    this.lastUploadedStateHash = null;
    DatabaseService.clearLoadSnapshot();
    DatabaseService.bumpSyncGeneration();
    try {
      // Plus every other per-user key the app writes: track progress,
      // completions, the active track, and the journey publish stamp all
      // survived sign-out before and could hydrate the next account.
      // (Key strings duplicated from trackProgress to avoid an import
      // cycle; keep them in sync with that module. The journey publish
      // stamp is no longer written, but still wiped here so a stale
      // stamp can never hydrate a later account.)
      await AsyncStorage.multiRemove([
        STORAGE_KEY,
        LAST_SYNC_KEY,
        OWNER_KEY,
        PENDING_PROFILE_KEY,
        // Wave-1 guest fix (#10): sign-out / delete-account must wipe
        // the guest blob and any migration marker too — otherwise a
        // stale guest snapshot could adopt into the NEXT fresh
        // account on this device, and a stale marker could match a
        // future blob. A guest profile belongs to the current guest
        // session only; signing out starts the next guest session
        // clean (this is also what makes the sign-out persist removal
        // in handleUserUpdate safe — see that comment).
        GUEST_KEY,
        MIGRATION_SOURCE_KEY,
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
      // Wave-1 guest fix (#10): with no live session, the main key is
      // never readable — a guest hydrates ONLY from the owner-less
      // guest key. (A stamped main-key blob must not hydrate a guest:
      // it could be a previous account's leftover after a kill
      // mid-sign-out.) Signed-in loads keep the owner guard below.
      const earlySession = await getSafeSession();
      if (!earlySession?.user?.id) {
        return this.loadGuestState();
      }

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
      // guest. Guest blobs live in GUEST_KEY (see saveLocalStateInner),
      // never in the main key, so they are unaffected by this branch.
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

  // ── Wave-1 guest fix (#10): guest blob + sign-in migration ──
  // The guest blob is device-local, owner-less, and never uploaded.
  // It is written by saveLocalStateInner (no session), read by
  // loadLocalState (no session), consumed by the sign-in migration
  // below, and wiped by clearLocalState (sign-out / delete-account).

  static async loadGuestState(): Promise<AppState | null> {
    try {
      const stored = await AsyncStorage.getItem(GUEST_KEY);
      if (!stored) return null;
      return sanitizeSubscriptionState(JSON.parse(stored) as AppState);
    } catch {
      return null;
    }
  }

  static async clearGuestState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(GUEST_KEY);
    } catch {
      // Best effort.
    }
  }

  static async recordMigrationSourceId(anonymousUserId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(MIGRATION_SOURCE_KEY, anonymousUserId);
    } catch {
      // Best effort — without the marker the migration simply cannot
      // adopt a stranded anonymous blob (guest blobs are unaffected).
    }
  }

  static async readMigrationSourceId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(MIGRATION_SOURCE_KEY);
    } catch {
      return null;
    }
  }

  static async clearMigrationSourceId(): Promise<void> {
    try {
      await AsyncStorage.removeItem(MIGRATION_SOURCE_KEY);
    } catch {
      // Best effort.
    }
  }

  /** Reads the main-key blob ONLY when its owner stamp equals the
   * expected id (the pre-sign-in migration marker). Anything else —
   * another user's blob, an unstamped legacy blob — is not a
   * migration source and is never returned. */
  static async loadStrandedLocalState(expectedOwnerId: string): Promise<AppState | null> {
    try {
      const owner = await AsyncStorage.getItem(OWNER_KEY);
      if (owner !== expectedOwnerId) return null;
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      return sanitizeSubscriptionState(JSON.parse(stored) as AppState);
    } catch {
      return null;
    }
  }

  /** Pure, unit-testable: does this state hold anything a user would
   * miss? Settings-only shells (theme, soundscape, an empty journey)
   * are NOT progress — migrating them would seed noise, so they do
   * not count. Anything completed, recorded, or favorited counts. */
  static hasGuestProgress(state: AppState | null | undefined): boolean {
    if (!state) return false;
    return (
      (state.progress ?? []).some((p) => p.completed) ||
      (state.currentDay ?? 1) > 1 ||
      (state.streakCount ?? 0) > 0 ||
      (state.openStreakCount ?? 0) > 0 ||
      Boolean(state.journeyComplete) ||
      Boolean(state.hasGraduated) ||
      (state.prayerRequests ?? []).length > 0 ||
      (state.answeredPrayers ?? []).length > 0 ||
      (state.reflections ?? []).length > 0 ||
      (state.dailyPrayerLog ?? []).length > 0 ||
      (state.declarationFavorites ?? []).length > 0 ||
      (state.firstStepsCompletedIds ?? []).length > 0 ||
      (state.carriedPrayers ?? []).length > 0 ||
      (state.wallAmenedLocal ?? []).length > 0 ||
      (state.connectionCheckins ?? []).length > 0
    );
  }

  /** Pre-sign-in warning input for auth.tsx: with a live session this
   * is meaningless (a signed-in user's state lives in the main key),
   * so it returns null; with no session it reports the guest blob. */
  static async getGuestProgressSummary(): Promise<{ hasProgress: boolean; daysCompleted: number } | null> {
    const session = await getSafeSession();
    if (session?.user) return null;
    const guest = await this.loadGuestState();
    if (!guest) return { hasProgress: false, daysCompleted: 0 };
    return {
      hasProgress: this.hasGuestProgress(guest),
      daysCompleted: (guest.progress ?? []).filter((p) => p.completed).length,
    };
  }

  /** One-time guest/anonymous → account migration. Called from
   * initialize() BEFORE fullSync, so a default can never seed over
   * guest progress. Returns the adopted state, or null to take the
   * existing fullSync path unchanged. Rules, in order:
   *  1. No session → null (guests never migrate).
   *  2. A usable local state already exists for this user → null
   *     (covers the handleUserUpdate race persist, which already
   *     carried guest progress into the main key stamped with the
   *     new id — adopting again would double-handle it).
   *  3. Source priority: a marker-matched stranded anonymous blob
   *     first (it is the LIVE state — every persist since the Amen
   *     that minted the session went there, while the guest blob
   *     froze at that moment), else the guest blob.
   *  4. Empty shells → consumed, null (normal path).
   *  5. FRESH-ACCOUNT ONLY: if the cloud already holds state for
   *     this account, the account's progress wins and the guest blob
   *     stays on device, untouched — adopting over an established
   *     account would corrupt its cloud truth. A FAILED cloud load
   *     is not an empty account: migration defers (marker + blob
   *     kept) so a later refetch retries, and fullSync's J-S13 guard
   *     still refuses to seed a default over unknown cloud state.
   *  6. Adoption merges via mergeStates (progress/streak/currentDay
   *     derived from the merged progress, lists unioned, subscription
   *     stripped), re-stamps the user id, persists to the MAIN key
   *     (session exists now), and consumes the source. The cloud
   *     upload itself rides the existing AppSync.initializeSync push
   *     path — no new upload path is introduced.
   *  Fields that cannot migrate safely: none identified in AppState —
   *  every field is device-authored journey/journal data, and the
   *  merge keeps the signed-in value wherever the merge rules say so
   *  (e.g. cloud-wins theme). If a future field cannot migrate, it
   *  must be allow-listed here and logged, never silently dropped. */
  static async migrateLocalStateToAccount(): Promise<AppState | null> {
    try {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      if (!userId) return null;

      const existing = await this.loadLocalState();
      if (existing) {
        await this.clearMigrationSourceId();
        return null;
      }

      const marker = await this.readMigrationSourceId();
      let source: AppState | null = null;
      let sourceKind: 'anonymous' | 'guest' | null = null;
      if (marker) {
        source = await this.loadStrandedLocalState(marker);
        if (source) sourceKind = 'anonymous';
      }
      if (!source) {
        source = await this.loadGuestState();
        if (source) sourceKind = 'guest';
      }
      if (!source || !sourceKind) {
        await this.clearMigrationSourceId();
        return null;
      }

      if (!this.hasGuestProgress(source)) {
        if (sourceKind === 'guest') await this.clearGuestState();
        await this.clearMigrationSourceId();
        return null;
      }

      const cloudState = await this.loadFromCloud();
      if (cloudState) {
        if (__DEV__) {
          console.log('[SyncService] Guest migration skipped: account already has cloud state; guest blob left on device');
        }
        await this.clearMigrationSourceId();
        return null;
      }
      if (DatabaseService.lastLoadFailed) {
        if (__DEV__) {
          console.log('[SyncService] Guest migration deferred: cloud load failed, will retry on next hydration');
        }
        return null;
      }

      const merged = await this.mergeStates(source, {});
      // Re-stamp the user: keep the guest's own profile fields
      // (name, reminder, onboarding — it is the same person on this
      // device), but the id MUST become the new account's id, and
      // onboardingComplete stays whatever the guest completed (a
      // migrated guest has genuinely done onboarding).
      const metadata = (session.user as { user_metadata?: Record<string, unknown> }).user_metadata ?? {};
      const metaText = (key: string): string | undefined => {
        const value = metadata[key];
        return typeof value === 'string' && value.length > 0 ? value : undefined;
      };
      const guestUser = source.user ?? null;
      merged.user = {
        id: userId,
        firstName: guestUser?.firstName || metaText('first_name') || metaText('full_name') || '',
        prayerLife: guestUser?.prayerLife ?? 'new',
        onboardingComplete: guestUser?.onboardingComplete ?? false,
        ...(guestUser?.displayName || metaText('full_name') || metaText('name')
          ? { displayName: guestUser?.displayName || metaText('full_name') || metaText('name') }
          : {}),
        ...(guestUser?.reminderTime ? { reminderTime: guestUser.reminderTime } : {}),
        ...(guestUser?.blocker !== undefined ? { blocker: guestUser.blocker } : {}),
      };

      await this.saveLocalState(merged);
      // Consume the source: the guest blob is deleted in both cases
      // (an anonymous adoption's stale guest snapshot must not linger
      // to adopt later); an anonymous source was already overwritten
      // in the main key by the save above.
      await this.clearGuestState();
      await this.clearMigrationSourceId();
      if (__DEV__) {
        console.log(`[SyncService] Guest migration adopted (${sourceKind} blob -> account ${userId})`);
      }
      return merged;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Guest migration failed, keeping guest blob for retry:', error);
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

      // Round-5 lane-4 H1 (conservative): skip the UPLOAD when the state
      // to upload serializes identically to the last successfully
      // uploaded state — the upload would rewrite identical rows. The
      // LOAD still runs on every tick (syncToCloud loads before this),
      // so a newer cloud state changes the merged hash and the upload
      // proceeds. Loads are never skipped and sync is never redesigned
      // here. A hash failure (null) never skips, and a failed upload
      // never updates the hash, so the next tick retries.
      let stateHash: string | null = null;
      try {
        stateHash = JSON.stringify(state);
      } catch {
        stateHash = null;
      }
      if (stateHash !== null && stateHash === this.lastUploadedStateHash) {
        // Nothing new to upload — the merged state is already the
        // last uploaded state, so the dirty flag clears too.
        this.localDirty = false;
        return true;
      }

      this.isSyncing = true;
      await DatabaseService.syncAppState(state);
      if (!DatabaseService.lastSyncFailed && stateHash !== null) {
        this.lastUploadedStateHash = stateHash;
        this.localDirty = false;
      }
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
    // Round-5 lane-3 H2: grace days count as coverage here too, via
    // the same shared walk as calculateStreak — previously this
    // derivation was grace-blind, so a merge derived a streak that
    // dropped the grace-held run. Grace is local-only today (the cloud
    // load carries no graceDaysUsed), so the union is local grace plus
    // any cloud grace a future load ever carries.
    const deriveStreakFromProgress = (progress: typeof mergedProgress): number => {
      const days = new Set<string>();
      for (const p of progress) {
        if (!p.completed || !p.completedAt) continue;
        const t = new Date(p.completedAt).getTime();
        if (!Number.isFinite(t)) continue;
        days.add(prayerDayKey(new Date(Math.min(t, Date.now()))));
      }
      // Audit fix F14 (Daily Prayer part): a Daily-Prayer-only run
      // used to derive a zero streak here because only Foundations
      // progress fed the set, even though the provider counts Daily
      // Prayer days as prayed days. Union the merged Daily Prayer log
      // (reset-filtered, like progress) so streaks converge across
      // devices for Daily-Prayer-only users too. Track (Freedom etc.)
      // completions are NOT in AppState — they live in device-local
      // AsyncStorage the merge never sees — so they still cannot be
      // included here; that half of F14 stays open (see fix report).
      for (const entry of mergedDailyPrayerLog) {
        if (!entry.date || !survivesReset(entry.completedAt)) continue;
        days.add(entry.date);
      }
      if (days.size === 0) return 0;
      const sorted = Array.from(days).sort();
      const graceDays = [
        ...(localState.graceDaysUsed ?? []),
        ...((cloudState.graceDaysUsed as string[] | undefined) ?? []),
      ];
      return countCoveredStreak(Array.from(days), graceDays, sorted[sorted.length - 1]);
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
    // Audit fix F3: jumped-ahead entries are prayed days, not frontier
    // progress — they must not count toward the consecutive-day /
    // all-30 graduation derivation (a jumped Day 30 never finishes the
    // journey; resolveCompletionFrontier already refuses to advance
    // the frontier for jumped days). Streak derivation above still
    // counts them: a prayed day is a prayed day.
    const completedDays = new Set(derivationProgress.filter((p) => p.completed && !p.jumpedAhead).map((p) => p.day));
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
    const completedInstants = [
      ...derivationProgress
        .filter((p) => p.completed && p.completedAt)
        .map((p) => new Date(p.completedAt!).getTime()),
      // Audit fix F14 (Daily Prayer part): lastCompletedDate must also
      // advance on a Daily-Prayer-only run, or the merged state keeps
      // an older date and the streak walk ends early. Same
      // reset-filter as progress; track completions stay out (not in
      // AppState — see deriveStreakFromProgress note above).
      ...mergedDailyPrayerLog
        .filter((e) => e.completedAt && survivesReset(e.completedAt))
        .map((e) => new Date(e.completedAt).getTime()),
    ].filter((t) => Number.isFinite(t));
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

    const mergedState: AppState = {
      ...localState,
      ...cloudState,
      progress: derivationProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: derivedCurrentDay,
      journeyComplete: derivedJourneyComplete,
      // Kai-approved 2026-10-26: graduation is sticky and is NOT cleared
      // by completionClearedAt / reset markers. Explicit OR here (not
      // relying on spread) so a cloud object carrying an undefined key
      // can never overwrite a local true. Device-local until a server
      // column exists — see types/index.ts hasGraduated note.
      hasGraduated: Boolean(localState.hasGraduated || (cloudState as AppState).hasGraduated),
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

    // Round-5 lane-3 M2 (pending-edit outbox, chosen over a newer-wins
    // stamp: no clock to skew, no AppState type change, and the record
    // is verifiable against the cloud row itself). A recorded edit wins
    // the merge for displayName/reminderTime ONLY — the two direct-write
    // user fields — so a failed or killed push cannot be silently
    // reverted by cloud-wins. Once a cloud load shows those exact
    // values, the edit has landed and the record is dropped. A record
    // for another user id never applies (sign-out clears it). Preference
    // fields are NOT covered here (see the fix report residual): their
    // direct-write failures still rely on autosync's local-fallback.
    try {
      const pending = await this.readPendingProfileEdit();
      const mergedUserId = mergedState.user?.id ?? localState.user?.id ?? null;
      if (pending && mergedUserId && pending.userId === mergedUserId) {
        const pendingFields: { displayName?: string; reminderTime?: string } = {};
        if (pending.displayName !== undefined) pendingFields.displayName = pending.displayName ?? undefined;
        if (pending.reminderTime !== undefined) pendingFields.reminderTime = pending.reminderTime;
        const cloudUser = cloudState.user ?? null;
        const confirmed = Object.entries(pendingFields).every(([key, value]) => {
          const cloudValue = key === 'displayName' ? cloudUser?.displayName : cloudUser?.reminderTime;
          // Null-normalized comparison (round-6 lane B): a pending null collapses
          // to undefined above, while an unset cloud name is null — without this,
          // a displayName:null record could never confirm and never clear.
          return (cloudValue ?? null) === (value ?? null);
        });
        if (confirmed) {
          await this.clearPendingProfileEdit();
        } else {
          const baseUser = mergedState.user ?? localState.user;
          if (baseUser) {
            mergedState.user = { ...baseUser, ...pendingFields };
          }
        }
      }
    } catch {
      // Best effort — a storage failure here must never fail the merge;
      // the pending record simply stays for the next merge.
    }

    return mergedState;
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
    this.autoSyncStateGetter = getCurrentState;
    this.autoSyncIntervalMs = SYNC_INTERVAL;

    // Round-14 M2 background backoff: re-arm the timer at the
    // background interval while backgrounded/inactive, and back to
    // 30s on return to foreground. The listener is removed by
    // stopAutoSync; re-arming only restarts the interval clock, it
    // never fires an extra sync. The AppState listener is attached
    // synchronously from the static named import at the top of this
    // file — see that import's comment for why a dynamic
    // import('react-native') must never come back (build 9 launch
    // fatal, 2026-11-03). The jest suite mocks 'react-native' for
    // this module (syncServiceRound5.test.ts).
    this.autoSyncAppStateSubscription = RNAppState.addEventListener('change', (nextState) => {
      if (!this.autoSyncStateGetter) return;
      const nextInterval = nextState === 'active' ? SYNC_INTERVAL : BACKGROUND_SYNC_INTERVAL;
      if (nextInterval !== this.autoSyncIntervalMs) {
        this.autoSyncIntervalMs = nextInterval;
        this.armAutoSyncTimer();
      }
    });
    this.armAutoSyncTimer();
  }

  private static armAutoSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.syncTimer = setInterval(async () => {
      const getter = this.autoSyncStateGetter;
      if (!getter) return;
      // Round-14 M2 dirty-flag skip: when nothing persisted since
      // the last successful upload, the tick's 11-query load +
      // full-state serialization buys nothing — the cloud already
      // holds everything this device has, and a remote-only change
      // needs no re-upload from here. The next persist re-arms the
      // tick, and fullSync / AppSync paths are unaffected.
      if (!this.localDirty) return;
      await this.syncToCloud(getter());
    }, this.autoSyncIntervalMs);
  }

  static stopAutoSync(): void {
    // Audit round 4, SYNC-7: stopping autosync (sign-out and
    // delete-account both do this first) also bumps the sync
    // generation, aborting any in-flight syncAppState sequence.
    DatabaseService.bumpSyncGeneration();
    if (this.autoSyncAppStateSubscription) {
      this.autoSyncAppStateSubscription.remove();
      this.autoSyncAppStateSubscription = null;
    }
    this.autoSyncStateGetter = null;
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

      // Wave-1 guest fix (#10): adopt guest/anonymous progress BEFORE
      // fullSync can seed a default over it. Runs only when no usable
      // local state exists for this user; otherwise the existing path
      // is untouched (a usable local state includes the
      // handleUserUpdate race persist, which already carried guest
      // progress into the main key stamped with the new id).
      if (!localState) {
        const migrated = await this.migrateLocalStateToAccount();
        if (migrated) {
          return migrated;
        }
      } else {
        await this.clearMigrationSourceId();
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
