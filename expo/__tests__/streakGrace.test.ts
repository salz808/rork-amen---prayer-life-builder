import {
  countCoveredStreak,
  prayerDayKey,
  shiftPrayerDayKey,
} from '@/lib/prayerDay';

// Round-5 lane-3 H2: a used grace day must PRESERVE the streak count,
// not collapse it. Product rule (onboarding copy): "one missed day is
// covered each month" — a grace day banks one forgiveness for a missing
// older day; it does not itself add to the total.
describe('countCoveredStreak (grace days)', () => {
  // Mon 2026-10-19, Tue 10-20, Wed 10-21, Thu 10-22 (verified weekdays).
  const MON = '2026-10-19';
  const runThroughMon = Array.from({ length: 12 }, (_, i) => shiftPrayerDayKey(MON, -11 + i));

  it('preserves the run across Mon complete -> Tue missed -> Wed grace -> Thu complete', () => {
    const completed = [...runThroughMon, '2026-10-22'];
    expect(countCoveredStreak(completed, ['2026-10-21'], '2026-10-22')).toBe(13);
  });

  it('keeps the display at 12 on the grace day itself (no completion that day)', () => {
    expect(countCoveredStreak(runThroughMon, ['2026-10-21'], '2026-10-21')).toBe(12);
  });

  it('breaks on a gap with no grace day (the old behavior, unchanged)', () => {
    const completed = [...runThroughMon, '2026-10-22'];
    expect(countCoveredStreak(completed, [], '2026-10-22')).toBe(1);
  });

  it('cannot forgive a gap newer than the grace use', () => {
    // Fri completed, Thu missing, grace used Wed (older than the gap).
    const completed = [...runThroughMon, '2026-10-23'];
    expect(countCoveredStreak(completed, ['2026-10-21'], '2026-10-23')).toBe(1);
  });

  it('banks one forgiveness per grace day across a single missing day', () => {
    const completed = [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ];
    expect(countCoveredStreak(completed, ['2026-10-07'], '2026-10-10')).toBe(8);
  });

  it('does not double-count a grace day that falls on a completed day', () => {
    const completed = ['2026-10-19', '2026-10-20', '2026-10-21'];
    expect(countCoveredStreak(completed, ['2026-10-20'], '2026-10-21')).toBe(3);
  });

  it('is 0 with no completions, even with grace days', () => {
    expect(countCoveredStreak([], ['2026-10-21'], '2026-10-21')).toBe(0);
  });
});

// Round-5 lane-3 L1: the 4 AM prayer-day boundary in wall-clock terms.
// Local-constructed instants keep these tests TZ-robust, EXCEPT the
// spring-forward case, which only discriminates old-vs-new code under
// America/New_York — run this file with TZ=America/New_York to prove
// it (the old absolute-shift math maps 2026-03-08 04:30 to 2026-03-07).
describe('prayerDayKey (4 AM boundary)', () => {
  it('maps before 4 AM to the previous prayer day', () => {
    expect(prayerDayKey(new Date(2026, 9, 19, 3, 30, 0, 0))).toBe('2026-10-18');
  });

  it('maps 4 AM exactly to the new prayer day', () => {
    expect(prayerDayKey(new Date(2026, 9, 19, 4, 0, 0, 0))).toBe('2026-10-19');
  });

  it('maps after 4 AM to the same prayer day', () => {
    expect(prayerDayKey(new Date(2026, 9, 19, 4, 30, 0, 0))).toBe('2026-10-19');
  });

  it('does not slip to 5 AM on spring-forward day (America/New_York)', () => {
    // 2026-03-08 is the US spring-forward Sunday (2 AM -> 3 AM).
    expect(prayerDayKey(new Date(2026, 2, 8, 4, 30, 0, 0))).toBe('2026-03-08');
    expect(prayerDayKey(new Date(2026, 2, 8, 3, 30, 0, 0))).toBe('2026-03-07');
  });
});
