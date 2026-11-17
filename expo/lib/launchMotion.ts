// Launch motion — the shared choreography for app launch (the
// SplashMotion launch variant rendered by BootScreen in
// app/_layout.tsx -> first paint) and the Home mount entrance.
//
// The boot overlay now renders the launch splash (drift, bloom, logo,
// tagline, amber phrase, footnote — ~2.34s arrival, SPLASH_TOTAL_MS
// in lib/splashMotion.ts), and exits in two beats once the app is
// ready AND the entrance is done (or skipped, or Reduce-Motion-
// immediate): the content fades 1 -> 0 over 260ms, then the solid
// veil lifts 1 -> 0 over 440ms starting 60ms later; pointerEvents go
// none when the veil starts lifting. The 26s drift is ambient — the
// exit keys off the 2.34s arrival only, never the drift.
//
// Mount-relative timeline (t=0 is the boot's first frame):
//   t=0     splash entrance starts (mount — NOT gated on appReady)
//   t=940   Home entrance starts behind the overlay (veil still up);
//           Home is at rest by the time the veil clears
//   t=2340  arrival complete — earliest the exit may start, once
//           fonts are also ready
//
// The exit is gated on BOTH app-ready (fonts) and launchDone: whichever
// is later. The app mounts underneath the fading boot, so time-to-
// interactive does not grow past the veil lift. bootExitDelayMs still
// applies its floor from the boot clock: 0 in normal motion (the 2.34s
// entrance is long past the old 760ms Still Point), and the 380ms hold
// under Reduce Motion.
//
// Reduce Motion: Static Hold + Fade, 640ms total — hold the logo
// 380ms, fade the veil 260ms, Home static at rest. No loops, no rises,
// no staggered entrance anywhere in this file's choreography.
//
// NOTE (2026-11-17): the old boot-entrance constants below (BOOT_BLOOM_MS,
// BOOT_WORDMARK_*, BOOT_SUBTITLE_MS, BOOT_SWEEP_*, BOOT_ORBIT_*,
// BOOT_GLOW_PEAK_OPACITY, LAUNCH_STAGGER_MS, BOOT_STILL_POINT_MS and the
// derived BOOT_WORDMARK_SETTLE_MS / BOOT_EXIT_START_MS / BOOT_VEIL_START_MS)
// no longer drive any on-screen choreography — the entrance lives in
// SplashMotion now. They are kept because __tests__/launchMotion.test.ts
// pins every value and bootExitDelayMs still reads BOOT_EXIT_START_MS;
// deleting them means updating the test pins too, which is a follow-up
// call, not this change.

// Boot entrance stagger: bloom, then wordmark, then subtitle.
export const LAUNCH_STAGGER_MS = 120;
// Home 3-tier stagger (greeting -> Daily Prayer card -> journey summary).
export const HOME_STAGGER_MS = 65;
// Each Home tier: opacity 0 -> 1, 380-420ms.
export const HOME_ENTRANCE_MS = 400;
export const BOOT_BLOOM_MS = 680;
export const BOOT_WORDMARK_MS = 500;
export const BOOT_WORDMARK_OPACITY_MS = 400;
export const BOOT_SUBTITLE_MS = 260;
export const BOOT_SWEEP_DELAY_MS = 420;
export const BOOT_SWEEP_MS = 800;
// Orbit ring: a sundial arc that settles once (-6deg -> 0deg), never a
// looped spin. Peak opacity 0.28 keeps the stroke under the 0.4 cap.
export const BOOT_ORBIT_MS = 1100;
export const BOOT_ORBIT_PEAK_OPACITY = 0.28;
// Glow bloom peaks at 0.42, never 1.0.
export const BOOT_GLOW_PEAK_OPACITY = 0.42;
// Still Point: the pause after the wordmark settles before the veil lifts.
export const BOOT_STILL_POINT_MS = 140;
/** Wordmark settles at stagger + rise. */
export const BOOT_WORDMARK_SETTLE_MS = LAUNCH_STAGGER_MS + BOOT_WORDMARK_MS;
/** Earliest the boot exit may start: wordmark settled + Still Point. */
export const BOOT_EXIT_START_MS = BOOT_WORDMARK_SETTLE_MS + BOOT_STILL_POINT_MS;
// Boot exit, split: content fades first, the solid veil follows 60ms later.
export const BOOT_CONTENT_EXIT_MS = 260;
export const BOOT_VEIL_EXIT_DELAY_MS = 60;
export const BOOT_VEIL_EXIT_MS = 440;
/** Veil lift starts at t=820 (exit start + 60ms). */
export const BOOT_VEIL_START_MS = BOOT_EXIT_START_MS + BOOT_VEIL_EXIT_DELAY_MS;
// Reduce Motion: hold 380ms + fade veil 260ms = 640ms total.
export const BOOT_REDUCE_HOLD_MS = 380;
export const BOOT_REDUCE_EXIT_MS = 260;
/** Home entrance starts at t=940 — 300ms before the veil finishes lifting. */
export const HOME_ENTRANCE_AT_MS = 940;

// ── Boot clock ───────────────────────────────────────────────────────────
// t=0 above is the boot's first frame. The layout marks it on mount;
// Home reads it so its entrance lands at t=940 even when fonts load
// fast (Home mounts at app-ready, which is earlier than 940ms on a
// fast load). If fonts were slow and Home mounts after 940ms, the
// delay below is 0 — the entrance starts immediately, never held.
let bootStartedAtMs: number | null = null;

export function markBootStart(nowMs: number = Date.now()): void {
  if (bootStartedAtMs === null) {
    bootStartedAtMs = nowMs;
  }
}

export function msSinceBootStart(nowMs: number = Date.now()): number {
  if (bootStartedAtMs === null) {
    return 0;
  }
  return Math.max(0, nowMs - bootStartedAtMs);
}

/** Tests only: the clock is set-once per launch, so tests reset it. */
export function resetBootStart(): void {
  bootStartedAtMs = null;
}

/**
 * Delay before the boot exit may start, from how long the boot has
 * been up. The exit waits for the Still Point (or the Reduce Motion
 * hold); a slow font load has already waited longer, so no extra hold.
 */
export function bootExitDelayMs(elapsedMs: number, reduceMotion: boolean): number {
  const startAt = reduceMotion ? BOOT_REDUCE_HOLD_MS : BOOT_EXIT_START_MS;
  return Math.max(0, startAt - elapsedMs);
}

/** Boot veil fade duration — 260ms under Reduce Motion, 440ms otherwise. */
export function bootVeilDurationMs(reduceMotion: boolean): number {
  return reduceMotion ? BOOT_REDUCE_EXIT_MS : BOOT_VEIL_EXIT_MS;
}

/**
 * Delay before the Home entrance cascade starts, from how long the
 * boot has been up. The cascade begins at t=940 while the boot veil
 * is still lifting, so the greeting lands just as the veil clears.
 * No delay under Reduce Motion — the content simply appears.
 */
export function homeEntranceDelayForElapsedMs(elapsedMs: number, reduceMotion: boolean): number {
  if (reduceMotion) {
    return 0;
  }
  return Math.max(0, HOME_ENTRANCE_AT_MS - elapsedMs);
}

// ── Completion (M-5): the Closing movement's 3-beat choreography ──
// Beat 1 Amen Silence 600ms (Light haptic at 150ms, Success at the reveal);
// Beat 2 reveal: checkmark springs from 0.94, recap fades 460ms (the 12pt
// rise stays — the 32px sheet rise does not map to a full page);
// Beat 3 Inner Seal: the action row fades in 80ms after the recap starts.
// Milestone confetti waits out the silence (600 + 400ms).
// Reduce Motion: no delay, no haptics, everything at rest immediately.
export const COMPLETION_SILENCE_MS = 600;
export const COMPLETION_LIGHT_AT_MS = 150;
export const COMPLETION_CHECK_START = 0.94;
export const COMPLETION_RECAP_MS = 460;
export const COMPLETION_CTA_DELAY_MS = 680;
export const COMPLETION_CTA_MS = 300;
export const COMPLETION_CONFETTI_MS = 1000;
