import DarkColors from '@/constants/darkColors';
import { resolveTypography } from '@/constants/typography';
import {
  SPLASH_BEATS,
  SPLASH_BLOOM_CENTER_Y_PCT,
  SPLASH_BLOOM_EXPAND_MS,
  SPLASH_BLOOM_FADE_MS,
  SPLASH_BLOOM_MS,
  SPLASH_BLOOM_PEAK_OPACITY,
  SPLASH_BLOOM_SCALE_END,
  SPLASH_BLOOM_SCALE_START,
  SPLASH_BLOOM_SIZE,
  SPLASH_BUTTON_REST_MS,
  SPLASH_CTA_LABEL,
  SPLASH_DRIFT_CENTER_Y_PCT,
  SPLASH_DRIFT_GLOW_MAX_OPACITY,
  SPLASH_DRIFT_GLOW_SIZE,
  SPLASH_DRIFT_MS,
  SPLASH_DRIFT_OPACITY_MAX,
  SPLASH_DRIFT_OPACITY_MIN,
  SPLASH_EASE,
  SPLASH_FADE_EASE,
  SPLASH_FOOTNOTE,
  SPLASH_TAGLINE_AMBER,
  SPLASH_TAGLINE_LEAD,
  SPLASH_TOTAL_MS,
  createSplashSession,
  driftOffset,
  driftOpacity,
  getLaunchSplashSession,
  isSplashButtonReady,
  resolveSplashPlan,
  splashButtonReadyDelayMs,
  splashEntranceCompleteDelayMs,
  splashFinalValues,
  splashStartValues,
} from '@/lib/splashMotion';

// Splash motion (GPT-6 spec, 2026-11-17). The Reanimated component
// (components/SplashMotion.tsx) applies these numbers; under Jest the
// Reanimated mock cannot step real animations, so these tests pin the
// choreography at the level the mock allows: the constants, the pure
// drift math, the plan (entrance vs final state), the one-time rule,
// the button gate, and the copy. The component wires the same values
// through withDelay/withTiming (verified by the iOS bundle check).
describe('splashMotion', () => {
  it('pins the ambient drift: one 540pt glow, 26s cycle, 0.40–0.78 opacity', () => {
    expect(SPLASH_DRIFT_MS).toBe(26000);
    expect(SPLASH_DRIFT_GLOW_SIZE).toBe(540);
    expect(SPLASH_DRIFT_GLOW_SIZE).toBeGreaterThanOrEqual(520);
    expect(SPLASH_DRIFT_GLOW_SIZE).toBeLessThanOrEqual(560);
    expect(SPLASH_DRIFT_GLOW_MAX_OPACITY).toBe(0.28);
    expect(SPLASH_DRIFT_OPACITY_MIN).toBe(0.4);
    expect(SPLASH_DRIFT_OPACITY_MAX).toBe(0.78);
    // Centred on the logo, not below the bottom edge.
    expect(SPLASH_DRIFT_CENTER_Y_PCT).toBe(0.46);
    expect(SPLASH_DRIFT_CENTER_Y_PCT).toBeLessThan(0.5);
  });

  it('drifts a continuous diagonal oval: lower-left at phase 0, upper-right at 0.5, no wrap jump', () => {
    const w = 390;
    const h = 844;
    const start = driftOffset(0, w, h);
    const half = driftOffset(0.5, w, h);
    // Phase 0 sits lower-left, phase 0.5 upper-right (y grows down).
    expect(start.x).toBeLessThan(0);
    expect(start.y).toBeGreaterThan(0);
    expect(half.x).toBeGreaterThan(0);
    expect(half.y).toBeLessThan(0);
    // The two ends are opposite corners of the same oval.
    expect(half.x).toBeCloseTo(-start.x, 6);
    expect(half.y).toBeCloseTo(-start.y, 6);
    // Wraps with no jump: phase 1 === phase 0.
    const wrap = driftOffset(1, w, h);
    expect(wrap.x).toBeCloseTo(start.x, 6);
    expect(wrap.y).toBeCloseTo(start.y, 6);
  });

  it('keeps the drift inside ±12% of width and ±7% of height, and visits every quadrant', () => {
    const w = 390;
    const h = 844;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const quadrants = new Set<string>();
    for (let i = 0; i <= 360; i += 1) {
      const { x, y } = driftOffset(i / 360, w, h);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      quadrants.add(`${x < 0 ? 'L' : 'R'}${y < 0 ? 'U' : 'D'}`);
    }
    expect(minX).toBeGreaterThanOrEqual(-0.12 * w);
    expect(maxX).toBeLessThanOrEqual(0.12 * w);
    expect(minY).toBeGreaterThanOrEqual(-0.07 * h);
    expect(maxY).toBeLessThanOrEqual(0.07 * h);
    // Real travel in both axes — not a flat line.
    expect(maxX - minX).toBeGreaterThan(0.1 * w);
    expect(maxY - minY).toBeGreaterThan(0.05 * h);
    // The oval passes through all four quadrants around the logo.
    expect(quadrants.has('LU')).toBe(true);
    expect(quadrants.has('RU')).toBe(true);
    expect(quadrants.has('LD')).toBe(true);
    expect(quadrants.has('RD')).toBe(true);
  });

  it('moves continuously: a small phase step never jumps the glow', () => {
    const w = 390;
    const h = 844;
    let prev = driftOffset(0, w, h);
    for (let i = 1; i <= 360; i += 1) {
      const next = driftOffset(i / 360, w, h);
      expect(Math.abs(next.x - prev.x)).toBeLessThan(2);
      expect(Math.abs(next.y - prev.y)).toBeLessThan(2);
      prev = next;
    }
  });

  it('oscillates the drift opacity between 0.40 and 0.78, hitting both ends', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 360; i += 1) {
      const o = driftOpacity(i / 360);
      min = Math.min(min, o);
      max = Math.max(max, o);
    }
    expect(min).toBeCloseTo(SPLASH_DRIFT_OPACITY_MIN, 6);
    expect(max).toBeCloseTo(SPLASH_DRIFT_OPACITY_MAX, 6);
    expect(driftOpacity(0)).toBeCloseTo(0.59, 6);
  });

  it('pins the arrival beats: logo 320–920, tagline 960–1400, amber 1280–1700, button 1650–2110, footnote 1980–2340', () => {
    expect(SPLASH_BEATS).toHaveLength(5);
    const byKey = Object.fromEntries(SPLASH_BEATS.map((b) => [b.key, b]));
    expect(byKey.logo).toEqual({ key: 'logo', delayMs: 320, durationMs: 600, startY: 14, startScale: 0.985 });
    expect(byKey.tagline).toEqual({ key: 'tagline', delayMs: 960, durationMs: 440, startY: 8, startScale: 1 });
    expect(byKey.amber).toEqual({ key: 'amber', delayMs: 1280, durationMs: 420, startY: 6, startScale: 1 });
    expect(byKey.button).toEqual({ key: 'button', delayMs: 1650, durationMs: 460, startY: 12, startScale: 0.985 });
    expect(byKey.footnote).toEqual({ key: 'footnote', delayMs: 1980, durationMs: 360, startY: 5, startScale: 1 });
    // Beats overlap in a cascade, never run past the 2.35s total.
    for (const beat of SPLASH_BEATS) {
      expect(beat.delayMs + beat.durationMs).toBeLessThanOrEqual(SPLASH_TOTAL_MS);
    }
    expect(SPLASH_TOTAL_MS).toBe(2340);
    // The button beat ends exactly when the button becomes tappable.
    expect(byKey.button.delayMs + byKey.button.durationMs).toBe(SPLASH_BUTTON_REST_MS);
    expect(SPLASH_BUTTON_REST_MS).toBe(2110);
    // No beat starts from 0 opacity with a spring scale — scale beats
    // settle from 0.985, never below, and never overshoot past 1.
    for (const beat of SPLASH_BEATS) {
      expect(beat.startScale).toBeGreaterThanOrEqual(0.985);
      expect(beat.startScale).toBeLessThanOrEqual(1);
    }
  });

  it('uses one easing everywhere: cubic-bezier(0.22, 1, 0.36, 1); bloom fades on (0.4, 0, 1, 1)', () => {
    expect([...SPLASH_EASE]).toEqual([0.22, 1, 0.36, 1]);
    expect([...SPLASH_FADE_EASE]).toEqual([0.4, 0, 1, 1]);
  });

  it('pins the bloom: 460pt, scale 0.72→1.24, opacity 0→0.65→0 over 950ms (380 expand + 570 fade)', () => {
    expect(SPLASH_BLOOM_SIZE).toBe(460);
    expect(SPLASH_BLOOM_SCALE_START).toBe(0.72);
    expect(SPLASH_BLOOM_SCALE_END).toBe(1.24);
    expect(SPLASH_BLOOM_PEAK_OPACITY).toBe(0.65);
    expect(SPLASH_BLOOM_EXPAND_MS).toBe(380);
    expect(SPLASH_BLOOM_FADE_MS).toBe(570);
    expect(SPLASH_BLOOM_EXPAND_MS + SPLASH_BLOOM_FADE_MS).toBe(SPLASH_BLOOM_MS);
    expect(SPLASH_BLOOM_MS).toBe(950);
    // Centre behind the logo, 42–46% of screen height.
    expect(SPLASH_BLOOM_CENTER_Y_PCT).toBeGreaterThanOrEqual(0.42);
    expect(SPLASH_BLOOM_CENTER_Y_PCT).toBeLessThanOrEqual(0.46);
    // The bloom starts at t=0, before the logo arrives at 320ms.
    expect(SPLASH_BLOOM_EXPAND_MS).toBeGreaterThan(320);
  });

  it('renders final state instantly under Reduce Motion: no bloom, no drift, button live at once', () => {
    const plan = resolveSplashPlan({ reduceMotion: true, alreadyPlayed: false });
    expect(plan).toEqual({ mode: 'final', driftActive: false, bloom: false, buttonReadyDelayMs: 0 });
    expect(splashButtonReadyDelayMs(true, false)).toBe(0);
    expect(isSplashButtonReady(0, true, false)).toBe(true);
    const final = splashFinalValues();
    expect(final.logoOpacity).toBe(1);
    expect(final.logoY).toBe(0);
    expect(final.logoScale).toBe(1);
    expect(final.taglineOpacity).toBe(1);
    expect(final.taglineY).toBe(0);
    expect(final.amberOpacity).toBe(1);
    expect(final.amberY).toBe(0);
    expect(final.buttonOpacity).toBe(1);
    expect(final.buttonY).toBe(0);
    expect(final.buttonScale).toBe(1);
    expect(final.footnoteOpacity).toBe(1);
    expect(final.footnoteY).toBe(0);
    // The bloom is gone at rest (scale stays 1.24, opacity 0).
    expect(final.bloomScale).toBe(SPLASH_BLOOM_SCALE_END);
    expect(final.bloomOpacity).toBe(0);
  });

  it('plays the entrance + bloom once per session; a return visit renders final state with no re-play', () => {
    const session = createSplashSession();
    expect(session.hasPlayed()).toBe(false);
    // First mount: entrance + bloom + drift, button locked until 2110ms.
    expect(resolveSplashPlan({ reduceMotion: false, alreadyPlayed: session.hasPlayed() })).toEqual({
      mode: 'entrance',
      driftActive: true,
      bloom: true,
      buttonReadyDelayMs: SPLASH_BUTTON_REST_MS,
    });
    session.markPlayed();
    expect(session.hasPlayed()).toBe(true);
    // Marking twice is a no-op, not a second play.
    session.markPlayed();
    const plan = resolveSplashPlan({ reduceMotion: false, alreadyPlayed: session.hasPlayed() });
    expect(plan.mode).toBe('final');
    expect(plan.bloom).toBe(false);
    expect(plan.buttonReadyDelayMs).toBe(0);
    // The drift still runs on the return visit — only the entrance
    // and the bloom are one-time.
    expect(plan.driftActive).toBe(true);
    // A fresh session plays again.
    expect(createSplashSession().hasPlayed()).toBe(false);
  });

  it('starts the entrance hidden and offset, per beat', () => {
    const start = splashStartValues();
    expect(start.logoOpacity).toBe(0);
    expect(start.logoY).toBe(14);
    expect(start.logoScale).toBe(0.985);
    expect(start.taglineOpacity).toBe(0);
    expect(start.taglineY).toBe(8);
    expect(start.amberOpacity).toBe(0);
    expect(start.amberY).toBe(6);
    expect(start.buttonOpacity).toBe(0);
    expect(start.buttonY).toBe(12);
    expect(start.buttonScale).toBe(0.985);
    expect(start.footnoteOpacity).toBe(0);
    expect(start.footnoteY).toBe(5);
    expect(start.bloomScale).toBe(SPLASH_BLOOM_SCALE_START);
    expect(start.bloomOpacity).toBe(0);
  });

  it('keeps LET’S BEGIN untappable until its beat finishes at 2110ms', () => {
    expect(splashButtonReadyDelayMs(false, false)).toBe(SPLASH_BUTTON_REST_MS);
    expect(isSplashButtonReady(0, false, false)).toBe(false);
    expect(isSplashButtonReady(1649, false, false)).toBe(false);
    expect(isSplashButtonReady(2109, false, false)).toBe(false);
    expect(isSplashButtonReady(2110, false, false)).toBe(true);
    expect(isSplashButtonReady(5000, false, false)).toBe(true);
    // Return visits and Reduce Motion: live immediately.
    expect(isSplashButtonReady(0, false, true)).toBe(true);
    expect(isSplashButtonReady(0, true, false)).toBe(true);
  });

  it('keeps the splash copy unchanged', () => {
    expect(SPLASH_TAGLINE_LEAD).toBe('A simple 30-day guide to a real daily prayer life, just');
    expect(SPLASH_TAGLINE_AMBER).toBe('three honest minutes a day.');
    expect(SPLASH_FOOTNOTE).toBe('No perfect words needed.');
    expect(SPLASH_CTA_LABEL).toBe("LET'S BEGIN");
    // The two tagline halves join back into the original sentence.
    expect(`${SPLASH_TAGLINE_LEAD} ${SPLASH_TAGLINE_AMBER}`).toBe(
      'A simple 30-day guide to a real daily prayer life, just three honest minutes a day.',
    );
  });

  it('shares one launch session per JS runtime; a fresh createSplashSession is independent', () => {
    const first = getLaunchSplashSession();
    const second = getLaunchSplashSession();
    // Same instance across calls — the launch splash and the
    // onboarding splash mark the same session played.
    expect(second).toBe(first);
    expect(first.hasPlayed()).toBe(false);
    first.markPlayed();
    expect(second.hasPlayed()).toBe(true);
    // A fresh session from the factory is independent: marking the
    // singleton must not leak into it (and vice versa).
    const independent = createSplashSession();
    expect(independent.hasPlayed()).toBe(false);
    independent.markPlayed();
    expect(independent.hasPlayed()).toBe(true);
    // NOTE: the singleton stays played for the rest of this Jest
    // module registry (one per JS runtime, like a cold launch) — no
    // test below may assume it starts unplayed.
    expect(getLaunchSplashSession().hasPlayed()).toBe(true);
  });

  it('fires onEntranceComplete at the last beat (2340ms) in entrance mode, immediately otherwise', () => {
    // Entrance mode: the timer runs SPLASH_TOTAL_MS from entrance
    // start — the last beat (footnote 1980–2340) has just ended.
    expect(splashEntranceCompleteDelayMs(false, false)).toBe(SPLASH_TOTAL_MS);
    expect(splashEntranceCompleteDelayMs(false, false)).toBe(2340);
    // Final / Reduce Motion mode: the entrance is already done, so
    // the callback fires immediately (0).
    expect(splashEntranceCompleteDelayMs(true, false)).toBe(0);
    expect(splashEntranceCompleteDelayMs(false, true)).toBe(0);
    expect(splashEntranceCompleteDelayMs(true, true)).toBe(0);
  });

  it('launch variant renders identically for a default user: static DarkColors + unscaled tokens', () => {
    // The launch variant (components/SplashMotion.tsx, variant="launch")
    // renders outside AppProvider, so it uses DarkColors + the
    // unscaled TYPOGRAPHY tokens directly instead of the hooks. For a
    // default user these resolve to the same values: the fireside
    // themePreference returns the 'default' theme, whose override is
    // null, so useColors() returns DarkColors verbatim; normal text
    // takes the tokens unscaled. Pin the three colors and the body
    // size/leading the splash actually reads, so a token change that
    // would split the two variants fails loudly here first.
    expect(DarkColors.textSecondary).toBe('rgba(244,237,224,0.8)');
    expect(DarkColors.accentDark).toBe('#E0A868');
    expect(DarkColors.iconMuted).toBe('rgba(216,203,184,0.55)');
    const { size, leading } = resolveTypography(false);
    expect(size.body).toBe(17);
    expect(leading.body).toBe(25);
    // FLAGGED EXCEPTIONS (not covered by this pin — device-verified):
    // a seasonal themePreference re-tints textSecondary / accentDark /
    // iconMuted through the hook, so the launch overlay stays fireside
    // amber while onboarding follows the season; Larger Text scales
    // the hook's values ×1.18 (20.1/29.5) while the static tokens
    // stay 17/25.
    const { size: largeSize, leading: largeLeading } = resolveTypography(true);
    expect(largeSize.body).toBe(20.1);
    expect(largeLeading.body).toBe(29.5);
  });
});
