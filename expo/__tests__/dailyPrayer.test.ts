import {
  buildDailyPrayerPool,
  dailyPrayerSelectionKey,
  dailyPrayerStep,
  getDailyPrayerSelectionForDate,
  normalizeDailyPrayerEntry,
} from '@/lib/dailyPrayer';
import type { DailyPrayerLogEntry } from '@/types';
import { prayerDayDifference, shiftPrayerDayKey } from '@/lib/prayerDay';

function entry(date: string, trackId: string, day: number): DailyPrayerLogEntry {
  return { date, trackId, day, completedAt: `${date}T12:00:00.000Z`, duration: 60 };
}

describe('Daily Prayer expanded pool', () => {
  it('always includes Foundations 30, even when the caller forgets it', () => {
    const pool = buildDailyPrayerPool([{ trackId: 'freedom', reachedDay: 5 }]);
    expect(pool.length).toBe(35);
    expect(pool.slice(0, 30).every((s) => s.trackId === 'foundations')).toBe(true);
    expect(pool.slice(30)).toEqual([
      { trackId: 'freedom', day: 1 },
      { trackId: 'freedom', day: 2 },
      { trackId: 'freedom', day: 3 },
      { trackId: 'freedom', day: 4 },
      { trackId: 'freedom', day: 5 },
    ]);
  });

  it('excludes unstarted tracks and future days beyond reached', () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 3 },
      // hearing-god / intercession not passed = unstarted = absent
    ]);
    expect(pool.some((s) => s.trackId === 'hearing-god')).toBe(false);
    expect(pool.some((s) => s.trackId === 'intercession')).toBe(false);
    expect(pool.some((s) => s.trackId === 'freedom' && s.day > 3)).toBe(false);
    expect(pool.length).toBe(33);
  });

  it('legacy entries without trackId map to Foundations', () => {
    expect(normalizeDailyPrayerEntry({ date: '2026-01-01', day: 7, completedAt: '2026-01-01T12:00:00Z', duration: 1 } as DailyPrayerLogEntry))
      .toEqual({ trackId: 'foundations', day: 7 });
  });

  it("today's logged entry wins, even if the rotation would pick another", () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 21 },
    ]);
    const sel = getDailyPrayerSelectionForDate('2026-03-02', [entry('2026-03-02', 'freedom', 9)], pool);
    expect(sel).toEqual({ trackId: 'freedom', day: 9 });
  });

  it('step is coprime to every realistic pool size', () => {
    for (let n = 2; n <= 120; n += 1) {
      const step = dailyPrayerStep(n);
      // gcd(step, n) === 1, computed inline to avoid importing a helper
      let a = step;
      let b = n;
      while (b !== 0) {
        const t = a % b;
        a = b;
        b = t;
      }
      expect(a).toBe(1);
      expect(step).toBeGreaterThan(0);
    }
  });

  it('brute force: no consecutive advertised repeats over 10 years, for every started-track shape', () => {
    const shapes: { trackId: string; reachedDay: number }[][] = [
      [{ trackId: 'foundations', reachedDay: 30 }],
      [{ trackId: 'foundations', reachedDay: 30 }, { trackId: 'freedom', reachedDay: 1 }],
      [{ trackId: 'foundations', reachedDay: 30 }, { trackId: 'freedom', reachedDay: 7 }],
      [{ trackId: 'foundations', reachedDay: 30 }, { trackId: 'freedom', reachedDay: 21 }],
      [
        { trackId: 'foundations', reachedDay: 30 },
        { trackId: 'freedom', reachedDay: 21 },
        { trackId: 'hearing-god', reachedDay: 14 },
      ],
      [
        { trackId: 'foundations', reachedDay: 30 },
        { trackId: 'freedom', reachedDay: 21 },
        { trackId: 'hearing-god', reachedDay: 14 },
        { trackId: 'intercession', reachedDay: 14 },
      ],
    ];
    const start = '2026-01-01';
    expect(prayerDayDifference('1970-01-01', start)).toBeGreaterThan(0);
    for (const shape of shapes) {
      const pool = buildDailyPrayerPool(shape);
      const poolKeys = new Set(pool.map(dailyPrayerSelectionKey));
      let prevKey: string | null = null;
      // No completions at all: pure rotation must never repeat day-to-day.
      for (let i = 0; i < 365 * 10; i += 1) {
        const date = shiftPrayerDayKey(start, i);
        const sel = getDailyPrayerSelectionForDate(date, [], pool);
        expect(poolKeys.has(dailyPrayerSelectionKey(sel))).toBe(true);
        expect(dailyPrayerSelectionKey(sel)).not.toBe(prevKey);
        prevKey = dailyPrayerSelectionKey(sel);
      }
      // With a completion every day (prayed = advertised, lagging one day
      // behind): tomorrow's pick must never equal today's completed pick.
      const log: DailyPrayerLogEntry[] = [];
      for (let i = 0; i < 365; i += 1) {
        const date = shiftPrayerDayKey(start, i);
        const sel = getDailyPrayerSelectionForDate(date, log, pool);
        if (log.length > 0) {
          expect(dailyPrayerSelectionKey(sel)).not.toBe(
            dailyPrayerSelectionKey(normalizeDailyPrayerEntry(log[0]!)),
          );
        }
        log.unshift(entry(date, sel.trackId, sel.day));
      }
    }
  });

  it('completed-day bump: a pick equal to the most recent completion advances by one', () => {
    const pool = buildDailyPrayerPool([{ trackId: 'foundations', reachedDay: 30 }]);
    // Find a date whose raw rotation pick equals a chosen completed entry,
    // then assert the function does not return that entry.
    let found = false;
    for (let i = 0; i < 365 && !found; i += 1) {
      const date = shiftPrayerDayKey('2026-01-01', i);
      const raw = getDailyPrayerSelectionForDate(date, [], pool);
      const withCompletion = getDailyPrayerSelectionForDate(
        date,
        [entry(shiftPrayerDayKey(date, -1), raw.trackId, raw.day)],
        pool,
      );
      // The bump only fires when the raw pick equals the most recent
      // completion; when it fires, the result must differ.
      if (dailyPrayerSelectionKey(withCompletion) !== dailyPrayerSelectionKey(raw)) {
        found = true;
        expect(pool).toContainEqual(withCompletion);
      }
    }
    // With a 30-day pool and a 7-step rotation, the raw pick cycles
    // through every pool entry, so a bump case must occur within a year.
    expect(found).toBe(true);
  });
});
