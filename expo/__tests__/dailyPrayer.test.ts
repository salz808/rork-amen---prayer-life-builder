import {
  buildDailyPrayerPool,
  dailyPrayerSelectionKey,
  dailyPrayerStep,
  getDailyPrayerSelectionForDate,
  isSelectionInPool,
  normalizeDailyPrayerEntry,
  reachedTrackDays,
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

  it('jumped Day 20 does NOT pull unprayed days 6-19 into the pool (reached-days-only)', () => {
    // Worked example from the audit: Freedom frontier Day 5 (days 1-4
    // complete, Day 5 current), Partner jumped Day 20. The old scalar
    // max() pool was 1..20; the sparse pool must be exactly
    // {1,2,3,4,5,20} for Freedom — no 6-19, which were never prayed.
    const days = reachedTrackDays({
      lastDay: 4,
      frontierDay: 5,
      jumpedDays: [20],
      dayCount: 21,
    });
    expect(days).toEqual([1, 2, 3, 4, 5, 20]);
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 20, days },
    ]);
    const freedomDays = pool.filter((s) => s.trackId === 'freedom').map((s) => s.day);
    expect(freedomDays).toEqual([1, 2, 3, 4, 5, 20]);
    expect(pool.length).toBe(36);
  });

  it('sparse days win over reachedDay and dedupe / clamp', () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 21, days: [5, 3, 3, 99, 0, -2] },
    ]);
    // The builder itself keeps positive days as given, dedupes, and
    // sorts ascending; clamping to a track's dayCount is the caller's
    // job (reachedTrackDays does it) — so 99 survives here, while 0
    // and -2 are dropped as non-days.
    expect(pool.filter((s) => s.trackId === 'freedom').map((s) => s.day)).toEqual([3, 5, 99]);
  });

  it('reachedTrackDays: grandfathered (no record) uses the stored frontier; jumped days join individually', () => {
    expect(reachedTrackDays({ lastDay: null, frontierDay: 3, jumpedDays: [], dayCount: 21 }))
      .toEqual([1, 2, 3]);
    expect(reachedTrackDays({ lastDay: 2, frontierDay: 9, jumpedDays: [7, 12], dayCount: 21 }))
      .toEqual([1, 2, 3, 7, 12]);
    expect(reachedTrackDays({ lastDay: 20, frontierDay: 21, jumpedDays: [21], dayCount: 21 }))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });

  it('isSelectionInPool gates Daily Prayer route validation', () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 5, days: [1, 2, 3, 4, 5, 20] },
    ]);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 20 })).toBe(true);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 12 })).toBe(false);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 6 })).toBe(false);
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

describe('Daily Prayer sparse pool after Partner jump-ahead (reached-days-only)', () => {
  it('a sparse days set wins over reachedDay: jumped {1, 20} + frontier 5 gives only {1, 5, 20}, never 1..20', () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 20, days: [1, 20, 5] },
    ]);
    const freedom = pool.filter((s) => s.trackId === 'freedom');
    expect(freedom).toEqual([
      { trackId: 'freedom', day: 1 },
      { trackId: 'freedom', day: 5 },
      { trackId: 'freedom', day: 20 },
    ]);
    expect(freedom.some((s) => s.day >= 6 && s.day <= 19)).toBe(false);
  });

  it('reachedTrackDays: walked days 1..4 + frontier 5 + jumped 20 gives {1..5, 20}, never the skipped 6..19', () => {
    const days = reachedTrackDays({ lastDay: 4, frontierDay: 5, jumpedDays: [20], dayCount: 21 });
    expect(days).toEqual([1, 2, 3, 4, 5, 20]);
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 5, days },
    ]);
    expect(pool.some((s) => s.trackId === 'freedom' && s.day >= 6 && s.day <= 19)).toBe(false);
    expect(pool).toContainEqual({ trackId: 'freedom', day: 20 });
    expect(pool).toContainEqual({ trackId: 'freedom', day: 5 });
  });

  it('reachedTrackDays without a record (grandfathered) still adds jumped days individually', () => {
    expect(reachedTrackDays({ lastDay: null, frontierDay: 5, jumpedDays: [20], dayCount: 21 }))
      .toEqual([1, 2, 3, 4, 5, 20]);
  });

  it('isSelectionInPool admits only exact pool members (route validation input)', () => {
    const pool = buildDailyPrayerPool([
      { trackId: 'foundations', reachedDay: 30 },
      { trackId: 'freedom', reachedDay: 5, days: [1, 2, 3, 4, 5, 20] },
    ]);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 20 })).toBe(true);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 6 })).toBe(false);
    expect(isSelectionInPool(pool, { trackId: 'freedom', day: 19 })).toBe(false);
    expect(isSelectionInPool(pool, { trackId: 'hearing-god', day: 1 })).toBe(false);
  });
});

describe('Foundations pool limit for non-graduate Partners (Kai, 2026-10-28)', () => {
  it('non-graduate Partner at frontier Day 5 sees Foundations 1-5 only, never 6-30', () => {
    const pool = buildDailyPrayerPool(
      [{ trackId: 'foundations', reachedDay: 5 }],
      { foundationsGraduated: false },
    );
    expect(pool.filter((s) => s.trackId === 'foundations').map((s) => s.day))
      .toEqual([1, 2, 3, 4, 5]);
    expect(pool.some((s) => s.trackId === 'foundations' && s.day >= 6)).toBe(false);
    expect(isSelectionInPool(pool, { trackId: 'foundations', day: 5 })).toBe(true);
    expect(isSelectionInPool(pool, { trackId: 'foundations', day: 6 })).toBe(false);
    expect(isSelectionInPool(pool, { trackId: 'foundations', day: 30 })).toBe(false);
  });

  it('non-graduate sparse set: completed + frontier + jumped days individually, never expanded', () => {
    // Completed 1-4, frontier 5, jumped Day 20: the pool must be
    // exactly {1,2,3,4,5,20} — the jumped day joins individually,
    // it never expands the pool into unprayed days 6-19.
    const pool = buildDailyPrayerPool(
      [{ trackId: 'foundations', reachedDay: 5, days: [1, 2, 3, 4, 5, 20] }],
      { foundationsGraduated: false },
    );
    expect(pool.filter((s) => s.trackId === 'foundations').map((s) => s.day))
      .toEqual([1, 2, 3, 4, 5, 20]);
    expect(pool.some((s) => s.trackId === 'foundations' && s.day >= 6 && s.day <= 19)).toBe(false);
  });

  it('a graduate sees their full completed set (the full 30), not the reached-days limit', () => {
    const pool = buildDailyPrayerPool(
      [{ trackId: 'foundations', reachedDay: 5, days: [1, 2, 3, 4, 5, 20] }],
      { foundationsGraduated: true },
    );
    expect(pool.filter((s) => s.trackId === 'foundations').map((s) => s.day))
      .toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(isSelectionInPool(pool, { trackId: 'foundations', day: 30 })).toBe(true);
  });

  it('the default (no option) keeps the legacy graduate behaviour: Foundations always 30', () => {
    const pool = buildDailyPrayerPool([{ trackId: 'foundations', reachedDay: 5 }]);
    expect(pool.filter((s) => s.trackId === 'foundations').length).toBe(30);
  });

  it('non-graduate other tracks are untouched by the Foundations limit', () => {
    const pool = buildDailyPrayerPool(
      [
        { trackId: 'foundations', reachedDay: 5 },
        { trackId: 'freedom', reachedDay: 5, days: [1, 2, 3, 4, 5, 20] },
      ],
      { foundationsGraduated: false },
    );
    expect(pool.filter((s) => s.trackId === 'freedom').map((s) => s.day))
      .toEqual([1, 2, 3, 4, 5, 20]);
    expect(pool.filter((s) => s.trackId === 'foundations').map((s) => s.day))
      .toEqual([1, 2, 3, 4, 5]);
  });
});
