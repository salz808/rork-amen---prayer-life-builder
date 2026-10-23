import { prayerDayKey } from '@/lib/prayerDay';

/**
 * Kai's Home greeting pool (selected 2026-10-22, verbatim).
 *
 * The greeting line under "Good morning / afternoon / evening" rotates
 * daily through this pool — date-seeded by prayer day (TRIAD's day runs
 * 4:00 AM local to 3:59 AM, see lib/prayerDay.ts), so the same greeting
 * shows all day and a new one arrives with the new prayer day. Never
 * random per render.
 *
 * Two lines only make sense once someone has a day behind them —
 * "I'm so thankful that you've made it this far." and "Welcome back,
 * beloved." — so day-0 users rotate over FIRST_DAY_POOL (13 lines) and
 * everyone with at least one completed day rotates over all 15.
 */
export const GREETING_POOL: string[] = [
  'Hello, beloved.',
  'You’ve come to the right place.',
  'I’m so thankful that you’ve made it this far.',
  'Welcome, beloved.',
  'You’re right where you need to be.',
  'Praise God, we get to be with Him today.',
  'Are you ready to draw near?',
  'Come close, beloved.',
  'Welcome back, beloved.',
  'So glad you’re here, family.',
  'Hello, beloved. You are welcome here.',
  'You’re loved, you’re welcomed, and there’s grace for today.',
  'Come with expectation.',
  'You are welcome here.',
  'Jesus, we turn our hearts to You.',
];

/** Lines that require at least one completed day behind the user. */
const RETURNING_ONLY: string[] = [
  'I’m so thankful that you’ve made it this far.',
  'Welcome back, beloved.',
];

/** Day-0 rotation: every pool line that reads true for a brand-new user. */
export const FIRST_DAY_POOL: string[] = GREETING_POOL.filter(
  (line) => !RETURNING_ONLY.includes(line)
);

/** Rotation for users with ≥1 completed day: the full pool. */
export const RETURNING_POOL: string[] = GREETING_POOL;

/**
 * The greeting for a prayer day. Deterministic: the prayer-day key is
 * converted to a whole-day number and taken modulo the pool size, so
 * consecutive prayer days step through the pool in order and the full
 * pool cycles before any line repeats.
 */
export function getDailyGreeting(
  completedDays: number,
  dayKey: string = prayerDayKey()
): string {
  const pool = completedDays >= 1 ? RETURNING_POOL : FIRST_DAY_POOL;
  const [y, m, d] = dayKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
  return pool[dayNumber % pool.length] ?? pool[0] ?? 'Hello, beloved.';
}
