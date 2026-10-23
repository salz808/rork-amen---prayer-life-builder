/**
 * Feature flags — the single switchboard for anything that ships dark.
 *
 * Circles (Posture C, decided by Kai 2026-10-22): hidden for launch and
 * revisited after. Every circle entry point — the Community-tab card, the
 * wall scope chips, the Settings row, the /circles and /circle/join routes,
 * and amen-app:// invite links — reads `FEATURES.circles`, so re-enabling
 * the feature is this one line. The data, tables, and lib/circles.ts logic
 * stay intact underneath; nothing is deleted.
 */
export const FEATURES = {
  circles: false,
} as const;
