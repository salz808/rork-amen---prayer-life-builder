/**
 * Pure date math for daily reminder scheduling.
 *
 * Extracted verbatim from scheduleReminderNotification (providers/
 * AppProvider.tsx) so the scheduling rules can be unit-tested without
 * booting the whole provider: 12-hour parsing, past-time skipping, the
 * 60-day window, and the journey-day clamp. No React Native imports here
 * on purpose — this module must stay runnable under plain jest.
 */

export interface ReminderTrigger {
  date: Date;
  journeyDay: number;
}

/** Parses "h:mm AM/PM" into 24-hour parts, or null when malformed. */
export function parseReminderTime(reminderTime: string): { hour: number; minute: number } | null {
  const [timePart, period] = reminderTime.split(' ');
  const [hourStr, minuteStr] = timePart?.split(':') ?? [];
  let hour = parseInt(hourStr ?? '', 10);
  const minute = parseInt(minuteStr ?? '', 10);

  // 12-hour clock, strictly: hour 1–12, minute 0–59, period AM/PM.
  // The old code accepted hour 13 (13 PM → setHours(25), silently
  // rolling the reminder a day forward) and minute 60+.
  if (
    Number.isNaN(hour) || Number.isNaN(minute) ||
    hour < 1 || hour > 12 ||
    minute < 0 || minute > 59 ||
    (period !== 'AM' && period !== 'PM')
  ) {
    return null;
  }

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return { hour, minute };
}

/**
 * The trigger dates for the next `totalDaysToSchedule` days at the parsed
 * reminder time, skipping any that are already past. Journey days count
 * only scheduled triggers (so a skipped past-today slot doesn't shift the
 * journey-day sequence) and clamp to 1–30.
 */
export function computeReminderTriggers(
  reminderTime: string,
  nextDay: number,
  now: Date = new Date(),
  totalDaysToSchedule: number = 60
): ReminderTrigger[] {
  const parsed = parseReminderTime(reminderTime);
  if (!parsed) {
    return [];
  }

  const triggers: ReminderTrigger[] = [];
  for (let i = 0; i < totalDaysToSchedule; i++) {
    const triggerDate = new Date(now);
    triggerDate.setDate(now.getDate() + i);
    triggerDate.setHours(parsed.hour, parsed.minute, 0, 0);

    if (triggerDate.getTime() <= now.getTime()) {
      continue;
    }

    const journeyDay = Math.max(1, Math.min(30, nextDay + triggers.length));
    triggers.push({ date: triggerDate, journeyDay });
  }
  return triggers;
}
