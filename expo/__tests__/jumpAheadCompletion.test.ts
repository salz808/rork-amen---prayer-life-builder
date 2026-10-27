import { isJumpedAheadDay, resolveCompletionFrontier } from '@/lib/journeyCompletion';

describe('resolveCompletionFrontier (Partner jump-ahead hazard)', () => {
  it('advances exactly one day on a frontier completion', () => {
    expect(resolveCompletionFrontier(5, 5, false)).toEqual({ currentDay: 6, journeyComplete: false });
  });

  it('does NOT leap the frontier on a jumped-ahead completion (the hazard)', () => {
    // Worked example: frontier Day 5, Partner completes Day 20 from the
    // Library. Old code set currentDay = 21, skipping Days 5-19.
    expect(resolveCompletionFrontier(5, 20, false)).toEqual({ currentDay: 5, journeyComplete: false });
  });

  it('a jumped-ahead Day 30 does NOT finish the journey', () => {
    expect(resolveCompletionFrontier(5, 30, false)).toEqual({ currentDay: 5, journeyComplete: false });
  });

  it('a frontier Day 30 finishes the journey and caps at 30', () => {
    expect(resolveCompletionFrontier(30, 30, false)).toEqual({ currentDay: 30, journeyComplete: true });
  });

  it('a replay completion never moves the frontier backwards', () => {
    expect(resolveCompletionFrontier(5, 3, false)).toEqual({ currentDay: 5, journeyComplete: false });
  });

  it('an already-complete journey stays complete on a jumped completion', () => {
    expect(resolveCompletionFrontier(30, 30, true)).toEqual({ currentDay: 30, journeyComplete: true });
  });
});

describe('isJumpedAheadDay', () => {
  it('flags only days strictly ahead of the frontier', () => {
    expect(isJumpedAheadDay(6, 5)).toBe(true);
    expect(isJumpedAheadDay(5, 5)).toBe(false);
    expect(isJumpedAheadDay(3, 5)).toBe(false);
  });
});
