import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { AppState } from '@/types';
import { supabase } from './supabase';

const STORAGE_KEY = 'amen_app_state';
const LAST_SYNC_KEY = 'amen_last_sync';
const SYNC_INTERVAL = 30000;

export type SyncStatus = 'idle' | 'saving' | 'synced' | 'offline';

type SyncStatusListener = (status: SyncStatus) => void;

let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _isSyncing = false;
let _currentStatus: SyncStatus = 'idle';
const _statusListeners: SyncStatusListener[] = [];

function emitStatus(status: SyncStatus): void {
  _currentStatus = status;
  for (const listener of _statusListeners) {
    listener(status);
  }
}

export class SyncService {
  static get currentStatus(): SyncStatus {
    return _currentStatus;
  }

  static addStatusListener(listener: SyncStatusListener): () => void {
    _statusListeners.push(listener);
    return () => {
      const idx = _statusListeners.indexOf(listener);
      if (idx !== -1) _statusListeners.splice(idx, 1);
    };
  }

  static async saveLocalState(state: AppState): Promise<void> {
    try {
      emitStatus('saving');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Failed to save local state
    }
  }

  static async loadLocalState(): Promise<AppState | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
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
      // Failed to set last sync time
    }
  }

  static async syncToCloud(state: AppState): Promise<boolean> {
    if (_isSyncing) return false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        emitStatus('offline');
        return false;
      }

      _isSyncing = true;
      emitStatus('saving');

      await DatabaseService.syncAppState(state);
      await this.setLastSyncTime(Date.now());
      emitStatus('synced');
      return true;
    } catch (error) {
      emitStatus('offline');
      return false;
    } finally {
      _isSyncing = false;
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

    return {
      ...localState,
      ...cloudState,
      progress: mergedProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: Math.max(localState.currentDay, cloudState.currentDay || 1),
      streakCount: Math.max(localState.streakCount, cloudState.streakCount || 0),
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
      return currentState;
    }
  }

  static startAutoSync(getCurrentState: () => AppState): void {
    this.stopAutoSync();

    _syncTimer = setInterval(async () => {
      const state = getCurrentState();
      await this.syncToCloud(state);
    }, SYNC_INTERVAL);
  }

  static stopAutoSync(): void {
    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
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
      const localState = await this.loadLocalState();
      return localState || currentState;
    }
  }
}
