import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { AppState } from '@/types';
import { supabase } from './supabase';

const STORAGE_KEY = 'amen_app_state';
const LAST_SYNC_KEY = 'amen_last_sync';
const SYNC_INTERVAL = 30000;

export class SyncService {
  private static syncTimer: NodeJS.Timeout | null = null;
  private static isSyncing = false;

  static async saveLocalState(state: AppState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to save local state:', error);
      }
    }
  }

  static async loadLocalState(): Promise<AppState | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      this.isSyncing = true;

      await DatabaseService.syncAppState(state);
      await this.setLastSyncTime(Date.now());
      return true;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to sync to cloud:', error);
      }
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  static async loadFromCloud(): Promise<Partial<AppState> | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const cloudState = await DatabaseService.loadAppState();
      if (cloudState) {
        await this.setLastSyncTime(Date.now());
      }
      return cloudState;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Failed to load from cloud:', error);
      }
      return null;
    }
  }

  static async mergeStates(
    localState: AppState,
    cloudState: Partial<AppState>
  ): Promise<AppState> {
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

    for (const [phase, cloudSeconds] of Object.entries(cloudState.phaseTimings || {})) {
      const localSeconds = localState.phaseTimings[phase] || 0;
      mergedPhaseTimings[phase] = Math.max(localSeconds, cloudSeconds);
    }

    const mergedCurrentDay = localState.currentDay === 1 && localState.progress.length === 0 ? (cloudState.currentDay || 1) : localState.currentDay;
    const mergedStreakCount = localState.currentDay === 1 && localState.progress.length === 0 ? (cloudState.streakCount || 0) : localState.streakCount;

    return {
      ...localState,
      ...cloudState,
      progress: mergedProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: mergedCurrentDay,
      streakCount: mergedStreakCount,
    };
  }

  static async fullSync(currentState: AppState): Promise<AppState> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return currentState;

    try {
      const cloudState = await this.loadFromCloud();

      if (!cloudState) {
        await this.syncToCloud(currentState);
        return currentState;
      }

      const mergedState = await this.mergeStates(currentState, cloudState);

      await this.saveLocalState(mergedState);
      await this.syncToCloud(mergedState);

      return mergedState;
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Full sync failed:', error);
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
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const localState = await this.loadLocalState();
        return localState || currentState;
      }

      return await this.fullSync(currentState);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Initialization failed, using local state:', error);
      }
      const localState = await this.loadLocalState();
      return localState || currentState;
    }
  }
}
