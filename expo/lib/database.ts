import { getSafeSession, signInAnonymously, supabase } from './supabase';
import { reportError } from './crashReporter';
import type { PrayerNotification } from './prayerNotifications';
import {
  UserProfile,
  DayProgress,
  WeeklyReflection,
  PrayerRequest,
  AnsweredPrayer,
  DailyPrayerLogEntry,
  AppState,
  UserTier,
  SessionPhase,
  Soundscape,
  CommunityEcho,
  Testimony,
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

const VALID_SESSION_PHASES: SessionPhase[] = ['settle', 'teach', 'triad', 'silence', 'act'];
const FIRST_STEPS_CHECKLIST_TABLE = 'first_steps_checklist';
const DAILY_PRAYER_LOG_TABLE = 'daily_prayer_log';
const MISSING_DAILY_PRAYER_LOG_WARNING = '[DatabaseService] daily_prayer_log unavailable, using local-only daily prayer log';

function normalizeActiveSessionPhase(phase: string | null | undefined): SessionPhase {
  if (typeof phase === 'string' && VALID_SESSION_PHASES.includes(phase as SessionPhase)) {
    return phase as SessionPhase;
  }

  return 'settle';
}

function normalizeSoundscape(soundscape: string | null | undefined): Soundscape {
  const validSoundscapes: Soundscape[] = ['throughTheDoor', 'firstLight', 'reunion', 'monastic'];

  if (typeof soundscape === 'string' && validSoundscapes.includes(soundscape as Soundscape)) {
    return soundscape as Soundscape;
  }

  return 'throughTheDoor';
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

  const safeObject = error as Record<string, unknown>;
  const safeFields = ['name', 'status', 'statusText']
    .map((key) => safeObject[key])
    .filter((value): value is string | number => (
      typeof value === 'string' && value.trim().length > 0
    ) || typeof value === 'number');

  if (safeFields.length > 0) {
    return safeFields.join(' | ');
  }

  return 'Unknown database error object';
}

function isMissingSupabaseTableError(error: unknown, tableName: string): boolean {
  const message = formatDatabaseError(error);

  return message.includes(tableName) && (
    message.includes('PGRST205')
    || message.includes('42P01')
    || message.includes('schema cache')
    || message.includes(`relation "${tableName}" does not exist`)
    || message.includes(`relation "public.${tableName}" does not exist`)
  );
}

function isNetworkFetchFailure(error: unknown): boolean {
  const message = formatDatabaseError(error).toLowerCase();
  return message.includes('failed to fetch') || message.includes('network request failed') || message.includes('fetch failed');
}

function logDatabaseLoadFailure(label: string, error: unknown): void {
  if (!__DEV__) {
    return;
  }

  if (isNetworkFetchFailure(error)) {
    console.warn(`${label} offline or backend unavailable, using local fallback`);
    return;
  }

  console.error(label, formatDatabaseError(error));
}

async function runLoadStep<T>(step: string, fallbackValue: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logDatabaseLoadFailure(`[DatabaseService] ${step} failed:`, error);
    return fallbackValue;
  }
}

export class DatabaseService {
  private static loadAppStatePromise: Promise<Partial<AppState> | null> | null = null;

  static async getCurrentUserId(): Promise<string | null> {
    const session = await getSafeSession();
    return session?.user?.id ?? null;
  }

  /**
   * Wall interactions (amens) must be owned by a stable account. Guests get an
   * anonymous session on demand so their amens persist and upgrade in place
   * (same user id) when they later sign in with Apple or Google.
   */
  private static async ensureWallUserId(): Promise<string | null> {
    const session = await getSafeSession();
    if (session?.user) {
      return session.user.id;
    }

    const user = await signInAnonymously();
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
        display_name: profile.displayName ?? null,
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

    const normalizedPhase = normalizeActiveSessionPhase(phase);
    const payload = {
      user_id: userId,
      day: dayNumber,
      phase: normalizedPhase,
      seconds_elapsed: secondsElapsed,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('active_sessions')
      .upsert(payload, { onConflict: 'user_id' });

    if (!error) {
      return;
    }

    const errorMessage = formatDatabaseError(error);
    const isDuplicateUserSession = errorMessage.includes('active_sessions_user_id_key')
      || errorMessage.includes('duplicate key value violates unique constraint');

    if (isDuplicateUserSession) {
      const { error: updateError } = await supabase
        .from('active_sessions')
        .update({
          day: dayNumber,
          phase: normalizedPhase,
          seconds_elapsed: secondsElapsed,
          updated_at: payload.updated_at,
        })
        .eq('user_id', userId);

      if (!updateError) {
        return;
      }

      if (__DEV__) {
        console.error('[DatabaseService] Session sync failed:', formatDatabaseError(updateError));
      }

      return;
    }

    if (__DEV__) {
      console.error('[DatabaseService] Session sync failed:', errorMessage);
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    try {
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
    } catch (error) {
      if (isNetworkFetchFailure(error)) {
        logDatabaseLoadFailure('[DatabaseService] getProfile failed:', error);
        return null;
      }

      throw error;
    }
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

  static async getDailyPrayerLog(): Promise<DailyPrayerLogEntry[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from(DAILY_PRAYER_LOG_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });

    if (error) {
      if (isMissingSupabaseTableError(error, DAILY_PRAYER_LOG_TABLE)) {
        if (__DEV__) {
          console.warn(MISSING_DAILY_PRAYER_LOG_WARNING);
        }
        return [];
      }

      throw error;
    }

    return (data || []).map((item) => ({
      date: item.date,
      day: item.day,
      completedAt: item.completed_at,
      duration: item.duration ?? 0,
    }));
  }

  static async upsertDailyPrayerLogEntry(entry: DailyPrayerLogEntry): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from(DAILY_PRAYER_LOG_TABLE)
      .upsert({
        user_id: userId,
        date: entry.date,
        day: entry.day,
        completed_at: entry.completedAt,
        duration: entry.duration,
      }, { onConflict: 'user_id,date' });

    if (error) {
      if (isMissingSupabaseTableError(error, DAILY_PRAYER_LOG_TABLE)) {
        if (__DEV__) {
          console.warn(MISSING_DAILY_PRAYER_LOG_WARNING);
        }
        return;
      }

      throw error;
    }
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

  /**
   * Upserts one local prayer request by its client UUID. Local ids are UUIDs
   * (generateSecureId), so upsert-on-id keeps multi-device sync from
   * duplicating rows — and, unlike the old upload path, prayers are uploaded
   * at all instead of living only on one device.
   */
  static async upsertPrayerRequest(request: PrayerRequest): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('prayer_requests')
      .upsert({
        id: request.id,
        user_id: userId,
        text: request.text,
        is_answered: request.isAnswered,
        answer: request.answer ?? null,
        answered_at: request.answeredAt ?? null,
      }, { onConflict: 'id' });

    if (error) throw error;
  }

  /** Same upsert pattern for answered prayers (client UUID ids). */
  static async upsertAnsweredPrayer(prayer: AnsweredPrayer): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('answered_prayers')
      .upsert({
        id: prayer.id,
        user_id: userId,
        request: prayer.request,
        answer: prayer.answer,
        shared: prayer.shared ?? false,
      }, { onConflict: 'id' });

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

  /** Declaration favorites: ids only — the declaration texts live in mocks. */
  static async getDeclarationFavorites(): Promise<string[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('declaration_favorites')
      .select('declaration_id')
      .eq('user_id', userId);

    if (error) throw error;
    return (data || []).map((row) => row.declaration_id);
  }

  static async syncDeclarationFavorites(ids: string[]): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    if (ids.length === 0) return;

    const { error } = await supabase
      .from('declaration_favorites')
      .upsert(
        ids.map((declaration_id) => ({ user_id: userId, declaration_id })),
        { onConflict: 'user_id,declaration_id' }
      );

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

  static async getFirstStepsCompletedIds(): Promise<string[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from(FIRST_STEPS_CHECKLIST_TABLE)
      .select('item_id')
      .eq('user_id', userId)
      .order('completed_at', { ascending: true });

    if (error) {
      if (isMissingSupabaseTableError(error, FIRST_STEPS_CHECKLIST_TABLE)) {
        if (__DEV__) {
          console.warn('[DatabaseService] first_steps_checklist unavailable, returning empty checklist state');
        }
        return [];
      }

      throw error;
    }

    return (data || [])
      .map((item) => item.item_id)
      .filter((itemId): itemId is string => typeof itemId === 'string' && itemId.length > 0);
  }

  static async syncFirstStepsChecklist(completedIds: string[]): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error: deleteError } = await supabase
      .from(FIRST_STEPS_CHECKLIST_TABLE)
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      if (isMissingSupabaseTableError(deleteError, FIRST_STEPS_CHECKLIST_TABLE)) {
        if (__DEV__) {
          console.warn('[DatabaseService] first_steps_checklist unavailable, skipping checklist sync');
        }
        return;
      }

      throw deleteError;
    }

    if (completedIds.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const { error: insertError } = await supabase
      .from(FIRST_STEPS_CHECKLIST_TABLE)
      .insert(completedIds.map((itemId) => ({
        user_id: userId,
        item_id: itemId,
        completed_at: timestamp,
      })));

    if (insertError) {
      if (isMissingSupabaseTableError(insertError, FIRST_STEPS_CHECKLIST_TABLE)) {
        if (__DEV__) {
          console.warn('[DatabaseService] first_steps_checklist unavailable, skipping checklist insert');
        }
        return;
      }

      throw insertError;
    }
  }

  /** ── Community Echoes ── */

  static async getCommunityEchoes(scope?: { circleId: string }, page?: { cursor?: string; pageSize?: number }): Promise<CommunityEcho[]> {
    let query = supabase
      .from('community_echoes')
      .select('id, user_id, text, amens, created_at')
      .order('created_at', { ascending: false })
      .limit(page?.pageSize ?? 100);

    // Cursor pagination: .lte (not .lt) so rows sharing the boundary
    // timestamp are never skipped — callers dedup by id on append.
    if (page?.cursor) {
      query = query.lte('created_at', page.cursor);
    }

    // Without a scope only the public wall is returned; circle echoes stay
    // private to their members.
    query = scope ? query.eq('circle_id', scope.circleId) : query.is('circle_id', null);

    // Muted-author filtering happens client-side: SQL NOT IN would also drop
    // rows whose user_id is NULL (anonymous/seeded posts).
    const [result, mutedAuthors] = await Promise.all([query, this.getMutedAuthorIds()]);
    const { data, error } = result;

    if (error) {
      if (__DEV__) {
        console.warn('[DatabaseService] getCommunityEchoes failed:', formatDatabaseError(error));
      }
      throw error;
    }

    return (data || [])
      .filter((item) => item.user_id == null || !mutedAuthors.has(item.user_id))
      .map((item) => ({
      id: item.id,
      userId: item.user_id,
      text: item.text,
      amens: item.amens,
      createdAt: item.created_at,
    }));
  }

  static async createCommunityEcho(text: string, circleId?: string | null): Promise<CommunityEcho | null> {
    // Posting to the public wall requires a verified identity — anonymous
    // sessions may amen but not post.
    const session = await getSafeSession();
    const userId = session?.user && session.user.is_anonymous !== true ? session.user.id : null;
    if (!userId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('community_echoes')
      .insert({
        user_id: userId,
        text,
        amens: 0,
        circle_id: circleId ?? null,
      })
      .select('id, user_id, text, amens, created_at')
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      text: data.text,
      amens: data.amens,
      createdAt: data.created_at,
    };
  }

  static async amenEcho(echoId: string): Promise<{ success: boolean; alreadyAmened: boolean }> {
    const userId = await this.ensureWallUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase.rpc('amen_community_echo', {
      p_echo_id: echoId,
    });

    if (error) {
      const message = formatDatabaseError(error);
      if (message.includes('duplicate key') || message.includes('unique') || message.includes('23505')) {
        return { success: false, alreadyAmened: true };
      }

      if (__DEV__) {
        console.warn('[DatabaseService] amenEcho failed:', message);
      }
      throw error;
    }

    return { success: true, alreadyAmened: false };
  }

  static async getUserAmenedEchoIds(): Promise<Set<string>> {
    const userId = await this.getCurrentUserId();
    if (!userId) return new Set();

    const { data, error } = await supabase
      .from('community_amens')
      .select('echo_id')
      .eq('user_id', userId);

    if (error) {
      if (__DEV__) {
        console.warn('[DatabaseService] getUserAmenedEchoIds failed:', formatDatabaseError(error));
      }
      return new Set();
    }

    return new Set((data || []).map((item) => item.echo_id));
  }

  // ── Prayer notifications ("someone prayed for you" bell) ──────────────
  // Server rows are written by the amen RPC at milestones (1, 5, 10, 25,
  // 50, 100) and carry no pray-er identity. Until migration
  // 20261025000002 lands, every read below fails closed to "nothing" —
  // the bell simply stays quiet instead of erroring.

  static async getPrayerNotifications(limit = 50): Promise<PrayerNotification[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('prayer_notifications')
        .select('id, echo_id, milestone, created_at, seen_at, community_echoes(text)')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const echo = row.community_echoes as { text?: string } | { text?: string }[] | null;
        const text = Array.isArray(echo) ? echo[0]?.text : echo?.text;
        return {
          id: row.id as string,
          echoId: row.echo_id as string,
          echoText: text ?? '',
          milestone: row.milestone as number,
          createdAt: row.created_at as string,
          seenAt: (row.seen_at as string | null) ?? null,
        };
      });
    } catch {
      return [];
    }
  }

  static async getUnseenPrayerNotificationCount(): Promise<number> {
    const userId = await this.getCurrentUserId();
    if (!userId) return 0;
    try {
      const { count, error } = await supabase
        .from('prayer_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('seen_at', null);
      if (error) throw error;
      return count ?? 0;
    } catch {
      return 0;
    }
  }

  static async markPrayerNotificationsSeen(): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('prayer_notifications')
        .update({ seen_at: new Date().toISOString() })
        .eq('recipient_id', userId)
        .is('seen_at', null);
      if (error) throw error;
    } catch {
      // Badge clearing is best-effort: a failed mark just means the dot
      // stays until the next successful open. Never surface it as an error.
    }
  }

  /** Settings toggle. Defaults to true (including when no profile row exists yet). */
  static async getWallPrayerNotificationsEnabled(): Promise<boolean> {
    const userId = await this.getCurrentUserId();
    if (!userId) return true;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('wall_prayer_notifications')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data?.wall_prayer_notifications as boolean | null) ?? true;
    } catch {
      return true;
    }
  }

  static async setWallPrayerNotificationsEnabled(enabled: boolean): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    // Audit must-fix #9: a plain update touches 0 rows when no profile row
    // exists yet and returns no error, so the toggle looked saved while the
    // RPC's COALESCE default (true) kept notifying. Upsert instead, so the
    // preference always lands. (Relies on the first_name DEFAULT '' from
    // migration 20261025000004 for the bare-row case.)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, wall_prayer_notifications: enabled }, { onConflict: 'id' });
    if (error) throw error;
  }

  /** RevenueCat opaque alias id (audit must-fix #2). Never the Supabase user id. */
  static async getRevenueCatAliasId(): Promise<string> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    // Audit round 2, hole #1: NEVER select rc_alias_id from the table.
    // RLS cannot restrict columns, and the co-member profile policy would
    // let any circle co-member read another member's alias — the exact
    // attack this alias exists to prevent. The get_my_rc_alias RPC returns
    // only the caller's own alias, and the column is revoked from direct
    // reads (migration 20261025000007).
    const { data, error } = await supabase.rpc('get_my_rc_alias');
    if (error) throw error;
    if (data) return data as string;
    // No profile row yet (or a legacy row predating the column): create one
    // so the column default mints an alias, then re-read it via the RPC.
    // Never fall back to the real user id — that would reopen the exact
    // hole this fixes.
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: userId }, { onConflict: 'id' });
    if (upsertError) throw upsertError;
    const { data: retryData, error: retryError } = await supabase.rpc('get_my_rc_alias');
    if (retryError) throw retryError;
    if (!retryData) throw new Error('Could not establish RevenueCat alias id');
    return retryData as string;
  }

  /** 13+ attestation state for the caller (audit round 2, hole #4). Throws on read error; callers decide fail-open vs fail-closed. */
  static async getAgeAttested(): Promise<boolean> {
    const userId = await this.getCurrentUserId();
    if (!userId) return false;
    const { data, error } = await supabase
      .from('profiles')
      .select('age_attested_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.age_attested_at != null;
  }

  /** Record a 13+ attestation (audit must-fix #5). Bare upsert, same shape as the toggle. */
  static async recordAgeAttestation(): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, age_attested_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  }

  /** Single echo by id, for landing on a bell entry from the wall. */
  static async getCommunityEchoById(echoId: string): Promise<CommunityEcho | null> {
    try {
      const { data, error } = await supabase
        .from('community_echoes')
        .select('id, user_id, text, amens, created_at')
        .eq('id', echoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        text: data.text,
        amens: data.amens,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  }

  /** Author ids the current user has chosen to hide from the wall. */
  static async getMutedAuthorIds(): Promise<Set<string>> {
    const userId = await this.getCurrentUserId();
    if (!userId) return new Set();

    // Both mute tables must be read: echo reports write echo_mutes, but
    // testimony reports write testimony_mutes. Reading only one made
    // reported testimonies resurface on the next wall load.
    const [echoMutes, testimonyMutes] = await Promise.all([
      supabase
        .from('echo_mutes')
        .select('muted_user_id')
        .eq('user_id', userId),
      supabase
        .from('testimony_mutes')
        .select('muted_user_id')
        .eq('user_id', userId),
    ]);

    if (echoMutes.error) {
      if (__DEV__) {
        console.warn('[DatabaseService] getMutedAuthorIds failed:', formatDatabaseError(echoMutes.error));
      }
    }
    if (testimonyMutes.error) {
      if (__DEV__) {
        console.warn('[DatabaseService] getMutedAuthorIds (testimonies) failed:', formatDatabaseError(testimonyMutes.error));
      }
    }

    const ids = new Set<string>();
    for (const row of echoMutes.data || []) ids.add(row.muted_user_id);
    for (const row of testimonyMutes.data || []) ids.add(row.muted_user_id);
    return ids;
  }

  /** Files a report and hides the author's requests from this user. */
  static async reportEcho(echoId: string, reason?: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase.rpc('report_community_echo', {
      p_echo_id: echoId,
      p_reason: reason ?? null,
    });

    if (error) {
      // Already reported — it is already hidden for this user.
      const message = formatDatabaseError(error);
      if (message.includes('23505') || message.includes('duplicate key')) return;
      throw error;
    }
  }

  /** Hides an author's requests from this user without reporting. */
  static async muteEchoAuthor(mutedUserId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('echo_mutes')
      .insert({ user_id: userId, muted_user_id: mutedUserId });

    if (error) {
      const message = formatDatabaseError(error);
      if (message.includes('23505') || message.includes('duplicate key')) return;
      throw error;
    }
  }

  static async unmuteEchoAuthor(mutedUserId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase.rpc('unmute_community_echo_author', {
      p_muted_user_id: mutedUserId,
    });
    if (error) throw error;
  }

  /** Removes a testimony-report mute (testimony_mutes has a delete-own policy). */
  static async unmuteTestimonyAuthor(mutedUserId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('testimony_mutes')
      .delete()
      .eq('user_id', userId)
      .eq('muted_user_id', mutedUserId);
    if (error) throw error;
  }

  /** Clears an author from both mute tables — reports may have muted either one. */
  static async unmuteAuthorEverywhere(mutedUserId: string): Promise<void> {
    await this.unmuteEchoAuthor(mutedUserId);
    await this.unmuteTestimonyAuthor(mutedUserId);
  }

  /**
   * First names for muted authors who have public testimonies, so the
   * Settings "Muted authors" list can show a name instead of an id.
   * Echo authors have no public name — callers label them anonymous.
   */
  static async getMutedAuthorDisplayNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    try {
      const muted = await this.getMutedAuthorIds();
      if (muted.size === 0) return names;
      const { data, error } = await supabase
        .from('community_testimonies')
        .select('user_id, first_name')
        .in('user_id', Array.from(muted));
      if (error || !data) return names;
      for (const row of data) {
        if (row.user_id && row.first_name && !names.has(row.user_id)) {
          names.set(row.user_id, row.first_name);
        }
      }
    } catch {
      // Display names are cosmetic — the mute list works without them.
    }
    return names;
  }

  static async deleteOwnEcho(echoId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('community_echoes')
      .delete()
      .eq('id', echoId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  /** ── Community Testimonies (shared answered prayers) ── */

  static async getCommunityTestimonies(page?: { cursor?: string; pageSize?: number }): Promise<Testimony[]> {
    let query = supabase
      .from('community_testimonies')
      .select('id, user_id, request, answer, first_name, created_at')
      .order('created_at', { ascending: false })
      .limit(page?.pageSize ?? 50);

    // Same .lte + caller-dedup rule as echoes (see above).
    if (page?.cursor) {
      query = query.lte('created_at', page.cursor);
    }

    const [result, mutedAuthors] = await Promise.all([query, this.getMutedAuthorIds()]);
    const { data, error } = result;

    if (error) {
      if (__DEV__) {
        console.warn('[DatabaseService] getCommunityTestimonies failed:', formatDatabaseError(error));
      }
      throw error;
    }

    return (data || [])
      .filter((item) => item.user_id == null || !mutedAuthors.has(item.user_id))
      .map((item) => ({
        id: item.id,
        userId: item.user_id,
        request: item.request,
        answer: item.answer,
        firstName: item.first_name,
        createdAt: item.created_at,
      }));
  }

  static async createTestimony(request: string, answer: string, firstName: string): Promise<Testimony | null> {
    // Sharing a testimony requires a verified identity — anonymous sessions
    // may amen but never post to the public wall (same rule as echoes).
    const session = await getSafeSession();
    const userId = session?.user && session.user.is_anonymous !== true ? session.user.id : null;
    if (!userId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('community_testimonies')
      .insert({
        user_id: userId,
        request,
        answer,
        first_name: firstName,
      })
      .select('id, user_id, request, answer, first_name, created_at')
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      request: data.request,
      answer: data.answer,
      firstName: data.first_name,
      createdAt: data.created_at,
    };
  }

  static async deleteOwnTestimony(testimonyId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('community_testimonies')
      .delete()
      .eq('id', testimonyId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  static async reportTestimony(testimonyId: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('report_testimony', {
      p_testimony_id: testimonyId,
      p_reason: reason ?? null,
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
        // Audit must-fix #4: sync failures used to be swallowed with a
        // __DEV__-only warning, so a Monastic user whose soundscape the
        // database rejected never knew their preference wasn't syncing.
        // Report in production too; the DEV log stays for local debugging.
        reportError('SyncAppState', error instanceof Error ? error : new Error(String(error)), { label });
        if (__DEV__) {
          console.warn(`[DatabaseService] ${label} skipped:`, formatDatabaseError(error));
        }
      }
    };

    try {
      if (state.user) {
        await safeRun('upsertProfile', () => this.upsertProfile(state.user!));
        await safeRun('updatePreferences', () => this.updatePreferences({
          darkMode: true,
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

      await safeRun('syncDailyPrayerLog', async () => {
        const dailyPrayerPromises = (state.dailyPrayerLog ?? []).map((entry) => this.upsertDailyPrayerLogEntry(entry));
        await Promise.all(dailyPrayerPromises);
      });

      await safeRun('syncFirstStepsChecklist', () => this.syncFirstStepsChecklist(state.firstStepsCompletedIds ?? []));

      // Prayer lists and favorites were local-only before: a user who added
      // prayers on one device and signed in on another got the cloud's
      // older/empty lists overwriting them. Upsert by client UUID id.
      await safeRun('syncPrayerRequests', async () => {
        const uploadPromises = (state.prayerRequests ?? []).map((request) => this.upsertPrayerRequest(request));
        await Promise.all(uploadPromises);
      });

      await safeRun('syncAnsweredPrayers', async () => {
        const uploadPromises = (state.answeredPrayers ?? []).map((prayer) => this.upsertAnsweredPrayer(prayer));
        await Promise.all(uploadPromises);
      });

      await safeRun('syncDeclarationFavorites', () => this.syncDeclarationFavorites(state.declarationFavorites ?? []));

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

        const prefs = await runLoadStep('load preferences', null as {
          dark_mode?: boolean | null;
          font_size?: 'normal' | 'large' | null;
          ambient_muted?: boolean | null;
          soundscape?: string | null;
        } | null, async () => {
          const { data, error } = await supabase
            .from('profiles')
            .select('dark_mode, font_size, ambient_muted, soundscape')
            .eq('id', userId)
            .maybeSingle();

          if (error) {
            throw error;
          }

          return data;
        });

        const stats = await runLoadStep('load journey stats', null as JourneyStats | null, () => this.getJourneyStats(1));
        const journeyPass = stats?.journeyPass ?? 1;
        const progress = await runLoadStep('load day progress', [] as DayProgress[], () => this.getDayProgress(journeyPass));
        const reflections = await runLoadStep('load weekly reflections', [] as WeeklyReflection[], () => this.getWeeklyReflections(journeyPass));
        const prayerRequests = await runLoadStep('load prayer requests', [] as PrayerRequest[], () => this.getPrayerRequests());
        const answeredPrayers = await runLoadStep('load answered prayers', [] as AnsweredPrayer[], () => this.getAnsweredPrayers());
        const declarationFavorites = await runLoadStep('load declaration favorites', [] as string[], () => this.getDeclarationFavorites());
        const phaseTimings = await runLoadStep('load phase timings', {} as PhaseTimings, () => this.getPhaseTimings());
        const dailyPrayerLog = await runLoadStep('load daily prayer log', [] as DailyPrayerLogEntry[], () => this.getDailyPrayerLog());
        const firstStepsCompletedIds = await runLoadStep('load first steps checklist', [] as string[], () => this.getFirstStepsCompletedIds());

        return {
          user: profile,
          currentDay: stats?.currentDay ?? 1,
          streakCount: stats?.streakCount ?? 0,
          lastCompletedDate: stats?.lastCompletedDate ?? null,
          journeyComplete: stats?.journeyComplete ?? false,
          lastOpenedDate: stats?.lastOpenedDate ?? null,
          openStreakCount: stats?.openStreakCount ?? 0,
          isSubscriber: stats?.isSubscriber ?? false,
          journeyPass,
          progress,
          reflections,
          prayerRequests,
          answeredPrayers,
          declarationFavorites,
          phaseTimings,
          dailyPrayerLog,
          firstStepsCompletedIds,
          darkMode: true,
          fontSize: prefs?.font_size ?? 'normal',
          ambientMuted: prefs?.ambient_muted ?? false,
          soundscape: normalizeSoundscape(prefs?.soundscape),
        };
      } catch (e) {
        logDatabaseLoadFailure('[DatabaseService] Error loading app state', e);
        return null;
      } finally {
        this.loadAppStatePromise = null;
      }
    })();

    return this.loadAppStatePromise;
  }
}
