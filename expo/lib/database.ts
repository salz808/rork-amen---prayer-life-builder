import { supabase } from './supabase';
import {
  UserProfile,
  DayProgress,
  WeeklyReflection,
  PrayerRequest,
  AnsweredPrayer,
  AppState,
  UserTier,
} from '@/types';

export interface JourneyStats {
  currentDay: number;
  streakCount: number;
  lastCompletedDate: string | null;
  journeyComplete: boolean;
  lastOpenedDate: string | null;
  openStreakCount: number;
  isSubscriber: boolean;
  tierLevel: UserTier;
  journeyPass: number;
}

export interface PhaseTimings {
  [phaseName: string]: number;
}

function formatDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (!error || typeof error !== 'object') {
    return 'Unknown database error';
  }

  const candidate = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
    error_description?: unknown;
  };

  const parts = [candidate.message, candidate.details, candidate.hint, candidate.code, candidate.error_description]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return 'Unknown database error object';
  }
}

export class DatabaseService {
  private static loadAppStatePromise: Promise<Partial<AppState> | null> | null = null;

  static async getCurrentUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  static async upsertProfile(profile: UserProfile): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        first_name: profile.firstName,
        prayer_life: profile.prayerLife,
        reminder_time: profile.reminderTime,
        onboarding_complete: profile.onboardingComplete,
        blocker: profile.blocker,
      });

    if (error) throw error;
  }

  static async syncActiveSession(dayNumber: number, phase: string | null, secondsElapsed: number): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) return;

    const { error } = await supabase
      .from('active_sessions')
      .upsert({
        user_id: userId,
        day_number: dayNumber,
        phase,
        seconds_elapsed: secondsElapsed,
        updated_at: new Date().toISOString(),
      });

    if (error && __DEV__) {
      console.error('[DatabaseService] Session sync failed:', formatDatabaseError(error));
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      firstName: data.first_name,
      prayerLife: data.prayer_life,
      reminderTime: data.reminder_time,
      onboardingComplete: data.onboarding_complete,
      blocker: data.blocker,
    };
  }

  static async updatePreferences(preferences: {
    darkMode?: boolean;
    fontSize?: 'normal' | 'large';
    ambientMuted?: boolean;
    soundscape?: string;
  }): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({
        dark_mode: preferences.darkMode,
        font_size: preferences.fontSize,
        ambient_muted: preferences.ambientMuted,
        soundscape: preferences.soundscape,
      })
      .eq('id', userId);

    if (error) throw error;
  }

  static async getJourneyStats(journeyPass: number): Promise<JourneyStats | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('journey_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('journey_pass', journeyPass)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      currentDay: data.current_day,
      streakCount: data.streak_count,
      lastCompletedDate: data.last_completed_date,
      journeyComplete: data.journey_complete,
      lastOpenedDate: data.last_opened_date,
      openStreakCount: data.open_streak_count,
      isSubscriber: data.is_subscriber,
      tierLevel: data.tier_level ?? UserTier.FREE,
      journeyPass: data.journey_pass,
    };
  }

  static async upsertJourneyStats(stats: JourneyStats): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('journey_stats')
      .upsert({
        user_id: userId,
        journey_pass: stats.journeyPass,
        current_day: stats.currentDay,
        streak_count: stats.streakCount,
        last_completed_date: stats.lastCompletedDate,
        journey_complete: stats.journeyComplete,
        last_opened_date: stats.lastOpenedDate,
        open_streak_count: stats.openStreakCount,
        is_subscriber: stats.isSubscriber,
        tier_level: stats.tierLevel,
      });

    if (error) throw error;
  }

  static async getDayProgress(journeyPass: number): Promise<DayProgress[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('day_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('journey_pass', journeyPass)
      .order('day', { ascending: true });

    if (error) throw error;

    return (data || []).map(item => ({
      day: item.day,
      completed: item.completed,
      completedAt: item.completed_at,
      duration: item.duration,
    }));
  }

  static async upsertDayProgress(
    day: number,
    progress: DayProgress,
    journeyPass: number
  ): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('day_progress')
      .upsert({
        user_id: userId,
        day,
        journey_pass: journeyPass,
        completed: progress.completed,
        completed_at: progress.completedAt,
        duration: progress.duration,
      });

    if (error) throw error;
  }

  static async getWeeklyReflections(journeyPass: number): Promise<WeeklyReflection[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('weekly_reflections')
      .select('*')
      .eq('user_id', userId)
      .eq('journey_pass', journeyPass)
      .order('week', { ascending: true });

    if (error) throw error;

    return (data || []).map(item => ({
      week: item.week,
      q1: item.question_1,
      q2: item.question_2,
      q3: item.question_3,
      date: item.created_at,
    }));
  }

  static async saveWeeklyReflection(
    reflection: WeeklyReflection,
    journeyPass: number
  ): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('weekly_reflections')
      .upsert({
        user_id: userId,
        week: reflection.week,
        journey_pass: journeyPass,
        question_1: reflection.q1,
        question_2: reflection.q2,
        question_3: reflection.q3,
      });

    if (error) throw error;
  }

  static async getPrayerRequests(): Promise<PrayerRequest[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('prayer_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(item => ({
      id: item.id,
      text: item.text,
      date: item.created_at,
      isAnswered: item.is_answered,
      answer: item.answer,
      answeredAt: item.answered_at,
    }));
  }

  static async savePrayerRequest(request: Omit<PrayerRequest, 'id'>): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('prayer_requests')
      .insert({
        user_id: userId,
        text: request.text,
        is_answered: request.isAnswered,
        answer: request.answer,
        answered_at: request.answeredAt,
      });

    if (error) throw error;
  }

  static async updatePrayerRequest(
    id: string,
    updates: Partial<PrayerRequest>
  ): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('prayer_requests')
      .update({
        text: updates.text,
        is_answered: updates.isAnswered,
        answer: updates.answer,
        answered_at: updates.answeredAt,
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  static async deletePrayerRequest(id: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  static async getAnsweredPrayers(): Promise<AnsweredPrayer[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('answered_prayers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(item => ({
      id: item.id,
      request: item.request,
      answer: item.answer,
      date: item.created_at,
      shared: item.shared,
    }));
  }

  static async saveAnsweredPrayer(prayer: Omit<AnsweredPrayer, 'id'>): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('answered_prayers')
      .insert({
        user_id: userId,
        request: prayer.request,
        answer: prayer.answer,
        shared: prayer.shared,
      });

    if (error) throw error;
  }

  static async getPhaseTimings(): Promise<PhaseTimings> {
    const userId = await this.getCurrentUserId();
    if (!userId) return {};

    const { data, error } = await supabase
      .from('phase_timings')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const timings: PhaseTimings = {};
    (data || []).forEach(item => {
      timings[item.phase_name] = item.total_seconds;
    });

    return timings;
  }

  static async updatePhaseTimings(phaseName: string, seconds: number): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('phase_timings')
      .upsert({
        user_id: userId,
        phase_name: phaseName,
        total_seconds: seconds,
      });

    if (error) throw error;
  }

  static async syncAppState(state: AppState): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) return;

    const safeRun = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        if (__DEV__) {
          console.warn(`[DatabaseService] ${label} skipped:`, formatDatabaseError(error));
        }
      }
    };

    try {
      if (state.user) {
        await safeRun('upsertProfile', () => this.upsertProfile(state.user!));
        await safeRun('updatePreferences', () => this.updatePreferences({
          darkMode: state.darkMode,
          fontSize: state.fontSize,
          ambientMuted: state.ambientMuted,
          soundscape: state.soundscape,
        }));
      }

      await safeRun('upsertJourneyStats', () => this.upsertJourneyStats({
        currentDay: state.currentDay,
        streakCount: state.streakCount,
        lastCompletedDate: state.lastCompletedDate,
        journeyComplete: state.journeyComplete,
        lastOpenedDate: state.lastOpenedDate,
        openStreakCount: state.openStreakCount,
        isSubscriber: state.isSubscriber,
        tierLevel: state.tierLevel,
        journeyPass: state.journeyPass,
      }));

      await safeRun('upsertDayProgress', async () => {
        const progressPromises = state.progress.map(progress =>
          this.upsertDayProgress(progress.day, progress, state.journeyPass)
        );
        await Promise.all(progressPromises);
      });

      await safeRun('saveWeeklyReflections', async () => {
        const reflectionPromises = state.reflections.map(reflection =>
          this.saveWeeklyReflection(reflection, state.journeyPass)
        );
        await Promise.all(reflectionPromises);
      });

      await safeRun('updatePhaseTimings', async () => {
        const timingPromises = Object.entries(state.phaseTimings).map(([phaseName, seconds]) =>
          this.updatePhaseTimings(phaseName, seconds)
        );
        await Promise.all(timingPromises);
      });

      if (state.activeSession) {
        await safeRun('syncActiveSession', () => this.syncActiveSession(
          state.activeSession!.day,
          state.activeSession!.phase,
          state.activeSession!.secondsElapsed
        ));
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[DatabaseService] Sync partially failed:', formatDatabaseError(error));
      }
    }
  }

  static async loadAppState(): Promise<Partial<AppState> | null> {
    if (this.loadAppStatePromise) {
      return this.loadAppStatePromise;
    }

    this.loadAppStatePromise = (async () => {
      const userId = await this.getCurrentUserId();
      if (!userId) return null;

      try {
        const profile = await this.getProfile();
        if (!profile) return null;

        const { data: prefs } = await supabase
          .from('profiles')
          .select('dark_mode, font_size, ambient_muted, soundscape')
          .eq('id', userId)
          .maybeSingle();

        const stats = await this.getJourneyStats(1);
        const progress = await this.getDayProgress(stats?.journeyPass || 1);
        const reflections = await this.getWeeklyReflections(stats?.journeyPass || 1);
        const prayerRequests = await this.getPrayerRequests();
        const answeredPrayers = await this.getAnsweredPrayers();
        const phaseTimings = await this.getPhaseTimings();

        return {
          user: profile,
          currentDay: stats?.currentDay || 1,
          streakCount: stats?.streakCount || 0,
          lastCompletedDate: stats?.lastCompletedDate || null,
          journeyComplete: stats?.journeyComplete || false,
          lastOpenedDate: stats?.lastOpenedDate || null,
          openStreakCount: stats?.openStreakCount || 0,
          isSubscriber: stats?.isSubscriber || false,
          journeyPass: stats?.journeyPass || 1,
          progress,
          reflections,
          prayerRequests,
          answeredPrayers,
          phaseTimings,
          darkMode: prefs?.dark_mode || false,
          fontSize: prefs?.font_size || 'normal',
          ambientMuted: prefs?.ambient_muted || false,
          soundscape: prefs?.soundscape || 'throughTheDoor',
        };
      } catch (e) {
        if (__DEV__) {
          console.error('[DatabaseService] Error loading app state', formatDatabaseError(e));
        }
        return null;
      } finally {
        this.loadAppStatePromise = null;
      }
    })();

    return this.loadAppStatePromise;
  }
}
