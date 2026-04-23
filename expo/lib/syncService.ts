import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';
import { AppState } from '@/types';
import { getSafeSession } from './supabase';

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
const SYNC_INTERVAL = 30000;

export class SyncService {
  private static syncTimer: ReturnType<typeof setInterval> | null = null;
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
      const session = await getSafeSession();
      if (!session?.user) return false;

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

    const mergedCurrentDay = localState.currentDay === 1 && localState.progress.length === 0 ? (cloudState.currentDay || 1) : localState.currentDay;
    const mergedStreakCount = localState.currentDay === 1 && localState.progress.length === 0 ? (cloudState.streakCount || 0) : localState.streakCount;
    const mergedTierLevel = Math.max(localState.tierLevel, cloudState.tierLevel ?? 0);
    const mergedFirstStepsCompletedIds = Array.from(new Set([
      ...(localState.firstStepsCompletedIds ?? []),
      ...(cloudState.firstStepsCompletedIds ?? []),
    ]));

    return {
      ...localState,
      ...cloudState,
      progress: mergedProgress,
      phaseTimings: mergedPhaseTimings,
      currentDay: mergedCurrentDay,
      streakCount: mergedStreakCount,
      tierLevel: mergedTierLevel,
      dailyPrayerLog: mergedDailyPrayerLog,
      firstStepsCompletedIds: mergedFirstStepsCompletedIds,
    };
  }

  static async fullSync(currentState: AppState): Promise<AppState> {
    const session = await getSafeSession();
    if (!session?.user) return currentState;

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
      const session = await getSafeSession();

      if (!session?.user) {
        const localState = await this.loadLocalState();
        return localState || currentState;
      }

      return await this.fullSync(currentState);
    } catch (error) {
      if (__DEV__) {
        console.error('[SyncService] Initialization failed, using local state:', getSafeErrorMessage(error));
      }
      const localState = await this.loadLocalState();
      return localState || currentState;
    }
  }
}
