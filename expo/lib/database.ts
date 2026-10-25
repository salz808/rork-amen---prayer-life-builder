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
  Soundscape,
  CommunityEcho,
  Testimony,
  HiddenWallPost,
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
  /** Audit round 4, SYNC-5: reset marker, synced via journey_stats.reset_at
   * (migration 20261025000015). Undefined when the column has not
   * deployed yet — callers must treat it as "no marker". */
  resetAt?: string | null;
}

export interface PhaseTimings {
  [phaseName: string]: number;
}

const FIRST_STEPS_CHECKLIST_TABLE = 'first_steps_checklist';
const DAILY_PRAYER_LOG_TABLE = 'daily_prayer_log';
const MISSING_DAILY_PRAYER_LOG_WARNING = '[DatabaseService] daily_prayer_log unavailable, using local-only daily prayer log';

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

// Audit round 4, SYNC-1: runLoadStep swallows errors, so a failed step
// used to look like an empty snapshot. The result form reports failure
// explicitly; loadAppState sets lastLoadOk ONLY when every step that
// feeds a delete-capable sync step succeeded.
async function runLoadStepResult<T>(step: string, fallbackValue: T, fn: () => Promise<T>): Promise<{ ok: boolean; value: T }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    logDatabaseLoadFailure(`[DatabaseService] ${step} failed:`, error);
    return { ok: false, value: fallbackValue };
  }
}

// Audit round 4, SYNC-9: a future-dated completion instant must never
// win a merge or zero a streak — clamp to now at the write boundary.
function clampCompletedAt(completedAt: string | undefined | null): string | undefined | null {
  if (!completedAt) return completedAt;
  const t = new Date(completedAt).getTime();
  if (!Number.isFinite(t)) return completedAt;
  return t > Date.now() ? new Date().toISOString() : completedAt;
}

function clampNonNegative(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
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
        // Audit round 3, J-S13: a network failure here used to be
        // indistinguishable from "new user, no profile" — loadAppState
        // returned null either way and the caller seeded a defaulted
        // state over real cloud stats. Record it so loadAppState (and
        // its callers) can tell failure apart from first-run.
        DatabaseService.lastProfileNetworkFailed = true;
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
    // Audit round 3, J-B13 + J-S19: theme/voiceover/adaptive/playback
    // round-trip through the cloud so a second device or reinstall keeps
    // them (they used to live only in local storage, which sanitize then
    // wiped on every save).
    themePreference?: string;
    voiceoverEnabled?: boolean;
    adaptiveReminderEnabled?: boolean;
    playbackRate?: number;
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
        theme_preference: preferences.themePreference,
        voiceover_enabled: preferences.voiceoverEnabled,
        adaptive_reminder_enabled: preferences.adaptiveReminderEnabled,
        playback_rate: preferences.playbackRate,
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
      resetAt: (data as { reset_at?: string | null }).reset_at ?? null,
    };
  }

  // Audit round 3, J-B3: loadAppState used to hardcode pass 1, so a
  // second-pass user's cloud progress loaded as pass 1's (or empty).
  // The latest pass is the load's pass; day progress, reflections, and
  // stats all key off it.
  static async getLatestJourneyStats(): Promise<JourneyStats | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('journey_stats')
      .select('*')
      .eq('user_id', userId)
      .order('journey_pass', { ascending: false })
      .limit(1)
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
      resetAt: (data as { reset_at?: string | null }).reset_at ?? null,
    };
  }

  // Audit round 3, J-B4: delete-missing for day progress (see
  // syncAppState). Gated on lastLoadOk: without a proven cloud read,
  // "missing" might mean "never fetched", and deleting would destroy
  // real progress. Scoped to one journey pass, so a second pass never
  // prunes the first pass's rows.
  static async pruneDayProgress(progress: DayProgress[], journeyPass: number): Promise<void> {
    // Audit round 4, SYNC-1: the gate is now a FRESH, same-user,
    // complete snapshot — not a boolean set by any past load.
    if (!this.isLastLoadComplete()) return;
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('day_progress')
      .select('day')
      .eq('user_id', userId)
      .eq('journey_pass', journeyPass);

    if (error) throw error;
    const keep = new Set(progress.map((p) => p.day));
    const toDelete = (data || []).map((row) => row.day).filter((day) => !keep.has(day));
    if (toDelete.length === 0) return;

    const { error: deleteError } = await supabase
      .from('day_progress')
      .delete()
      .eq('user_id', userId)
      .eq('journey_pass', journeyPass)
      .in('day', toDelete);

    if (deleteError) throw deleteError;
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
        // Audit round 4, SYNC-9: clamp future completions + negative
        // durations at the write boundary (the migration trigger clamps
        // server-side too; this is the pre-deploy / direct-upsert cover).
        completed_at: clampCompletedAt(entry.completedAt),
        duration: clampNonNegative(entry.duration),
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

    // Audit round 4, SYNC-6/SYNC-9: open streak is a monotonic counter,
    // so the upload takes GREATEST(stored, incoming) — a stale device
    // can no longer regress it. current_day / journey_complete /
    // last_completed_date are derived from progress by merge, so the
    // merged (not raw) values are what reach here on every sync path.
    // Future last_completed_date values and negative counts are clamped
    // (server CHECKs in migration 20261025000015 are the backstop).
    let openStreakCount = clampNonNegative(stats.openStreakCount);
    try {
      const existing = await this.getJourneyStats(stats.journeyPass);
      if (existing) {
        openStreakCount = Math.max(clampNonNegative(existing.openStreakCount), openStreakCount);
      }
    } catch {
      // Read failure must not block the write — the clamp above still holds.
    }
    const today = new Date().toISOString().slice(0, 10);
    const lastCompletedDate = stats.lastCompletedDate && stats.lastCompletedDate > today
      ? today
      : stats.lastCompletedDate;
    const payload: Record<string, unknown> = {
      user_id: userId,
      journey_pass: stats.journeyPass,
      current_day: stats.currentDay,
      streak_count: clampNonNegative(stats.streakCount),
      last_completed_date: lastCompletedDate,
      journey_complete: stats.journeyComplete,
      last_opened_date: stats.lastOpenedDate,
      open_streak_count: openStreakCount,
    };
    // Audit round 4, SYNC-5: the reset marker rides the stats row. The
    // column deploys with migration 20261025000015; until then the
    // upsert is retried without it so stats still land.
    if (stats.resetAt != null) {
      payload.reset_at = stats.resetAt;
    }
    const { error } = await supabase.from('journey_stats').upsert(payload);
    if (error) {
      // Pre-migration fallback: if reset_at is not yet a granted column
      // (column grants are explicit for journey_stats — see migration
      // 20260423131500 — or the column has not deployed), retry without
      // it so stats still land. If the retry fails too, its error is
      // the one thrown (the first error is then moot).
      if (stats.resetAt != null) {
        delete payload.reset_at;
        const { error: retryError } = await supabase.from('journey_stats').upsert(payload);
        if (retryError) throw retryError;
        return;
      }
      throw error;
    }
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
        // Audit round 4, SYNC-9: future completions clamped (see
        // clampCompletedAt; the migration trigger is the server backstop).
        completed_at: clampCompletedAt(progress.completedAt),
        duration: clampNonNegative(progress.duration),
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

    // Audit round 3, J-S16: upsert by the UNIQUE(user_id, week,
    // journey_pass) key instead of relying on the default conflict target,
    // so a re-save for the same day updates the row instead of erroring
    // (or, on older clients, duplicating the journal card).
    const { error } = await supabase
      .from('weekly_reflections')
      .upsert({
        user_id: userId,
        week: reflection.week,
        journey_pass: journeyPass,
        question_1: reflection.q1,
        question_2: reflection.q2,
        question_3: reflection.q3,
      }, { onConflict: 'user_id,week,journey_pass' });

    if (error) throw error;
    // Audit round 4, SYNC-3: a fresh edit of a previously deleted
    // reflection is an explicit un-delete — clear its tombstone so the
    // next merge does not drop the new text. Best-effort: the local
    // tombstone list is cleared by the provider too.
    try {
      await this.deleteSyncTombstone('reflections', `${journeyPass}:${reflection.week}`);
    } catch {
      // Pre-migration (no sync_deletes table) or transient failure:
      // the provider-side tombstone removal still applies locally.
    }
  }

  // ── Sync tombstones (audit round 4, SYNC-3) ──────────────────────────
  // A tombstone is a durable "this id was deleted" record. syncAppState
  // uploads the state's tombstones BEFORE any upsert, and mergeStates
  // drops tombstoned ids from both sides BEFORE any union. Without this,
  // a second device's stale copy re-upserts every delete on its next tick.
  // All tombstone writes tolerate a missing sync_deletes table (migration
  // 20261025000015 not yet deployed): they no-op instead of failing the
  // sync, and the client-side tombstone list still protects this device.
  static async getSyncTombstones(): Promise<{ list: string; itemId: string; deletedAt: string }[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('sync_deletes')
      .select('list, item_id, deleted_at')
      .eq('user_id', userId);
    if (error) {
      if (isMissingSupabaseTableError(error, 'sync_deletes')) return [];
      throw error;
    }
    return (data || []).map((row) => ({
      list: row.list as string,
      itemId: row.item_id as string,
      deletedAt: row.deleted_at as string,
    }));
  }

  static async writeSyncTombstone(list: string, itemId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase
      .from('sync_deletes')
      .upsert({
        user_id: userId,
        list,
        item_id: itemId,
        deleted_at: new Date().toISOString(),
      }, { onConflict: 'user_id,list,item_id' });
    if (error) {
      if (isMissingSupabaseTableError(error, 'sync_deletes')) return;
      throw error;
    }
  }

  static async deleteSyncTombstone(list: string, itemId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase
      .from('sync_deletes')
      .delete()
      .eq('user_id', userId)
      .eq('list', list)
      .eq('item_id', itemId);
    if (error) {
      if (isMissingSupabaseTableError(error, 'sync_deletes')) return;
      throw error;
    }
  }

  /** Server-first answered-prayer delete + tombstone (SYNC-3: answered
   * prayers previously had NO delete path at all). Callers keep the
   * tombstone in local state too, so a failed server tombstone write is
   * retried by the next sync instead of resurrecting the row. */
  static async deleteAnsweredPrayer(id: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase
      .from('answered_prayers')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    await this.writeSyncTombstone('answeredPrayers', id);
  }

  /** Server-first reflection delete + tombstone (SYNC-3: reflections
   * previously could only be overwritten, never removed). */
  static async deleteWeeklyReflection(week: number, journeyPass: number): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase
      .from('weekly_reflections')
      .delete()
      .eq('user_id', userId)
      .eq('week', week)
      .eq('journey_pass', journeyPass);
    if (error) throw error;
    await this.writeSyncTombstone('reflections', `${journeyPass}:${week}`);
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
    // Audit round 4, SYNC-3: record the delete so other devices drop
    // their stale copy on merge instead of re-upserting it.
    await this.writeSyncTombstone('prayerRequests', id);
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
        // Audit round 3, J-S17: persist the failure flag with the row.
        testimony_share_failed: prayer.testimonyShareFailed ?? false,
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
      // Audit round 3, J-S17: persisted so a failed share's retry survives
      // restarts (the flag used to live in local state only).
      testimonyShareFailed: item.testimony_share_failed ?? false,
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

  // Audit round 3, J-B10: per-id favorite toggle, applied immediately at
  // tap time (see toggleDeclarationFavorite) instead of deferred to the
  // 30s sync — the cloud row must be gone the moment the user unfavorites.
  static async setDeclarationFavorite(id: string, favored: boolean): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    if (favored) {
      const { error } = await supabase
        .from('declaration_favorites')
        .upsert({ user_id: userId, declaration_id: id }, { onConflict: 'user_id,declaration_id' });
      if (error) throw error;
      // Audit round 4, SYNC-3: re-favoriting is an explicit un-delete.
      await this.deleteSyncTombstone('favorites', id);
    } else {
      const { error } = await supabase
        .from('declaration_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('declaration_id', id);
      if (error) throw error;
      // Audit round 4, SYNC-3: tombstone at tap time, so a stale
      // device's merge cannot re-add this favorite.
      await this.writeSyncTombstone('favorites', id);
    }
  }

  static async syncDeclarationFavorites(ids: string[], options?: { allowDeletes?: boolean }): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Audit round 4, SYNC-1: reconcile deletes ONLY on a complete
    // snapshot. On a partial snapshot, upsert-only: never delete a
    // cloud favorite that a failed load merely failed to fetch.
    if (options?.allowDeletes === false) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('declaration_favorites')
        .upsert(
          ids.map((declaration_id) => ({ user_id: userId, declaration_id })),
          { onConflict: 'user_id,declaration_id' }
        );
      if (error) throw error;
      return;
    }

    // Audit round 3, J-B10: reconcile, don't just upsert. The old code
    // early-returned on an empty list and never deleted a row, so an
    // unfavorite was resurrected by merge's union on the next full sync —
    // and unfavoriting everything was a complete no-op. Rows absent from
    // the local list are deleted (including the empty-list case), then the
    // rest are upserted. This is the backstop for multi-device drift; the
    // per-id toggle above is the primary path.
    const existing = await this.getDeclarationFavorites();
    const toDelete = existing.filter((id) => !ids.includes(id));
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('declaration_favorites')
        .delete()
        .eq('user_id', userId)
        .in('declaration_id', toDelete);
      if (deleteError) throw deleteError;
    }

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

    // Audit round 4, SYNC-6: phase totals are monotonic, so every write
    // path takes MAX(stored, incoming) — the old verbatim upload let a
    // stale device regress another device's total. (Still a
    // read-modify-write, not a server GREATEST; see the lane report for
    // the RPC follow-up. The merge max and this max share one rule.)
    let total = clampNonNegative(seconds);
    try {
      const timings = await this.getPhaseTimings();
      total = Math.max(total, clampNonNegative(timings[phaseName] ?? 0));
    } catch {
      // Read failure must not block the write.
    }

    const { error } = await supabase
      .from('phase_timings')
      .upsert({
        user_id: userId,
        phase_name: phaseName,
        total_seconds: total,
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

  /** Checklist rows plus the newest completed_at, used as the cloud
   * side's last-write stamp in merge (SYNC-6 timestamp LWW). */
  static async getFirstStepsState(): Promise<{ ids: string[]; updatedAt: string | null }> {
    const userId = await this.getCurrentUserId();
    if (!userId) return { ids: [], updatedAt: null };
    const { data, error } = await supabase
      .from(FIRST_STEPS_CHECKLIST_TABLE)
      .select('item_id, completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: true });
    if (error) {
      if (isMissingSupabaseTableError(error, FIRST_STEPS_CHECKLIST_TABLE)) {
        return { ids: [], updatedAt: null };
      }
      throw error;
    }
    const rows = (data || []).filter((item) => typeof item.item_id === 'string' && item.item_id.length > 0);
    const stamps = rows.map((r) => r.completed_at as string).filter(Boolean).sort();
    return { ids: rows.map((r) => r.item_id as string), updatedAt: stamps.length > 0 ? stamps[stamps.length - 1] : null };
  }

  static async syncFirstStepsChecklist(completedIds: string[], options?: { allowDeletes?: boolean }): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Audit round 4, SYNC-1: delete-all-then-insert is the most
    // destructive sync step. On a partial snapshot it is skipped
    // entirely rather than wiping the cloud checklist.
    if (options?.allowDeletes === false) return;

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
    const pageSize = page?.pageSize ?? 100;
    const mutedAuthors = await this.getMutedAuthorIds();
    // Audit round 3, J-S5: the old code fetched one source page and then
    // filtered muted authors client-side, so a page dense with muted
    // authors came back short and the caller (hasMore = length ===
    // pageSize) reported no more pages — older unmuted posts were
    // unreachable. Loop source pages until the UI page is full or the
    // source is exhausted. Muted-author filtering stays client-side: SQL
    // NOT IN would also drop rows whose user_id is NULL
    // (anonymous/seeded posts). The .lte cursor re-includes the boundary
    // row, so ids already returned this call are skipped (callers also
    // dedup on append across pages).
    const out: CommunityEcho[] = [];
    const seen = new Set<string>();
    let cursor = page?.cursor;
    for (let round = 0; round < 8 && out.length < pageSize; round++) {
      let query = supabase
        .from('community_echoes')
        .select('id, user_id, text, amens, created_at, hidden_at')
        .order('created_at', { ascending: false })
        .limit(pageSize);

      // Cursor pagination: .lte (not .lt) so rows sharing the boundary
      // timestamp are never skipped — callers dedup by id on append.
      if (cursor) {
        query = query.lte('created_at', cursor);
      }

      // Without a scope only the public wall is returned; circle echoes stay
      // private to their members.
      query = scope ? query.eq('circle_id', scope.circleId) : query.is('circle_id', null);

      const { data, error } = await query;
      if (error) {
        if (__DEV__) {
          console.warn('[DatabaseService] getCommunityEchoes failed:', formatDatabaseError(error));
        }
        throw error;
      }
      const rows = data || [];
      if (rows.length === 0) break;
      for (const item of rows) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (item.user_id == null || !mutedAuthors.has(item.user_id)) {
          out.push({
            id: item.id,
            userId: item.user_id,
            text: item.text,
            amens: item.amens,
            createdAt: item.created_at,
            hiddenAt: item.hidden_at ?? null,
          });
        }
      }
      cursor = rows[rows.length - 1].created_at;
      if (rows.length < pageSize) break; // Source exhausted.
    }
    return out.slice(0, pageSize);
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
        // Audit round 3, J-S5 (bell mark-seen): unseen first, oldest
        // first within them, so the unseen queue drains across opens
        // instead of the newest 50 always winning the mark.
        .order('seen_at', { ascending: true, nullsFirst: true })
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

  // Audit round 3, J-S5 (bell mark-seen): when the caller passes the ids
  // it actually displayed, only those are marked — the old mark-all made
  // the 50-item cap silently swallow older unseen entries. Without ids
  // the legacy mark-all-unseen behaviour is kept for existing callers.
  static async markPrayerNotificationsSeen(ids?: string[]): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) return;
    try {
      let query = supabase
        .from('prayer_notifications')
        .update({ seen_at: new Date().toISOString() })
        .eq('recipient_id', userId)
        .is('seen_at', null);
      if (ids && ids.length > 0) {
        query = query.in('id', ids);
      }
      const { error } = await query;
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

  /** Record a 13+ attestation (audit must-fix #5; round 4 AUTH-2). Via the
   * caller-only SECURITY DEFINER RPC record_age_attestation (migration
   * 20261025000013): direct writes to profiles.age_attested_at are revoked,
   * so a bare upsert here would be rejected. Callers must only invoke this
   * when the user actually confirmed the modal this session. */
  static async recordAgeAttestation(): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await supabase.rpc('record_age_attestation');
    if (error) throw error;
  }

  /** Single echo by id, for landing on a bell entry from the wall. */
  static async getCommunityEchoById(echoId: string): Promise<CommunityEcho | null> {
    try {
      const { data, error } = await supabase
        .from('community_echoes')
        .select('id, user_id, text, amens, created_at, hidden_at')
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
        hiddenAt: data.hidden_at ?? null,
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
    // Same muted-dense pagination loop as getCommunityEchoes (audit round
    // 3, J-S5): fill the UI page across source pages so muted authors
    // can't strand older testimonies behind a short page.
    const pageSize = page?.pageSize ?? 50;
    const mutedAuthors = await this.getMutedAuthorIds();
    const out: Testimony[] = [];
    const seen = new Set<string>();
    let cursor = page?.cursor;
    for (let round = 0; round < 8 && out.length < pageSize; round++) {
      let query = supabase
        .from('community_testimonies')
        .select('id, user_id, request, answer, first_name, created_at, hidden_at')
        .order('created_at', { ascending: false })
        .limit(pageSize);

      // Same .lte + caller-dedup rule as echoes (see above).
      if (cursor) {
        query = query.lte('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        if (__DEV__) {
          console.warn('[DatabaseService] getCommunityTestimonies failed:', formatDatabaseError(error));
        }
        throw error;
      }
      const rows = data || [];
      if (rows.length === 0) break;
      for (const item of rows) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (item.user_id == null || !mutedAuthors.has(item.user_id)) {
          out.push({
            id: item.id,
            userId: item.user_id,
            request: item.request,
            answer: item.answer,
            firstName: item.first_name,
            createdAt: item.created_at,
            hiddenAt: item.hidden_at ?? null,
          });
        }
      }
      cursor = rows[rows.length - 1].created_at;
      if (rows.length < pageSize) break; // Source exhausted.
    }
    return out.slice(0, pageSize);
  }

  static async createTestimony(request: string, answer: string, firstName: string): Promise<Testimony | null> {
    // Sharing a testimony requires a verified identity — anonymous sessions
    // may amen but never post to the public wall (same rule as echoes).
    const session = await getSafeSession();
    const userId = session?.user && session.user.is_anonymous !== true ? session.user.id : null;
    if (!userId) throw new Error('User not authenticated');

    // Audit round 3, J-S17: a retry after a success-that-looked-like-a-
    // failure used to duplicate the wall post (no idempotency key, and the
    // answered-prayer row carries no testimony id). If an identical post
    // by this user already exists, return it instead of inserting again.
    const { data: existing } = await supabase
      .from('community_testimonies')
      .select('id, user_id, request, answer, first_name, created_at')
      .eq('user_id', userId)
      .eq('request', request)
      .eq('answer', answer)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        request: existing.request,
        answer: existing.answer,
        firstName: existing.first_name,
        createdAt: existing.created_at,
      };
    }

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

  /**
   * Moderation stack (audit round 4, fix lane 1). The moderator flag is
   * NEVER read from the profiles table: migration 00010 revokes SELECT
   * on profiles.is_moderator (mirroring the 00007 rc_alias_id
   * precedent — a client SELECT * simply omits the column), so the
   * check goes through the is_moderator() RPC, which returns only the
   * caller's own status. A failed lookup hides moderator UI rather
   * than exposing a dead entry point.
   */
  static async getIsModerator(): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('is_moderator');
      if (error || typeof data !== 'boolean') return false;
      return data;
    } catch {
      return false;
    }
  }

  /** Moderator review queue, paginated (migration 00010, MOD-10). */
  static async getHiddenWallPosts(page?: { limit?: number; offset?: number }): Promise<HiddenWallPost[]> {
    const { data, error } = await supabase.rpc('get_hidden_wall_posts', {
      p_limit: page?.limit ?? 50,
      p_offset: page?.offset ?? 0,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      kind: row.kind as 'echo' | 'testimony',
      id: row.id as string,
      preview: row.preview as string,
      authorId: row.author_id as string | null,
      firstName: row.first_name as string | null,
      createdAt: row.created_at as string,
      hiddenAt: row.hidden_at as string,
      hiddenReason: row.hidden_reason as string | null,
      reportCount: Number(row.report_count ?? 0),
    }));
  }

  static async moderateWallPost(
    kind: 'echo' | 'testimony',
    id: string,
    action: 'unhide' | 'delete',
  ): Promise<void> {
    const { error } = await supabase.rpc('moderate_wall_post', {
      p_kind: kind,
      p_id: id,
      p_action: action,
    });
    if (error) throw error;
  }

  // Audit round 4, SYNC-7: abort token for in-flight syncs. Bumped by
  // SyncService.stopAutoSync / clearLocalState (both run first in
  // sign-out and delete-account) and by any new sync generation. Steps
  // below check it before running, so a sync that straddles sign-out
  // cannot keep writing after the account changed. This is the abort
  // side; the session re-check before first-time pushes lives in
  // AppSync.initializeSync.
  static syncGeneration = 0;
  static bumpSyncGeneration(): void {
    this.syncGeneration += 1;
  }

  // Audit round 4, Low L3: last sync's failure state, surfaced by the
  // provider through the existing stateLoadError banner (Home + Journal)
  // instead of a new toast system.
  static lastSyncFailed = false;
  static lastSyncFailedAt = 0;

  static async syncAppState(state: AppState): Promise<void> {
    const userId = await this.getCurrentUserId();
    if (!userId) return;
    const generationAtStart = this.syncGeneration;
    this.lastSyncFailed = false;

    // Audit round 4, SYNC-8: this sequence is NOT atomic (no
    // transactional RPC exists for it yet — see the lane report). What
    // changed: it is now re-runnable without destructive interleaving —
    // tombstones upload first, upserts skip tombstoned ids, delete steps
    // run last and only on a complete snapshot, and a generation change
    // aborts the remaining steps instead of letting early steps land for
    // a signed-out user.
    const aborted = () => this.syncGeneration !== generationAtStart;
    const safeRun = async (label: string, fn: () => Promise<void>) => {
      if (aborted()) return;
      try {
        await fn();
      } catch (error) {
        this.lastSyncFailed = true;
        this.lastSyncFailedAt = Date.now();
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

    // Audit round 4, SYNC-1/SYNC-3: snapshot completeness is decided
    // once, up front, from the last load — and tombstones go first.
    const snapshotComplete = this.isLastLoadComplete();
    const tombstones = state.syncTombstones ?? [];
    const tombstoned = (list: string, itemId: string) =>
      tombstones.some((t) => t.list === list && t.itemId === itemId);
    const livePrayerRequests = (state.prayerRequests ?? []).filter((r) => !tombstoned('prayerRequests', r.id));
    const liveAnsweredPrayers = (state.answeredPrayers ?? []).filter((p) => !tombstoned('answeredPrayers', p.id));
    const liveFavorites = (state.declarationFavorites ?? []).filter((id) => !tombstoned('favorites', id));
    const liveReflections = (state.reflections ?? []).filter(
      (r) => !tombstoned('reflections', `${state.journeyPass}:${r.week}`)
    );

    try {
      // Tombstones before upserts: a stale device's upload must never
      // re-create a row another device deleted. A tombstone-upload
      // failure (other than a missing pre-migration table) aborts the
      // whole sync — upserting without it would resurrect deletes.
      if (tombstones.length > 0) {
        const tombstoneError: Error | null = await (async () => {
          if (aborted()) return null;
          try {
            for (const t of tombstones) {
              if (aborted()) break;
              await this.writeSyncTombstone(t.list, t.itemId);
            }
            return null;
          } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
          }
        })();
        if (tombstoneError) {
          this.lastSyncFailed = true;
          this.lastSyncFailedAt = Date.now();
          reportError('SyncAppState', tombstoneError, { label: 'uploadSyncTombstones' });
          return;
        }
      }

      if (state.user) {
        await safeRun('upsertProfile', () => this.upsertProfile(state.user!));
        await safeRun('updatePreferences', () => this.updatePreferences({
          darkMode: true,
          fontSize: state.fontSize,
          ambientMuted: state.ambientMuted,
          soundscape: state.soundscape,
          themePreference: state.themePreference,
          voiceoverEnabled: state.voiceoverEnabled,
          adaptiveReminderEnabled: state.adaptiveReminderEnabled,
          playbackRate: state.playbackRate,
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
        // Audit round 4, SYNC-5: the reset marker rides the stats row.
        resetAt: state.journeyResetAt ?? null,
      }));

      await safeRun('upsertDayProgress', async () => {
        const progressPromises = state.progress.map(progress =>
          this.upsertDayProgress(progress.day, progress, state.journeyPass)
        );
        await Promise.all(progressPromises);
      });

      // Audit round 3, J-B4: upsert-only progress sync resurrected
      // reset days on the next full sync (merge's union re-added the
      // cloud rows a reset had cleared locally). Prune this pass's
      // cloud rows that are no longer in the local list.
      await safeRun('pruneDayProgress', () => this.pruneDayProgress(state.progress, state.journeyPass));

      await safeRun('saveWeeklyReflections', async () => {
        const reflectionPromises = liveReflections.map(reflection =>
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

      await safeRun('syncFirstStepsChecklist', () => this.syncFirstStepsChecklist(state.firstStepsCompletedIds ?? [], { allowDeletes: snapshotComplete }));

      // Prayer lists and favorites were local-only before: a user who added
      // prayers on one device and signed in on another got the cloud's
      // older/empty lists overwriting them. Upsert by client UUID id.
      await safeRun('syncPrayerRequests', async () => {
        const uploadPromises = livePrayerRequests.map((request) => this.upsertPrayerRequest(request));
        await Promise.all(uploadPromises);
      });

      await safeRun('syncAnsweredPrayers', async () => {
        const uploadPromises = liveAnsweredPrayers.map((prayer) => this.upsertAnsweredPrayer(prayer));
        await Promise.all(uploadPromises);
      });

      await safeRun('syncDeclarationFavorites', () => this.syncDeclarationFavorites(liveFavorites, { allowDeletes: snapshotComplete }));

      // Audit round 3, J-S3: the active_sessions cloud row is NOT synced
      // anymore. It was write-only (loadAppState never read it), track-less,
      // and phase-corrupting (every real movement id except settle/act was
      // normalised to 'settle' by VALID_SESSION_PHASES) — a wrong copy
      // waiting to mislead a future restore implementation. Local resume
      // keeps working from AsyncStorage; cloud restore stays unwired until
      // a track-aware, vocabulary-correct version lands.
    } catch (error) {
      if (__DEV__) {
        console.warn('[DatabaseService] Sync partially failed:', formatDatabaseError(error));
      }
    }
  }

  // Audit round 3, J-S13 + J-B4: load outcome signals. lastLoadFailed is
  // true when the most recent loadAppState call failed (network failure
  // or unexpected error) as opposed to "no profile yet" (first run).
  // Audit round 4, SYNC-1/SYNC-2: lastLoadOk is true ONLY when EVERY
  // load step succeeded (the round-3 claim — "a profile proves the
  // snapshot was read" — was false; a timed-out day_progress query
  // returned [] and the flag still went true, and the next sync's
  // prune/reconcile/replace wiped real cloud rows). The flag is also
  // stamped with the load's user + time: it expires after 24h and is
  // cleared on sign-out (via clearLocalState's clearLoadSnapshot call
  // path), so a weeks-stale device cannot prune on an ancient load.
  static lastLoadFailed = false;
  static lastLoadOk = false;
  static lastLoadOkAt = 0;
  static lastLoadUserId: string | null = null;
  private static lastProfileNetworkFailed = false;

  /** True only for a complete, fresh, same-user snapshot. Delete-capable
   * sync steps (prune, favorites reconcile, checklist replace) must
   * check this, never the bare boolean. */
  static isLastLoadComplete(userId?: string): boolean {
    if (!this.lastLoadOk) return false;
    if (userId && this.lastLoadUserId !== userId) return false;
    if (Date.now() - this.lastLoadOkAt > 24 * 60 * 60 * 1000) return false;
    return true;
  }

  /** Called on sign-out / local-state wipe: a new account must never
   * inherit the previous account's "load succeeded" proof. */
  static clearLoadSnapshot(): void {
    this.lastLoadOk = false;
    this.lastLoadOkAt = 0;
    this.lastLoadUserId = null;
    this.lastLoadFailed = false;
  }

  static async loadAppState(): Promise<Partial<AppState> | null> {
    if (this.loadAppStatePromise) {
      return this.loadAppStatePromise;
    }

    this.loadAppStatePromise = (async () => {
      this.lastLoadFailed = false;
      this.lastLoadOk = false;
      this.lastLoadOkAt = 0;
      this.lastLoadUserId = null;
      this.lastProfileNetworkFailed = false;
      const userId = await this.getCurrentUserId();
      if (!userId) return null;

      try {
        const profile = await this.getProfile();
        if (!profile) {
          this.lastLoadFailed = this.lastProfileNetworkFailed;
          return null;
        }

        const prefsStep = await runLoadStepResult('load preferences', null as {
          dark_mode?: boolean | null;
          font_size?: 'normal' | 'large' | null;
          ambient_muted?: boolean | null;
          soundscape?: string | null;
          theme_preference?: string | null;
          voiceover_enabled?: boolean | null;
          adaptive_reminder_enabled?: boolean | null;
          playback_rate?: number | null;
        } | null, async () => {
          const { data, error } = await supabase
            .from('profiles')
            .select('dark_mode, font_size, ambient_muted, soundscape, theme_preference, voiceover_enabled, adaptive_reminder_enabled, playback_rate')
            .eq('id', userId)
            .maybeSingle();

          if (error) {
            throw error;
          }

          return data;
        });
        const prefs = prefsStep.value;

        const statsStep = await runLoadStepResult('load journey stats', null as JourneyStats | null, () => this.getLatestJourneyStats());
        const stats = statsStep.value;
        const journeyPass = stats?.journeyPass ?? 1;
        const progressStep = await runLoadStepResult('load day progress', [] as DayProgress[], () => this.getDayProgress(journeyPass));
        const reflectionsStep = await runLoadStepResult('load weekly reflections', [] as WeeklyReflection[], () => this.getWeeklyReflections(journeyPass));
        const prayerRequestsStep = await runLoadStepResult('load prayer requests', [] as PrayerRequest[], () => this.getPrayerRequests());
        const answeredPrayersStep = await runLoadStepResult('load answered prayers', [] as AnsweredPrayer[], () => this.getAnsweredPrayers());
        const declarationFavoritesStep = await runLoadStepResult('load declaration favorites', [] as string[], () => this.getDeclarationFavorites());
        const phaseTimingsStep = await runLoadStepResult('load phase timings', {} as PhaseTimings, () => this.getPhaseTimings());
        const dailyPrayerLogStep = await runLoadStepResult('load daily prayer log', [] as DailyPrayerLogEntry[], () => this.getDailyPrayerLog());
        const firstStepsStep = await runLoadStepResult('load first steps checklist', { ids: [] as string[], updatedAt: null as string | null }, () => this.getFirstStepsState());
        // Tombstone load: a missing pre-migration table counts as OK
        // (empty tombstone set) — getSyncTombstones already swallows
        // that case; any other error marks the snapshot partial, because
        // merging without tombstones would resurrect deletes.
        const tombstonesStep = await runLoadStepResult('load sync tombstones', [] as { list: string; itemId: string; deletedAt: string }[], () => this.getSyncTombstones());
        const progress = progressStep.value;
        const reflections = reflectionsStep.value;
        const prayerRequests = prayerRequestsStep.value;
        const answeredPrayers = answeredPrayersStep.value;
        const declarationFavorites = declarationFavoritesStep.value;
        const phaseTimings = phaseTimingsStep.value;
        const dailyPrayerLog = dailyPrayerLogStep.value;
        const firstStepsCompletedIds = firstStepsStep.value.ids;

        // Audit round 4, SYNC-1: lastLoadOk ONLY on a complete snapshot.
        // Any failed step marks the load failed, so callers that branch
        // on lastLoadFailed (fullSync, initializeSync, the provider)
        // actually engage, and syncAppState skips its delete steps.
        const allStepsOk = prefsStep.ok && statsStep.ok && progressStep.ok
          && reflectionsStep.ok && prayerRequestsStep.ok && answeredPrayersStep.ok
          && declarationFavoritesStep.ok && phaseTimingsStep.ok && dailyPrayerLogStep.ok
          && firstStepsStep.ok && tombstonesStep.ok;
        this.lastLoadOk = allStepsOk;
        this.lastLoadFailed = !allStepsOk;
        if (allStepsOk) {
          this.lastLoadOkAt = Date.now();
          this.lastLoadUserId = userId;
        }
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
          journeyResetAt: stats?.resetAt ?? null,
          syncTombstones: tombstonesStep.value.map((t) => ({
            list: t.list as 'prayerRequests' | 'answeredPrayers' | 'favorites' | 'reflections',
            itemId: t.itemId,
            deletedAt: t.deletedAt,
          })).filter((t) => ['prayerRequests', 'answeredPrayers', 'favorites', 'reflections'].includes(t.list)),
          firstStepsUpdatedAt: firstStepsStep.value.updatedAt,
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
          ...(prefs?.theme_preference === 'monastic' || prefs?.theme_preference === 'seasonal' || prefs?.theme_preference === 'fireside'
            ? { themePreference: prefs.theme_preference }
            : {}),
          ...(prefs?.voiceover_enabled != null ? { voiceoverEnabled: prefs.voiceover_enabled } : {}),
          ...(prefs?.adaptive_reminder_enabled != null ? { adaptiveReminderEnabled: prefs.adaptive_reminder_enabled } : {}),
          ...(prefs?.playback_rate != null
            ? { playbackRate: Math.min(2, Math.max(0.5, prefs.playback_rate)) }
            : {}),
        };
      } catch (e) {
        this.lastLoadFailed = true;
        logDatabaseLoadFailure('[DatabaseService] Error loading app state', e);
        return null;
      } finally {
        this.loadAppStatePromise = null;
      }
    })();

    return this.loadAppStatePromise;
  }

  // Audit round 4, SYNC-7/F13: child tables for the first-time path.
  // loadAppState returns null when no profile row exists — but day
  // progress / prayer rows can survive a partial delete-account while
  // the profile is gone. initializeSync merges these before any
  // first-time push instead of uploading a stale local snapshot over
  // surviving rows. Returns null when every table came back empty.
  static async loadOrphanLists(): Promise<Partial<AppState> | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;
    const stats = await runLoadStepResult('load orphan journey stats', null as JourneyStats | null, () => this.getLatestJourneyStats());
    const journeyPass = stats.value?.journeyPass ?? 1;
    const progress = await runLoadStepResult('load orphan day progress', [] as DayProgress[], () => this.getDayProgress(journeyPass));
    const reflections = await runLoadStepResult('load orphan weekly reflections', [] as WeeklyReflection[], () => this.getWeeklyReflections(journeyPass));
    const prayerRequests = await runLoadStepResult('load orphan prayer requests', [] as PrayerRequest[], () => this.getPrayerRequests());
    const answeredPrayers = await runLoadStepResult('load orphan answered prayers', [] as AnsweredPrayer[], () => this.getAnsweredPrayers());
    const declarationFavorites = await runLoadStepResult('load orphan declaration favorites', [] as string[], () => this.getDeclarationFavorites());
    const phaseTimings = await runLoadStepResult('load orphan phase timings', {} as PhaseTimings, () => this.getPhaseTimings());
    const dailyPrayerLog = await runLoadStepResult('load orphan daily prayer log', [] as DailyPrayerLogEntry[], () => this.getDailyPrayerLog());
    const firstSteps = await runLoadStepResult('load orphan first steps checklist', { ids: [] as string[], updatedAt: null as string | null }, () => this.getFirstStepsState());
    const tombstones = await runLoadStepResult('load orphan sync tombstones', [] as { list: string; itemId: string; deletedAt: string }[], () => this.getSyncTombstones());
    const anyData = stats.value != null || progress.value.length > 0 || reflections.value.length > 0
      || prayerRequests.value.length > 0 || answeredPrayers.value.length > 0
      || declarationFavorites.value.length > 0 || Object.keys(phaseTimings.value).length > 0
      || dailyPrayerLog.value.length > 0 || firstSteps.value.ids.length > 0;
    if (!anyData) return null;
    return {
      currentDay: stats.value?.currentDay ?? 1,
      streakCount: stats.value?.streakCount ?? 0,
      lastCompletedDate: stats.value?.lastCompletedDate ?? null,
      journeyComplete: stats.value?.journeyComplete ?? false,
      lastOpenedDate: stats.value?.lastOpenedDate ?? null,
      openStreakCount: stats.value?.openStreakCount ?? 0,
      journeyPass,
      journeyResetAt: stats.value?.resetAt ?? null,
      syncTombstones: tombstones.value.map((t) => ({
        list: t.list as 'prayerRequests' | 'answeredPrayers' | 'favorites' | 'reflections',
        itemId: t.itemId,
        deletedAt: t.deletedAt,
      })).filter((t) => ['prayerRequests', 'answeredPrayers', 'favorites', 'reflections'].includes(t.list)),
      firstStepsUpdatedAt: firstSteps.value.updatedAt,
      progress: progress.value,
      reflections: reflections.value,
      prayerRequests: prayerRequests.value,
      answeredPrayers: answeredPrayers.value,
      declarationFavorites: declarationFavorites.value,
      phaseTimings: phaseTimings.value,
      dailyPrayerLog: dailyPrayerLog.value,
      firstStepsCompletedIds: firstSteps.value.ids,
    };
  }
}
