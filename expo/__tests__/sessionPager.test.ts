// Wave 2, fix 2 (feedback #26, #29–#34): session pages must be
// viewport-height, never window-height. The pager component itself is
// not renderable under jest, so the sizing rule it now uses is tested
// here as the pure function.
import {
  allNonClosingMovementsVisited,
  firstUnvisitedMovementIndex,
  resolvePageHeight,
} from '../lib/sessionPager';

describe('resolvePageHeight', () => {
  it('uses the measured pager viewport when available', () => {
    expect(resolvePageHeight(700, 844)).toBe(700);
  });

  it('falls back to the window height before the first layout pass', () => {
    expect(resolvePageHeight(null, 844)).toBe(844);
  });

  it('ignores a degenerate zero/negative measurement instead of collapsing pages', () => {
    expect(resolvePageHeight(0, 844)).toBe(844);
    expect(resolvePageHeight(-10, 844)).toBe(844);
  });
});

describe('closing completion gate (fix 4)', () => {
  const movements = [
    { id: 'settle', kind: 'settle' },
    { id: 'thank', kind: 'thank' },
    { id: 'declare', kind: 'declare' },
    { id: 'closing', kind: 'closing' },
  ];

  it('requires every non-closing movement, and never counts closing itself', () => {
    expect(allNonClosingMovementsVisited(movements, new Set(['settle', 'thank', 'declare']))).toBe(true);
    // A dot-jump that visited only settle + closing is not prayed-through.
    expect(allNonClosingMovementsVisited(movements, new Set(['settle', 'closing']))).toBe(false);
    expect(allNonClosingMovementsVisited(movements, new Set())).toBe(false);
  });

  it('sends "go back" to the first unvisited movement', () => {
    expect(firstUnvisitedMovementIndex(movements, new Set(['settle']))).toBe(1);
    expect(firstUnvisitedMovementIndex(movements, new Set(['settle', 'thank', 'declare']))).toBe(-1);
  });
});
