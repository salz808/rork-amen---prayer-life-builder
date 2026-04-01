import { AppState } from '@/types';
import NetInfo from '@react-native-community/netinfo';
import { DatabaseService } from '@/lib/database';
import { signInAnonymously } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';

export class AppSync {
  private static backgroundSyncPromise: Promise<void> | null = null;
  private static queuedState: AppState | null = null;

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
      const user = await signInAnonymously();
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
