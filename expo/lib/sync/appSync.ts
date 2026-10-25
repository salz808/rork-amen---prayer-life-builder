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

      // Pull from Cloud
      const cloudState = await DatabaseService.loadAppState();
      if (!cloudState) {
        // First time user on cloud, push local state
        await DatabaseService.syncAppState(localState);
        return localState;
      }

      // Merge Cloud into Local (Supabase wins)
      const mergedState = await SyncService.mergeStates(localState, cloudState);
      
      // Add Cloud User ID to Profile
      if (mergedState.user) {
        mergedState.user.id = user.id;
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
        this.queuedState = null;

        // Audit must-fix #3: never upload a state that has no user, and
        // never upload one whose user does not match the live session.
        // A queued snapshot is always replaceable (the next save carries
        // full state), so dropping it is safe; uploading it to the wrong
        // account is not.
        const session = await getSafeSession();
        const stateUserId = (nextState.user as { id?: string } | null)?.id ?? null;
        if (AppSync.suppressSync) {
          if (session?.user?.id && session.user.id === stateUserId) {
            AppSync.suppressSync = false;
          } else {
            continue;
          }
        }
        if (!stateUserId || session?.user?.id !== stateUserId) {
          continue;
        }

        try {
          const net = await NetInfo.fetch();
          if (!net.isConnected) {
            continue;
          }
        } catch {
          // NetInfo unavailable — proceed optimistically
        }

        try {
          await DatabaseService.syncAppState(nextState);
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

  static async syncJournalEntry(_type: 'reflection' | 'whatGoddid' | 'echo', _content: string, _dayNumber: number) {
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
    } catch {
      // NetInfo unavailable — proceed optimistically
    }

    // Journal entries are currently handled by DatabaseService's saveWeeklyReflection 
    // and syncAppState. For individual entries, we'll use syncAppState for now to ensure 
    // consistency across the existing architecture.
  }
}
