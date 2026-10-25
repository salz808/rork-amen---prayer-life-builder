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
 *
 * Round-5 lane-3 L1: this used to subtract exactly 4 hours of ABSOLUTE
 * time and then take the local date. On a spring-forward day the UTC
 * offset changes inside that window, so 4:00–4:59 AM mapped to the
 * previous prayer day (the new day arrived an hour late) while
 * msUntilNextPrayerDay (wall-clock 4:00 AM) disagreed. Compute the
 * boundary in wall-clock terms instead: 4:00 AM local on the instant's
 * own local date. Identical to the old math on every day except the
 * spring-forward 4:00–4:59 AM hour, where it is now correct; fall-back
 * days are unaffected (both 1:30 AM occurrences are before 4:00 AM).
 */
export function prayerDayKey(date: Date = new Date()): string {
  const local = localDateKey(date);
  const boundary = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    PRAYER_DAY_START_HOUR,
    0,
    0,
    0,
  );
  return date.getTime() >= boundary.getTime() ? local : shiftPrayerDayKey(local, -1);
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

/**
 * Round-5 lane-3 H2: count a consecutive run of covered prayer days
 * ending at `newestDayKey`. Shared by the provider's display streak and
 * the sync-time derived streak so both loops agree.
 *
 * `completedDayKeys` — prayer days with a real completion.
 * `graceDayKeys` — prayer days on which a grace day was used.
 *
 * Product rule (onboarding copy: "one missed day is covered each
 * month"): a grace day does NOT itself count as a prayed day and does
 * NOT add to the total — it banks one forgiveness that lets the run
 * continue across exactly one missing day OLDER than the grace use.
 * So Mon complete (run of 12) → Tue missed → Wed grace → Thu complete
 * counts 13: Thu plus the preserved run through Mon, with Tue forgiven
 * by the Wed grace. A grace day can never forgive a gap NEWER than
 * itself (the walk runs backward in time), and a grace day banked with
 * no gap behind it simply goes unspent. With no grace days this is
 * exactly the old consecutive-days count.
 */
export function countCoveredStreak(
  completedDayKeys: string[],
  graceDayKeys: string[],
  newestDayKey: string,
): number {
  const completed = new Set(completedDayKeys);
  const grace = new Set(graceDayKeys);
  if (completed.size === 0) return 0;
  let streak = 0;
  let banked = 0;
  let cursor = newestDayKey;
  for (;;) {
    if (completed.has(cursor)) {
      streak += 1;
      cursor = shiftPrayerDayKey(cursor, -1);
    } else if (grace.has(cursor)) {
      banked += 1;
      cursor = shiftPrayerDayKey(cursor, -1);
    } else if (banked > 0) {
      banked -= 1;
      cursor = shiftPrayerDayKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}
