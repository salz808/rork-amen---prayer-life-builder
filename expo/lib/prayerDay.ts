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

/**
 * Shifts a prayer-day key by whole days. Keys are abstract local calendar
 * dates, so this is pure calendar arithmetic on the key itself — no
 * instants, no DST edge cases.
 */
export function shiftPrayerDayKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

/** Whole prayer days from `earlierKey` to `laterKey` (later − earlier). */
export function prayerDayDifference(earlierKey: string, laterKey: string): number {
  const [y1, m1, d1] = earlierKey.split('-').map(Number);
  const [y2, m2, d2] = laterKey.split('-').map(Number);
  const a = Date.UTC(y1, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86400000);
}
