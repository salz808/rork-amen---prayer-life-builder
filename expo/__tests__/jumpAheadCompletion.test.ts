import { isJumpedAheadDay, resolveCompletionFrontier } from '@/lib/journeyCompletion';
import { foundationsCompleteFromProgress } from '@/lib/trackProgress';

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

describe('foundationsCompleteFromProgress (binge-finish guard)', () => {
  const completed = (day: number, jumpedAhead = false) => ({ day, completed: true, jumpedAhead });
  const frontierRun = (n: number) => Array.from({ length: n }, (_, i) => completed(i + 1));

  it('30 frontier completions still count as complete', () => {
    expect(foundationsCompleteFromProgress(frontierRun(30))).toBe(true);
  });

  it('jumped-ahead entries do NOT count toward the 30', () => {
    // Frontier at Day 5 + jumped days 6..30 binged from the Library:
    // 30 completed entries, but only 5 frontier days — not complete.
    const entries = [...frontierRun(5), ...Array.from({ length: 25 }, (_, i) => completed(6 + i, true))];
    expect(entries.filter((p) => p.completed).length).toBe(30);
    expect(foundationsCompleteFromProgress(entries)).toBe(false);
  });

  it('a jumped Day 30 alone never finishes the journey', () => {
    expect(foundationsCompleteFromProgress([...frontierRun(4), completed(30, true)])).toBe(false);
  });

  it('the sticky journeyComplete flag still wins (graduate preservation)', () => {
    expect(foundationsCompleteFromProgress(frontierRun(5), true)).toBe(true);
  });
});

describe('isJumpedAheadDay', () => {
  it('flags only days strictly ahead of the frontier', () => {
    expect(isJumpedAheadDay(6, 5)).toBe(true);
    expect(isJumpedAheadDay(5, 5)).toBe(false);
    expect(isJumpedAheadDay(3, 5)).toBe(false);
  });
});

describe('foundationsCompleteFromProgress (binge-finish guard)', () => {
  const frontierEntry = (day: number) => ({ day, completed: true, completedAt: '2026-10-01T12:00:00.000Z', duration: 300 });
  const jumpedEntry = (day: number) => ({ ...frontierEntry(day), jumpedAhead: true });

  it('a full 30-day binge of jumped-ahead entries does NOT complete the journey', () => {
    const progress = Array.from({ length: 30 }, (_, i) => jumpedEntry(i + 1));
    expect(foundationsCompleteFromProgress(progress, false)).toBe(false);
  });

  it('29 frontier days + a jumped Day 30 does NOT complete the journey', () => {
    const progress = [
      ...Array.from({ length: 29 }, (_, i) => frontierEntry(i + 1)),
      jumpedEntry(30),
    ];
    expect(foundationsCompleteFromProgress(progress, false)).toBe(false);
  });

  it('30 frontier (non-jumped) days DO complete the journey', () => {
    const progress = Array.from({ length: 30 }, (_, i) => frontierEntry(i + 1));
    expect(foundationsCompleteFromProgress(progress, false)).toBe(true);
  });

  it('a genuine journeyComplete flag still wins, and legacy entries without the flag still count', () => {
    expect(foundationsCompleteFromProgress([], true)).toBe(true);
    const legacy = Array.from({ length: 30 }, (_, i) => ({ completed: true }));
    expect(foundationsCompleteFromProgress(legacy, false)).toBe(true);
  });
});
