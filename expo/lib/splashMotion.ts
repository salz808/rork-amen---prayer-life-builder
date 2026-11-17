// Splash motion (GPT-6 spec, 2026-11-17) — the single source of truth
// for the onboarding splash choreography. Pure constants + pure helpers
// only: no react-native, no Reanimated imports, so node Jest can import
// this directly and pin the choreography without a renderer.
//
// The Reanimated component (components/SplashMotion.tsx) applies these
// numbers with withDelay/withTiming; the drift math below is mirrored
// inline in that file's useAnimatedStyle worklet (worklets cannot call
// imported plain functions, so the formula lives in both places — keep
// them in sync: DRIFT_ROTATION_RAD, the ±12% / ±7% amplitudes, and the
// 0.40–0.78 opacity sine below).
//
// Beats (all cubic-bezier(0.22, 1, 0.36, 1) — SPLASH_EASE — no spring,
// no overshoot anywhere):
//   Bloom     0–950ms    scale 0.72→1.24, opacity 0→0.65→0
//   Logo      320–920ms  opacity 0→1, Y +14→0, scale 0.985→1
//   Tagline   960–1400ms opacity 0→1, Y +8→0
//   Amber     1280–1700ms opacity 0→1, Y +6→0
//   Button    1650–2110ms opacity 0→1, Y +12→0, scale 0.985→1
//   Footnote  1980–2340ms opacity 0→1, Y +5→0
// Total ~2.35s. The bloom + entrance play ONCE per session (see
// createSplashSession); returning to the splash renders final state.

// ── Copy (unchanged — pinned by __tests__/splashMotion.test.ts) ──────────
export const SPLASH_TAGLINE_LEAD = 'A simple 30-day guide to a real daily prayer life, just';
export const SPLASH_TAGLINE_AMBER = 'three honest minutes a day.';
export const SPLASH_FOOTNOTE = 'No perfect words needed.';
export const SPLASH_CTA_LABEL = "LET'S BEGIN";

// ── Easing ───────────────────────────────────────────────────────────────
// The one entrance easing (cubic-bezier(0.22, 1, 0.36, 1)) and the bloom
// fade easing (cubic-bezier(0.4, 0, 1, 1)). Passed to Reanimated as
// Easing.bezier(...SPLASH_EASE) / Easing.bezier(...SPLASH_FADE_EASE).
export const SPLASH_EASE = [0.22, 1, 0.36, 1] as const;
export const SPLASH_FADE_EASE = [0.4, 0, 1, 1] as const;

// ── Ambient drift ────────────────────────────────────────────────────────
// ONE large moving amber glow only: 540pt, rgb(200,137,74),
// maxOpacity 0.28, view opacity oscillating 0.40→0.78. Full cycle 26s,
// infinite, continuous linear phase — no pause at the ends. The path is
// a slow diagonal oval centred on the logo (~46% of screen height):
// the major axis runs lower-left → upper-right, horizontal travel
// −12% to +12% of screen width, vertical +7% to −7% of screen height.
export const SPLASH_DRIFT_MS = 26000;
export const SPLASH_DRIFT_GLOW_SIZE = 540;
export const SPLASH_DRIFT_GLOW_MAX_OPACITY = 0.28;
export const SPLASH_DRIFT_OPACITY_MIN = 0.4;
export const SPLASH_DRIFT_OPACITY_MAX = 0.78;
export const SPLASH_DRIFT_X_PCT = 0.12;
export const SPLASH_DRIFT_Y_PCT = 0.07;
export const SPLASH_DRIFT_CENTER_Y_PCT = 0.46;
// Major-axis direction: 135° puts the ellipse's long ends at
// lower-left and upper-right (y grows downward on screen).
export const SPLASH_DRIFT_ROTATION_RAD = (3 * Math.PI) / 4;

/**
 * Drift offset (pt) for a phase in [0, 1). A rotated ellipse:
 * phase 0 sits lower-left, phase 0.5 upper-right; the loop visits all
 * four quadrants and wraps with no jump (phase 1 === phase 0).
 * |x| stays within ±12% of width, |y| within ±7% of height.
 */
export function driftOffset(
  phase: number,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  const theta = phase * 2 * Math.PI;
  const a = screenWidth * SPLASH_DRIFT_X_PCT;
  const b = screenHeight * SPLASH_DRIFT_Y_PCT;
  const cosR = Math.cos(SPLASH_DRIFT_ROTATION_RAD);
  const sinR = Math.sin(SPLASH_DRIFT_ROTATION_RAD);
  const ex = Math.cos(theta);
  const ey = Math.sin(theta);
  // The rotated ellipse's per-axis extents exceed the ±12%/±7% bounds
  // (rotation mixes the two amplitudes), so rescale each axis to
  // exactly its bound. The path stays a diagonal oval whose major axis
  // runs lower-left → upper-right; phase 0 sits lower-left.
  const ampX = Math.hypot(a * cosR, b * sinR);
  const ampY = Math.hypot(a * sinR, b * cosR);
  const sx = a / ampX;
  const sy = b / ampY;
  return {
    x: (a * ex * cosR - b * ey * sinR) * sx,
    y: (a * ex * sinR + b * ey * cosR) * sy,
  };
}

/** Drift glow view opacity for a phase in [0, 1): 0.40 ↔ 0.78. */
export function driftOpacity(phase: number): number {
  const mid = (SPLASH_DRIFT_OPACITY_MIN + SPLASH_DRIFT_OPACITY_MAX) / 2;
  const amp = (SPLASH_DRIFT_OPACITY_MAX - SPLASH_DRIFT_OPACITY_MIN) / 2;
  return mid + amp * Math.sin(phase * 2 * Math.PI);
}

// ── Bloom ────────────────────────────────────────────────────────────────
// One radial warm bloom behind the logo, once only: 460pt, same amber,
// centre ~42–46% of screen height, scale 0.72→1.24 (stays 1.24),
// opacity 0→0.65→0 over 950ms — 380ms expand, 570ms fade.
export const SPLASH_BLOOM_SIZE = 460;
export const SPLASH_BLOOM_CENTER_Y_PCT = 0.44;
export const SPLASH_BLOOM_SCALE_START = 0.72;
export const SPLASH_BLOOM_SCALE_END = 1.24;
export const SPLASH_BLOOM_PEAK_OPACITY = 0.65;
export const SPLASH_BLOOM_MS = 950;
export const SPLASH_BLOOM_EXPAND_MS = 380;
export const SPLASH_BLOOM_FADE_MS = 570;

// ── Arrival beats ────────────────────────────────────────────────────────
export interface SplashBeat {
  /** Shared-value key prefix (logo, tagline, amber, button, footnote). */
  key: 'logo' | 'tagline' | 'amber' | 'button' | 'footnote';
  /** Delay from t=0 (ms) before the beat starts. */
  delayMs: number;
  /** Beat duration (ms). */
  durationMs: number;
  /** Starting translateY (pt); every beat settles at 0. */
  startY: number;
  /** Starting scale (1 when the beat has no scale); settles at 1. */
  startScale: number;
}

export const SPLASH_BEATS: readonly SplashBeat[] = [
  { key: 'logo', delayMs: 320, durationMs: 600, startY: 14, startScale: 0.985 },
  { key: 'tagline', delayMs: 960, durationMs: 440, startY: 8, startScale: 1 },
  { key: 'amber', delayMs: 1280, durationMs: 420, startY: 6, startScale: 1 },
  { key: 'button', delayMs: 1650, durationMs: 460, startY: 12, startScale: 0.985 },
  { key: 'footnote', delayMs: 1980, durationMs: 360, startY: 5, startScale: 1 },
];

/** Last beat ends at 1980 + 360 = 2340ms. */
export const SPLASH_TOTAL_MS = 2340;
/** The button is at rest (and becomes tappable) at 1650 + 460 = 2110ms. */
export const SPLASH_BUTTON_REST_MS = 2110;

// ── At-rest / start values ───────────────────────────────────────────────
export interface SplashValues {
  logoOpacity: number;
  logoY: number;
  logoScale: number;
  taglineOpacity: number;
  taglineY: number;
  amberOpacity: number;
  amberY: number;
  buttonOpacity: number;
  buttonY: number;
  buttonScale: number;
  footnoteOpacity: number;
  footnoteY: number;
  bloomScale: number;
  bloomOpacity: number;
}

/** Everything at rest: logo/button opacity 1, Y 0, scale 1; bloom gone. */
export function splashFinalValues(): SplashValues {
  return {
    logoOpacity: 1,
    logoY: 0,
    logoScale: 1,
    taglineOpacity: 1,
    taglineY: 0,
    amberOpacity: 1,
    amberY: 0,
    buttonOpacity: 1,
    buttonY: 0,
    buttonScale: 1,
    footnoteOpacity: 1,
    footnoteY: 0,
    bloomScale: SPLASH_BLOOM_SCALE_END,
    bloomOpacity: 0,
  };
}

/** Pre-entrance values: everything hidden / offset, bloom small. */
export function splashStartValues(): SplashValues {
  return {
    logoOpacity: 0,
    logoY: 14,
    logoScale: 0.985,
    taglineOpacity: 0,
    taglineY: 8,
    amberOpacity: 0,
    amberY: 6,
    buttonOpacity: 0,
    buttonY: 12,
    buttonScale: 0.985,
    footnoteOpacity: 0,
    footnoteY: 5,
    bloomScale: SPLASH_BLOOM_SCALE_START,
    bloomOpacity: 0,
  };
}

// ── Plan: what a mount should do ─────────────────────────────────────────
export type SplashMode = 'final' | 'entrance';

export interface SplashPlan {
  /** 'entrance' plays bloom + staggered beats; 'final' renders at rest. */
  mode: SplashMode;
  /** The ambient drift runs whenever the splash is visible (motion on). */
  driftActive: boolean;
  /** The one-time bloom runs only with the entrance. */
  bloom: boolean;
  /** ms after mount before LET'S BEGIN is tappable (0 = immediately). */
  buttonReadyDelayMs: number;
}

/**
 * Reduce Motion: no bloom, no drift, no delayed entrance — final state
 * instantly, button live at once. A return visit in the same session:
 * same — final state, no second entrance, no second bloom. Only a
 * fresh session with motion on plays the entrance (with drift).
 */
export function resolveSplashPlan(input: {
  reduceMotion: boolean;
  alreadyPlayed: boolean;
}): SplashPlan {
  if (input.reduceMotion || input.alreadyPlayed) {
    return { mode: 'final', driftActive: !input.reduceMotion, bloom: false, buttonReadyDelayMs: 0 };
  }
  return { mode: 'entrance', driftActive: true, bloom: true, buttonReadyDelayMs: SPLASH_BUTTON_REST_MS };
}

/** Delay before LET'S BEGIN is tappable (0 under Reduce Motion / replay). */
export function splashButtonReadyDelayMs(reduceMotion: boolean, alreadyPlayed: boolean): number {
  return resolveSplashPlan({ reduceMotion, alreadyPlayed }).buttonReadyDelayMs;
}

/** Whether the button may be pressed at `elapsedMs` after mount. */
export function isSplashButtonReady(
  elapsedMs: number,
  reduceMotion: boolean,
  alreadyPlayed: boolean,
): boolean {
  return elapsedMs >= splashButtonReadyDelayMs(reduceMotion, alreadyPlayed);
}

// ── One-time rule ────────────────────────────────────────────────────────
// The entrance + bloom play ONCE per session. The onboarding screen
// stays mounted while steps change, so the parent holds one session
// object in a ref and passes alreadyPlayed down; a fresh app launch
// builds a fresh session and the entrance plays again.
export interface SplashSession {
  hasPlayed(): boolean;
  markPlayed(): void;
}

export function createSplashSession(): SplashSession {
  let played = false;
  return {
    hasPlayed: () => played,
    markPlayed: () => {
      played = true;
    },
  };
}
