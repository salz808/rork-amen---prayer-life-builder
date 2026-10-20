/**
 * Prayer-day math.
 *
 * A "prayer day" runs from 4:00 AM local time to 3:59 AM the next morning —
 * the boundary Kai chose so nobody's day flips while they're still up
 * praying (or drifting off with Selah), and early risers are always on the
 * new day. One journey day unlocks per prayer day, on every track.
 */

export const PRAYER_DAY_START_HOUR = 4;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The prayer-day key (local YYYY-MM-DD) for an instant. Anything before
 * 4:00 AM local belongs to the previous prayer day.
 */
export function prayerDayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - PRAYER_DAY_START_HOUR * 60 * 60 * 1000);
  return localDateKey(shifted);
}

/** Milliseconds from `date` until the next prayer day begins (next 4:00 AM local). */
export function msUntilNextPrayerDay(date: Date = new Date()): number {
  const next = new Date(date);
  next.setHours(PRAYER_DAY_START_HOUR, 0, 0, 0);
  if (next.getTime() <= date.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - date.getTime();
}

/** True when `earlierKey` is a strictly earlier prayer day than `laterKey`. */
export function isBeforePrayerDay(earlierKey: string, laterKey: string): boolean {
  return earlierKey < laterKey;
}
