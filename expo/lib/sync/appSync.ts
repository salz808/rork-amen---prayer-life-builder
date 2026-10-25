import { AppState } from '@/types';
import NetInfo from '@react-native-community/netinfo';
import { DatabaseService } from '@/lib/database';
import { getSafeSession } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';

export class AppSync {
  private static backgroundSyncPromise: Promise<void> | null = null;
  private static queuedState: AppState | null = null;

  // Audit must-fix #3: set during sign-out / delete-account. While set,
  // background sync drops queued states instead of uploading them, until
  // a queued state matches a live session (i.e. a real sign-in) — which
  // lifts the flag. This stops a post-reset state from being uploaded to
  // the old account when a session survives sign-out.
  static suppressSync = false;

  private static isLockContentionError(error: unknown): boolean {
    let message = '';

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      const candidate = (error as { message?: unknown }).message;
      if (typeof candidate === 'string') {
        message = candidate;
      }
    }

    return message.includes('Lock broken by another request') || message.includes('was released because another request stole it');
  }

  static async initializeSync(localState: AppState): Promise<AppState> {
    try {
      // Guests remain local-only. Automatic anonymous sign-in made startup
      // depend on a Supabase dashboard setting and complicated account linking.
      const session = await getSafeSession();
      const user = session?.user ?? null;
      if (!user) return localState;
      // Audit round 4, SYNC-7/F13: capture the session user id up front
      // and re-check it before any push. A slow load straddling a
      // sign-out/sign-in used to push user A's local state into user
      // B's rows, because this path bypassed syncToCloud's user match.
      const loadUserId = user.id;

      // Pull from Cloud
      const cloudState = await DatabaseService.loadAppState();
      if (!cloudState) {
        // Audit round 3, J-S13: same rule as fullSync — a null cloud
        // state after a FAILED load is not a first-time user. Return the
        // local state without pushing, so a defaulted state never
        // overwrites real cloud stats; the provider suppresses
        // persistence for the session via lastLoadFailed.
        if (DatabaseService.lastLoadFailed) {
          return localState;
        }
        // First time user on cloud — but a missing profile does not
        // prove the child tables are empty (partial delete-account can
        // leave them). Merge surviving rows before pushing, and never
        // push if the session changed during the load.
        const orphanState = await DatabaseService.loadOrphanLists();
        const sessionNow = await getSafeSession();
        if (!sessionNow?.user || sessionNow.user.id !== loadUserId) {
          return localState;
        }
        const stateToPush = orphanState
          ? await SyncService.mergeStates(localState, orphanState)
          : localState;
        if (stateToPush.user) {
          stateToPush.user.id = loadUserId;
        }
        await DatabaseService.syncAppState(stateToPush);
        return stateToPush;
      }

      // Audit round 4, SYNC-7: same session re-check on the merged
      // path — a stale hydration must never land in a new account.
      const sessionAfterMerge = await getSafeSession();
      if (!sessionAfterMerge?.user || sessionAfterMerge.user.id !== loadUserId) {
        return localState;
      }

      // Merge Cloud into Local (Supabase wins)
      const mergedState = await SyncService.mergeStates(localState, cloudState);

      // Add Cloud User ID to Profile
      if (mergedState.user) {
        mergedState.user.id = loadUserId;
      }

      return mergedState;
    } catch (e) {
      if (__DEV__) console.warn('[AppSync] Initialization failed:', e);
      return localState;
    }
  }

  static async backgroundSync(state: AppState) {
    this.queuedState = state;

    if (this.backgroundSyncPromise) {
      return this.backgroundSyncPromise;
    }

    this.backgroundSyncPromise = (async () => {
      while (this.queuedState) {
        const nextState = this.queuedState;
        // Audit round 4, SYNC-7: one sync lock. backgroundSync used to
        // run concurrently with syncToCloud (its own queue, no
        // isSyncing check), interleaving two full-state uploads
        // step-by-step. When the lock is held, keep the snapshot
        // queued and stop: the next persist (or the 30s autosync)
        // retries it. The snapshot is only cleared once it is
        // actually uploaded or safely droppable (wrong user).
        if (SyncService.syncing) {
          break;
        }
        this.queuedState = null;

        // Audit must-fix #3: never upload a state that has no user, and
        // never upload one whose user does not match the live session.
        // A queued snapshot is always replaceable (the next save carries
        // full state), so dropping it is safe; uploading it to the wrong
        // account is not.
        // Audit round 3, J-B1: same for the sign-in hydration window —
        // drop queued states until hydration for the new user lands, and
        // lift the sign-out suppression only for that user's states.
        const session = await getSafeSession();
        const stateUserId = (nextState.user as { id?: string } | null)?.id ?? null;
        if (SyncService.hydrationPending) {
          // Keep (do not drop): the next mutation or autosync retries
          // after hydration lands. Dropping was safe only because a
          // later mutation re-queued — keeping is strictly safer.
          this.queuedState = nextState;
          break;
        }
        if (AppSync.suppressSync) {
          // (hydrationPending states already handled above, so reaching
          // here means hydration for some user completed — require it
          // to be THIS user before lifting.)
          if (session?.user?.id && session.user.id === stateUserId
            && SyncService.hydrationUserId === session.user.id) {
            AppSync.suppressSync = false;
          } else {
            this.queuedState = nextState;
            break;
          }
        }
        if (!stateUserId || session?.user?.id !== stateUserId) {
          continue;
        }

        try {
          const net = await NetInfo.fetch();
          if (!net.isConnected) {
            // Audit round 4, SYNC-7/F10: keep the snapshot queued on
            // offline instead of dropping it — the AsyncStorage blob
            // is the only queue, and a kill before the next mutation
            // used to lose this tick's state.
            this.queuedState = nextState;
            break;
          }
        } catch {
          // NetInfo unavailable — proceed optimistically
        }

        try {
          // Audit round 4, SYNC-2: upload through the merged path, not
          // raw syncAppState — backgroundSync was the third
          // unsynchronized upload path (alongside autosync and
          // initializeSync's push), and it bypassed merge entirely.
          await SyncService.syncToCloud(nextState);
        } catch (e) {
          if (__DEV__ && !this.isLockContentionError(e)) {
            console.error('[AppSync] Background sync failed:', e);
          }
        }
      }
    })().finally(() => {
      this.backgroundSyncPromise = null;
    });

    return this.backgroundSyncPromise;
  }

  // Audit round 4, Low L1: the dead syncJournalEntry stub is deleted.
  // It checked connectivity and then did nothing, with zero callers —
  // a trap for the next engineer who called it expecting a sync.
  // Journal entries sync through syncAppState (see backgroundSync).
}
