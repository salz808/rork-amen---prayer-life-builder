import { computeReminderTriggers, parseReminderTime } from '@/lib/reminderSchedule';

describe('parseReminderTime', () => {
  it('parses AM/PM into 24-hour parts', () => {
    expect(parseReminderTime('7:30 AM')).toEqual({ hour: 7, minute: 30 });
    expect(parseReminderTime('7:30 PM')).toEqual({ hour: 19, minute: 30 });
  });

  it('handles 12 AM as midnight and 12 PM as noon', () => {
    expect(parseReminderTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
  });

  it('rejects malformed input', () => {
    expect(parseReminderTime('')).toBeNull();
    expect(parseReminderTime('abc')).toBeNull();
    expect(parseReminderTime('7:30')).toBeNull();
    expect(parseReminderTime('7:xx AM')).toBeNull();
  });

  it('rejects out-of-range 12-hour values instead of rolling the day', () => {
    // 13 PM used to become setHours(25) — a silent day roll.
    expect(parseReminderTime('13:30 PM')).toBeNull();
    expect(parseReminderTime('0:30 AM')).toBeNull();
    expect(parseReminderTime('7:60 AM')).toBeNull();
    expect(parseReminderTime('7:30 XM')).toBeNull();
    expect(parseReminderTime('-1:30 AM')).toBeNull();
  });
});

describe('computeReminderTriggers', () => {
  it('schedules 60 days starting today when the time is still ahead', () => {
    const now = new Date(2026, 9, 24, 6, 0, 0);
    const triggers = computeReminderTriggers('7:30 AM', 1, now);
    expect(triggers).toHaveLength(60);
    expect(triggers[0].date).toEqual(new Date(2026, 9, 24, 7, 30, 0, 0));
    expect(triggers[0].journeyDay).toBe(1);
  });

  it('skips a past-today slot without shifting the journey-day sequence', () => {
    const now = new Date(2026, 9, 24, 8, 0, 0);
    const triggers = computeReminderTriggers('7:30 AM', 1, now);
    expect(triggers).toHaveLength(59);
    expect(triggers[0].date).toEqual(new Date(2026, 9, 25, 7, 30, 0, 0));
    expect(triggers[0].journeyDay).toBe(1);
  });

  it('clamps journey days to 30', () => {
    const now = new Date(2026, 9, 24, 6, 0, 0);
    const triggers = computeReminderTriggers('7:30 AM', 28, now);
    expect(triggers.slice(0, 4).map((t) => t.journeyDay)).toEqual([28, 29, 30, 30]);
    expect(triggers.every((t) => t.journeyDay <= 30)).toBe(true);
  });

  it('returns strictly increasing future dates across month boundaries', () => {
    const now = new Date(2026, 9, 31, 6, 0, 0);
    const triggers = computeReminderTriggers('7:30 AM', 1, now);
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every((t) => t.date.getTime() > now.getTime())).toBe(true);
    for (let i = 1; i < triggers.length; i++) {
      expect(triggers[i].date.getTime()).toBeGreaterThan(triggers[i - 1].date.getTime());
    }
  });

  it('returns [] for an invalid reminder time', () => {
    expect(computeReminderTriggers('nonsense', 1, new Date())).toEqual([]);
  });
});
