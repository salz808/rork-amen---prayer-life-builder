/**
 * Daily Prayer rotation — expanded pool (Kai, 2026-10-26).
 *
 * Daily Prayer is a REVISIT, never fresh content and never a progression
 * step: one prayer a day, chosen by the app, from days the user has
 * already started. Foundations (30 days) is always in the pool for a
 * graduate. A non-Foundations track joins the pool only once the user
 * has actually started it, and only up to the day they have reached
 * (completed days + the current frontier day) — future, untaught days
 * of that track are NOT in the pool, so Daily Prayer can never spoil
 * a deliverance day the user has not reached yet. When Hearing God /
 * Intercession gain live days, they join by the same rule with no
 * code change here, provided the caller passes them as started tracks
 * with their reached day.
 *
 * Selection is deterministic per prayer day (4 AM local boundary,
 * lib/prayerDay.ts) so the advertised prayer does not change intraday:
 * a coprime step over the pool size guarantees consecutive prayer
 * days never advertise the same selection, and a completed-day bump
 * guarantees today's pick is never the most recently completed one
 * (so a prayed day is not immediately re-advertised after a gap).
 * An entry already logged for today wins, so a completed Daily
 * Prayer day stays stable for the rest of that prayer day.
 *
 * Pure functions only — no storage, no React — so the rotation is
 * unit-testable over the full pool-size range.
 */
import { prayerDayDifference } from '@/lib/prayerDay';
import type { DailyPrayerLogEntry, DailyPrayerSelection } from '@/types';

export type { DailyPrayerSelection };

export function dailyPrayerSelectionKey(sel: DailyPrayerSelection): string {
  return `${sel.trackId}:${sel.day}`;
}

/**
 * Legacy log entries predate trackId; they were always Foundations.
 * Known limit, deliberately NOT papered over: the cloud
 * daily_prayer_log table is not defined in-repo and has no track_id
 * column, so a cloud round-trip drops trackId and a re-hydrated
 * entry normalizes back to Foundations. Local AsyncStorage state
 * (the primary store) keeps trackId, and completed state is
 * date-based, so this never un-completes a day or breaks streaks —
 * it can only mis-bump the rotation or mislabel the advertised
 * title after a cross-device re-hydration. Fixing it properly needs
 * a track_id column migration + staging deploy, which is outside
 * this local-only expansion; do NOT add track_id to the DB payload
 * before that column exists, or upserts will fail on the unknown
 * column.
 */
export function normalizeDailyPrayerEntry(entry: DailyPrayerLogEntry): DailyPrayerSelection {
  return { trackId: entry.trackId ?? 'foundations', day: entry.day };
}

export interface StartedTrackForPool {
  trackId: string;
  /** Highest day in the pool for this track (already clamped to its days). */
  reachedDay: number;
}

/**
 * Build the pool in the caller's track order (Foundations first).
 * Foundations is always 30 days. A started track contributes days
 * 1..reachedDay only; unstarted tracks contribute nothing. Duplicate
 * track ids collapse to the highest reached day. Empty / invalid
 * entries are dropped, never allowed to shrink Foundations.
 */
export function buildDailyPrayerPool(
  startedTracks: StartedTrackForPool[],
): DailyPrayerSelection[] {
  const reached = new Map<string, number>();
  for (const t of startedTracks) {
    if (!t.trackId || !Number.isFinite(t.reachedDay)) continue;
    const day = Math.floor(t.reachedDay);
    if (day < 1) continue;
    reached.set(t.trackId, Math.max(reached.get(t.trackId) ?? 0, day));
  }
  // Foundations is always in the pool, even if the caller forgot it,
  // and always first, so pool order (and therefore the rotation) is
  // stable regardless of the order the caller lists started tracks.
  reached.set('foundations', Math.max(reached.get('foundations') ?? 0, 30));

  const pool: DailyPrayerSelection[] = [];
  const seen = new Set<string>();
  const pushTrack = (trackId: string, maxDay: number) => {
    for (let day = 1; day <= maxDay; day += 1) {
      const key = `${trackId}:${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({ trackId, day });
    }
  };
  pushTrack('foundations', reached.get('foundations')!);
  for (const [trackId, maxDay] of reached) {
    if (trackId === 'foundations') continue;
    pushTrack(trackId, maxDay);
  }
  return pool;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Smallest step in the candidate list coprime to the pool size. */
export function dailyPrayerStep(poolSize: number): number {
  if (poolSize <= 1) return 1;
  for (const step of [7, 11, 13, 17, 19, 23]) {
    if (step < poolSize && gcd(step, poolSize) === 1) return step;
    if (step >= poolSize && gcd(step, poolSize) === 1) return step;
  }
  return 1;
}

function mostRecentCompletedEntry(
  entries: DailyPrayerLogEntry[],
): DailyPrayerLogEntry | null {
  if (entries.length === 0) return null;
  return [...entries].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  )[0] ?? null;
}

/**
 * Today's Daily Prayer selection for a prayer-day key (YYYY-MM-DD).
 * Pool must already be built for this user (started tracks only).
 * Falls back to Foundations Day 1 on an empty pool rather than
 * crashing — the caller should never pass an empty pool.
 */
export function getDailyPrayerSelectionForDate(
  date: string,
  entries: DailyPrayerLogEntry[],
  pool: DailyPrayerSelection[],
): DailyPrayerSelection {
  if (pool.length === 0) return { trackId: 'foundations', day: 1 };
  const todaysEntry = entries.find((e) => e.date === date);
  if (todaysEntry) return normalizeDailyPrayerEntry(todaysEntry);

  const step = dailyPrayerStep(pool.length);
  const daysSinceEpoch = prayerDayDifference('1970-01-01', date);
  let index = ((daysSinceEpoch * step) % pool.length + pool.length) % pool.length;
  const mostRecent = mostRecentCompletedEntry(entries);
  if (
    pool.length > 1
    && mostRecent
    && dailyPrayerSelectionKey(pool[index]!) === dailyPrayerSelectionKey(normalizeDailyPrayerEntry(mostRecent))
  ) {
    index = (index + 1) % pool.length;
  }
  return pool[index]!;
}
