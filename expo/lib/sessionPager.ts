/**
 * Wave 2, fix 2 (feedback #26, #29–#34): session page sizing rule.
 *
 * A session page must be exactly as tall as the pager viewport — the
 * flex:1 ScrollView below the chrome bar — never the full window.
 * Window-height pages overflowed the viewport (79pt on iPhone 17 Pro),
 * cut content top and bottom, let the previous page peek in, and
 * de-centred content because snap points did not match the viewport.
 * A missing or degenerate measurement falls back to the window height
 * for one frame; the lock-back effect re-seats the pager once the real
 * viewport height lands.
 */
export function resolvePageHeight(
  pagerHeight: number | null,
  windowHeight: number,
): number {
  if (pagerHeight != null && Number.isFinite(pagerHeight) && pagerHeight > 0) {
    return pagerHeight;
  }
  return windowHeight;
}

type SessionMovement = { id: string; kind: string };

/**
 * Wave 2, fix 4: the Closing completion gate. A session counts as
 * prayed-through only when every non-closing movement was visited;
 * the closing page itself never counts toward its own gate.
 */
export function allNonClosingMovementsVisited(
  movements: SessionMovement[],
  visited: ReadonlySet<string>,
): boolean {
  return movements
    .filter((m) => m.kind !== 'closing')
    .every((m) => visited.has(m.id));
}

/**
 * Wave 2, fix 4: where the "go back and pray through" button sends the
 * user — the first non-closing movement not yet visited, or -1 when
 * there is none (which cannot happen while the incomplete variant is
 * showing, but the caller falls back to page 0 defensively).
 */
export function firstUnvisitedMovementIndex(
  movements: SessionMovement[],
  visited: ReadonlySet<string>,
): number {
  return movements.findIndex((m) => m.kind !== 'closing' && !visited.has(m.id));
}
