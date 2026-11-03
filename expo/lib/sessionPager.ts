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
