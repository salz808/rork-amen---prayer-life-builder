import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSafeSession, supabase } from './supabase';
import { prayerDayKey } from './prayerDay';

/**
 * Foundations Together — a circle walking the 30 days side by side.
 *
 * All of this sits behind tables added by
 * supabase/migrations/20260826000000_add_foundations_together.sql.
 * Until that migration runs, the tables don't exist and every entry point
 * here quietly reports "unavailable" — the circles screen then renders
 * exactly as it did before, with no Journey Together card and no errors.
 */

export const TOGETHER_TRACK_ID = 'foundations';
export const TOGETHER_DAY_COUNT = 30;

export interface FoundationsProgressSummary {
  /** The Foundations day the member is on (1–30). */
  currentDay: number;
  /** Prayer-day key (YYYY-MM-DD, 4 AM local) of the last completion. */
  lastCompletedPrayerDay: string | null;
  currentStreak: number;
}

export interface CircleJourney {
  id: string;
  circleId: string;
  trackId: string;
  startPrayerDay: string;
  startedBy: string;
  status: 'active' | 'completed';
  createdAt: string;
}

export interface TogetherMember {
  userId: string;
  displayName: string | null;
  isYou: boolean;
  joinedAt: string;
  /** Null when the member hasn't published progress yet. */
  progress: FoundationsProgressSummary | null;
  /** True when the member has actually begun Foundations. */
  hasStarted: boolean;
  /** True when their last completion was this prayer day. */
  prayedToday: boolean;
}

/* ── Feature detection ─────────────────────────────────────────────────────
 * One cheap query against the (possibly missing) table. Cached for the
 * session: once the tables are known-missing we stop asking, and once the
 * migration lands a fresh app launch picks the feature up. */

let availabilityCache: boolean | null = null;

function looksLikeMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('circle_journeys') ||
    message.includes('journey_progress') ||
    message.includes('circle_journey_members') ||
    message.includes('42P01') ||
    message.includes('PGRST205') ||
    message.includes('does not exist')
  );
}

export async function isTogetherModeAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  try {
    const { error } = await supabase.from('circle_journeys').select('id').limit(1);
    availabilityCache = !error;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/* ── Progress publishing ───────────────────────────────────────────────────
 * Progress stays local-first. This upserts a tiny summary row so circle
 * mates can see it. Fire-and-forget: it never throws and never blocks a
 * prayer flow. Anonymous sessions are skipped (circles need real
 * accounts, so an anonymous id can never appear on a roster). */

const PUBLISH_STAMP_KEY = '@triad/lastPublishedJourneyProgress';

export async function publishFoundationsProgress(
  summary: FoundationsProgressSummary
): Promise<void> {
  try {
    if (availabilityCache === false) return;

    const session = await getSafeSession();
    const user = session?.user;
    if (!user || user.is_anonymous === true) return;

    const stamp = JSON.stringify({
      userId: user.id,
      currentDay: summary.currentDay,
      lastCompletedPrayerDay: summary.lastCompletedPrayerDay,
      currentStreak: summary.currentStreak,
    });
    const lastStamp = await AsyncStorage.getItem(PUBLISH_STAMP_KEY);
    if (lastStamp === stamp) return; // unchanged — nothing to republish

    const { error } = await supabase.from('journey_progress').upsert(
      {
        user_id: user.id,
        track_id: TOGETHER_TRACK_ID,
        current_day: Math.max(1, Math.min(summary.currentDay, TOGETHER_DAY_COUNT)),
        last_completed_prayer_day: summary.lastCompletedPrayerDay,
        current_streak: Math.max(0, summary.currentStreak),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,track_id' }
    );

    if (error) {
      if (looksLikeMissingTable(error)) availabilityCache = false;
      return;
    }

    if (availabilityCache === null) availabilityCache = true;
    await AsyncStorage.setItem(PUBLISH_STAMP_KEY, stamp);
  } catch {
    // Publishing is best-effort only.
  }
}

/* ── Circle journeys ─────────────────────────────────────────────────────── */

interface CircleJourneyRow {
  id: string;
  circle_id: string;
  track_id: string;
  start_prayer_day: string;
  started_by: string;
  status: string;
  created_at: string;
}

function mapJourney(row: CircleJourneyRow): CircleJourney {
  return {
    id: row.id,
    circleId: row.circle_id,
    trackId: row.track_id,
    startPrayerDay: row.start_prayer_day,
    startedBy: row.started_by,
    status: row.status === 'completed' ? 'completed' : 'active',
    createdAt: row.created_at,
  };
}

export async function getCircleJourney(circleId: string): Promise<CircleJourney | null> {
  const { data, error } = await supabase
    .from('circle_journeys')
    .select('id, circle_id, track_id, start_prayer_day, started_by, status, created_at')
    .eq('circle_id', circleId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data ? mapJourney(data as CircleJourneyRow) : null;
}

/**
 * Starts the circle's Foundations journey. The shared start is today's
 * prayer day: the circle begins walking together today — nobody waits for
 * tomorrow, and each member's own day is what the roster shows.
 */
export async function startCircleJourney(circleId: string): Promise<CircleJourney> {
  const session = await getSafeSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Please sign in again, then try once more.');

  const { data, error } = await supabase
    .from('circle_journeys')
    .insert({
      circle_id: circleId,
      track_id: TOGETHER_TRACK_ID,
      start_prayer_day: prayerDayKey(),
      started_by: userId,
      status: 'active',
    })
    .select('id, circle_id, track_id, start_prayer_day, started_by, status, created_at')
    .single();

  if (error) {
    // Someone in the circle started it a moment ago — just load theirs.
    if (error.code === '23505' || error.message.includes('duplicate')) {
      const existing = await getCircleJourney(circleId);
      if (existing) return existing;
    }
    throw error;
  }

  const journey = mapJourney(data as CircleJourneyRow);

  // Whoever starts the journey is walking it.
  await joinCircleJourney(journey.id);
  return journey;
}

export async function joinCircleJourney(journeyId: string): Promise<void> {
  const session = await getSafeSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Please sign in again, then try once more.');

  const { error } = await supabase
    .from('circle_journey_members')
    .upsert(
      { journey_id: journeyId, user_id: userId },
      { onConflict: 'journey_id,user_id', ignoreDuplicates: true }
    );

  if (error) throw error;
}

export async function getJourneyRoster(journey: CircleJourney): Promise<TogetherMember[]> {
  const session = await getSafeSession();
  const myId = session?.user?.id ?? null;
  const today = prayerDayKey();

  const { data: memberRows, error: memberError } = await supabase
    .from('circle_journey_members')
    .select('user_id, joined_at')
    .eq('journey_id', journey.id)
    .order('joined_at', { ascending: true });

  if (memberError) throw memberError;

  const members = (memberRows ?? []) as Array<{ user_id: string; joined_at: string }>;
  if (members.length === 0) return [];
  const memberIds = members.map((m) => m.user_id);

  // Progress + names are best-effort dressing; the roster renders without them.
  const progressByUser = new Map<string, FoundationsProgressSummary>();
  try {
    const { data: progressRows, error: progressError } = await supabase
      .from('journey_progress')
      .select('user_id, current_day, last_completed_prayer_day, current_streak')
      .eq('track_id', TOGETHER_TRACK_ID)
      .in('user_id', memberIds);
    if (!progressError) {
      for (const row of (progressRows ?? []) as Array<{
        user_id: string;
        current_day: number;
        last_completed_prayer_day: string | null;
        current_streak: number;
      }>) {
        progressByUser.set(row.user_id, {
          currentDay: row.current_day,
          lastCompletedPrayerDay: row.last_completed_prayer_day,
          currentStreak: row.current_streak,
        });
      }
    }
  } catch {
    // roster without progress
  }

  const nameByUser = new Map<string, string>();
  try {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', memberIds);
    if (!profileError) {
      for (const row of (profileRows ?? []) as Array<{
        id: string;
        display_name: string | null;
      }>) {
        if (row.display_name) nameByUser.set(row.id, row.display_name);
      }
    }
  } catch {
    // roster without names
  }

  const roster: TogetherMember[] = members.map((m) => {
    const progress = progressByUser.get(m.user_id) ?? null;
    const hasStarted = !!progress && progress.lastCompletedPrayerDay !== null;
    return {
      userId: m.user_id,
      displayName: nameByUser.get(m.user_id) ?? null,
      isYou: myId !== null && m.user_id === myId,
      joinedAt: m.joined_at,
      progress,
      hasStarted,
      prayedToday: !!progress && progress.lastCompletedPrayerDay === today,
    };
  });

  // You first, then in the order everyone joined.
  roster.sort((a, b) => Number(b.isYou) - Number(a.isYou));
  return roster;
}

/** "Oct 20" style label for a prayer-day key, parsed as a plain local date. */
export function formatPrayerDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
