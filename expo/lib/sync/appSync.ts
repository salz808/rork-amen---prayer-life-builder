import { AppState, UserProfile } from '@/types';
import NetInfo from '@react-native-community/netinfo';
import { DatabaseService } from '@/lib/database';
import { signInAnonymously } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';

export class AppSync {
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
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    try {
      await DatabaseService.syncAppState(state);
    } catch (e) {
      if (__DEV__) console.error('[AppSync] Background sync failed:', e);
    }
  }

  static async syncJournalEntry(type: 'reflection' | 'whatGoddid' | 'echo', content: string, dayNumber: number) {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    // Journal entries are currently handled by DatabaseService's saveWeeklyReflection 
    // and syncAppState. For individual entries, we'll use syncAppState for now to ensure 
    // consistency across the existing architecture.
  }
}
