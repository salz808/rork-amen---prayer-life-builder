import DarkColors from '@/constants/darkColors';
import { Fonts } from '@/constants/fonts';
import { resolveTypography } from '@/constants/typography';
import {
  SPLASH_BACKDROP_COLORS,
  SPLASH_SPEC_GLOWS,
  SPLASH_STYLE_COLORS,
  SPLASH_STYLE_TYPOGRAPHY,
  SPLASH_VEIL_BOTTOM,
  SPLASH_VEIL_TOP,
  splashSharedStyles,
} from '@/lib/splashSpec';
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
  resolveTextBeatGate,
  splashButtonReadyDelayMs,
  splashEntranceCompleteDelayMs,
  splashFinalValues,
  splashInitialValues,
  splashStartValues,
} from '@/lib/splashMotion';

// Splash motion (GPT-6 spec, 2026-11-17). The Reanimated component
// (components/SplashMotion.tsx) applies these numbers; under Jest the
// Reanimated mock cannot step real animations, so these tests pin the
// choreography at the level the mock allows: the constants, the pure
// drift math, the plan (entrance vs final state), the one-time rule,
// the button gate, the copy, and the font gate
// (resolveTextBeatGate — the text-beat delays for fonts landing
// late). The component wires the same values through
// withDelay/withTiming (verified by the iOS bundle check).
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

  it('launch variant renders identically for a default user: static DarkColors + unscaled tokens', () => {    // The launch variant (components/SplashMotion.tsx, variant="launch")
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
    // CLOSED EXCEPTIONS (2026-11-17, Worker B — layout parity): the
    // onboarding variant used to resolve the same three colors / body
    // size through the hooks, which split for seasonal-theme users
    // (re-tinted) and Larger Text (×1.18 → 20.1/29.5). Both variants
    // now consume the shared spec (lib/splashSpec.ts) with these
    // static values, so the splash cannot split — the 'launch /
    // onboarding parity' block below pins the spec itself. Larger
    // Text still scales every OTHER onboarding step; only the splash
    // step is fixed, so it matches the launch overlay exactly.
    const { size: largeSize, leading: largeLeading } = resolveTypography(true);
    expect(largeSize.body).toBe(20.1);
    expect(largeLeading.body).toBe(29.5);
  });

  // Font gate (launch splash) — components/SplashMotion.tsx holds the
  // TEXT beats (tagline / amber / footnote, Cormorant italic) until
  // the fontsReady prop is true, so no text ever renders in the
  // system fallback font during the animated entrance. The gating
  // decisions live in resolveTextBeatGate (lib/splashMotion.ts): the
  // component only calls it once fonts are ready — at mount on the
  // fast path, when fontsReady flips true on the slow path — and
  // applies its delays through withDelay/withTiming. These tests pin
  // that function; the component's two call sites are guarded by
  // fontsReady (fast path: fontsReadyRef.current; slow path: an
  // early `if (!fontsReady) return`), and while ungated the beats
  // stay at their start values (opacity 0 — pinned by 'starts the
  // entrance hidden and offset' above).
  describe('font gate — text beats wait for fonts', () => {
    it('fast path: fonts ready at mount keeps today’s schedule exactly', () => {
      expect(resolveTextBeatGate(0)).toEqual({
        taglineDelayMs: 960,
        amberDelayMs: 1280,
        footnoteDelayMs: 1980,
        entranceCompleteAtMs: SPLASH_TOTAL_MS,
      });
      expect(SPLASH_TOTAL_MS).toBe(2340);
    });

    it('fonts landing before the tagline slot keep the original absolute schedule', () => {
      // Fonts at 500ms: the tagline still starts at 960ms after
      // entrance start (460ms from now), amber at 1280, footnote at
      // 1980 — nothing starts early just because fonts landed early.
      const gate = resolveTextBeatGate(500);
      expect(gate.taglineDelayMs).toBe(460);
      expect(gate.amberDelayMs).toBe(780);
      expect(gate.footnoteDelayMs).toBe(1480);
      expect(gate.entranceCompleteAtMs).toBe(SPLASH_TOTAL_MS);
    });

    it('fonts landing after a beat’s scheduled time restart the cascade with its relative stagger', () => {
      // Fonts at 1500ms — past the tagline (960) and amber (1280)
      // slots: tagline now, amber +320ms, footnote +1020ms.
      const gate = resolveTextBeatGate(1500);
      expect(gate.taglineDelayMs).toBe(0);
      expect(gate.amberDelayMs).toBe(320);
      expect(gate.footnoteDelayMs).toBe(1020);
      // The stagger is preserved, not crushed: amber 320ms after the
      // tagline, footnote 1020ms after it.
      expect(gate.amberDelayMs - gate.taglineDelayMs).toBe(320);
      expect(gate.footnoteDelayMs - gate.taglineDelayMs).toBe(1020);
      // Completion slips by the overrun: footnote ends 1500+1020+360.
      expect(gate.entranceCompleteAtMs).toBe(2880);
    });

    it('fonts landing exactly at the tagline slot start the cascade at once, on time', () => {
      const gate = resolveTextBeatGate(960);
      expect(gate.taglineDelayMs).toBe(0);
      expect(gate.amberDelayMs).toBe(320);
      expect(gate.footnoteDelayMs).toBe(1020);
      expect(gate.entranceCompleteAtMs).toBe(SPLASH_TOTAL_MS);
    });

    it('waiting for fonts never pulls a text beat earlier than its scheduled slot', () => {
      // The tagline's absolute start is max(960, fontsReadyAtMs) for
      // every landing time — the gate only ever delays, never
      // advances. While fontsReady is false the component holds the
      // beats at their start values (opacity 0), so no text renders
      // in the fallback font before fonts land.
      for (let at = 0; at <= 4000; at += 37) {
        const gate = resolveTextBeatGate(at);
        expect(gate.taglineDelayMs + at).toBeGreaterThanOrEqual(960);
        expect(gate.amberDelayMs + at).toBeGreaterThanOrEqual(1280);
        expect(gate.footnoteDelayMs + at).toBeGreaterThanOrEqual(1980);
        expect(gate.taglineDelayMs).toBeGreaterThanOrEqual(0);
        expect(gate.amberDelayMs).toBeGreaterThanOrEqual(0);
        expect(gate.footnoteDelayMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('the gate moves delays only: durations, easing and the logo / bloom / drift are untouched', () => {
      // Durations/easing still come from SPLASH_BEATS / SPLASH_EASE —
      // the gate returns delays only, so it cannot change them.
      const byKey = Object.fromEntries(SPLASH_BEATS.map((b) => [b.key, b]));
      expect(byKey.tagline.durationMs).toBe(440);
      expect(byKey.amber.durationMs).toBe(420);
      expect(byKey.footnote.durationMs).toBe(360);
      expect([...SPLASH_EASE]).toEqual([0.22, 1, 0.36, 1]);
      // Logo / bloom / drift have no gate input at all: their timings
      // are pinned here so a gate edit cannot move them.
      expect(byKey.logo).toEqual({ key: 'logo', delayMs: 320, durationMs: 600, startY: 14, startScale: 0.985 });
      expect(SPLASH_BLOOM_MS).toBe(950);
      expect(SPLASH_DRIFT_MS).toBe(26000);
      // The gate's completion never precedes the logo beat's end.
      expect(resolveTextBeatGate(0).entranceCompleteAtMs).toBeGreaterThan(320 + 600);
    });

    it('worst case: the 3500ms font timeout still runs the cascade, just late', () => {
      const gate = resolveTextBeatGate(3500);
      expect(gate.taglineDelayMs).toBe(0);
      expect(gate.amberDelayMs).toBe(320);
      expect(gate.footnoteDelayMs).toBe(1020);
      expect(gate.entranceCompleteAtMs).toBe(4880);
    });
  });

  // Font gate, hole 2 (2026-11-17, Worker B) — the RETURN-VISIT /
  // Reduce Motion path. When alreadyPlayed is true the entrance
  // effect takes the final branch: the old code put the text at rest
  // at once, so a reload whose session singleton survived (Expo Go
  // keeps the JS runtime alive) showed the tagline in the fallback
  // sans while the new bundle's fonts were still loading. The fix
  // lives in splashInitialValues (first paint) + the component's
  // final-mode branch and font-gate effect (release on fontsReady):
  // the text stays at its start values until fonts land, then snaps
  // to rest. These tests pin the pure half — the mount values; the
  // component applies them to the shared values and releases them
  // through the same fontsReady prop (verified by the iOS bundle
  // check for the textFinalPendingRef marker).
  describe('font gate — final mode (return visit) text waits for fonts', () => {
    it('final mode + fonts ready at mount renders at rest, exactly as before (no visible change)', () => {
      const initial = splashInitialValues({ reduceMotion: false, alreadyPlayed: true, fontsReady: true });
      expect(initial).toEqual(splashFinalValues());
    });

    it('final mode + fonts NOT ready holds the text at its start values while non-text sits at rest', () => {
      const initial = splashInitialValues({ reduceMotion: false, alreadyPlayed: true, fontsReady: false });
      // Text beats held: opacity 0, still offset — nothing renders in
      // the fallback font.
      expect(initial.taglineOpacity).toBe(0);
      expect(initial.taglineY).toBe(8);
      expect(initial.amberOpacity).toBe(0);
      expect(initial.amberY).toBe(6);
      expect(initial.footnoteOpacity).toBe(0);
      expect(initial.footnoteY).toBe(5);
      // Non-text elements are font-free and sit at rest at once.
      expect(initial.logoOpacity).toBe(1);
      expect(initial.logoY).toBe(0);
      expect(initial.logoScale).toBe(1);
      expect(initial.buttonOpacity).toBe(1);
      expect(initial.buttonY).toBe(0);
      expect(initial.buttonScale).toBe(1);
      expect(initial.bloomScale).toBe(SPLASH_BLOOM_SCALE_END);
      expect(initial.bloomOpacity).toBe(0);
    });

    it('Reduce Motion + fonts NOT ready holds the text too; non-text is instant-final', () => {
      const initial = splashInitialValues({ reduceMotion: true, alreadyPlayed: false, fontsReady: false });
      expect(initial.taglineOpacity).toBe(0);
      expect(initial.amberOpacity).toBe(0);
      expect(initial.footnoteOpacity).toBe(0);
      expect(initial.logoOpacity).toBe(1);
      expect(initial.logoY).toBe(0);
      // Reduce Motion + fonts ready: plain final state, as before.
      expect(splashInitialValues({ reduceMotion: true, alreadyPlayed: false, fontsReady: true })).toEqual(
        splashFinalValues(),
      );
    });

    it('entrance mode is unchanged: hidden + offset at mount whether fonts are ready or not', () => {
      expect(
        splashInitialValues({ reduceMotion: false, alreadyPlayed: false, fontsReady: true }),
      ).toEqual(splashStartValues());
      expect(
        splashInitialValues({ reduceMotion: false, alreadyPlayed: false, fontsReady: false }),
      ).toEqual(splashStartValues());
    });

    it('the held text is exactly the start values — no partial opacity, no half-offset', () => {
      const initial = splashInitialValues({ reduceMotion: false, alreadyPlayed: true, fontsReady: false });
      const start = splashStartValues();
      expect(initial.taglineOpacity).toBe(start.taglineOpacity);
      expect(initial.taglineY).toBe(start.taglineY);
      expect(initial.amberOpacity).toBe(start.amberOpacity);
      expect(initial.amberY).toBe(start.amberY);
      expect(initial.footnoteOpacity).toBe(start.footnoteOpacity);
      expect(initial.footnoteY).toBe(start.footnoteY);
    });
  });

  // Launch / onboarding parity (2026-11-17, Worker B — Justin's
  // "100% the same" requirement). The two splashes used to resolve
  // their layout three different ways — themed hooks vs static
  // tokens, SafeAreaView vs full-screen overlay, veils vs no veils.
  // Both variants now consume ONE shared spec (lib/splashSpec.ts)
  // and ONE shared backdrop (components/SplashBackdrop.tsx); the
  // onboarding splash step renders full-screen outside the safe
  // area, exactly like BootScreen. Jest cannot render the component
  // (node env, Reanimated mock renders nothing), so parity is pinned
  // at the level that IS testable: the spec values both variants
  // consume. A spec change that would split the variants fails here
  // first; the component's single consumption is verified by the iOS
  // bundle check (one splashSharedStyles call site, no useColors /
  // useTypography left in SplashMotion).
  describe('launch / onboarding parity — one shared spec', () => {
    it('the spec resolves the same colors the hooks return for a default user', () => {
      expect(SPLASH_STYLE_COLORS.textSecondary).toBe(DarkColors.textSecondary);
      expect(SPLASH_STYLE_COLORS.accentDark).toBe(DarkColors.accentDark);
      expect(SPLASH_STYLE_COLORS.iconMuted).toBe(DarkColors.iconMuted);
      expect(SPLASH_STYLE_COLORS.textSecondary).toBe('rgba(244,237,224,0.8)');
      expect(SPLASH_STYLE_COLORS.accentDark).toBe('#E0A868');
      expect(SPLASH_STYLE_COLORS.iconMuted).toBe('rgba(216,203,184,0.55)');
    });

    it('the spec typography is the unscaled token set (body 17/25)', () => {
      expect(SPLASH_STYLE_TYPOGRAPHY.size.body).toBe(17);
      expect(SPLASH_STYLE_TYPOGRAPHY.leading.body).toBe(25);
      expect(SPLASH_STYLE_TYPOGRAPHY).toEqual(resolveTypography(false));
    });

    it('logo: same size and position — 70% of min(width-56, 320), 95pt tall, 28pt below it', () => {
      const styles = splashSharedStyles(390, 844);
      expect(styles.splashLogo.width).toBe(224);
      expect(styles.splashLogo.height).toBe(95);
      expect(styles.splashBrand.marginBottom).toBe(28);
      expect(styles.splashBrand.alignItems).toBe('center');
      // Narrow phone: the 56pt inset binds, not the 320 cap.
      expect(splashSharedStyles(360, 780).splashLogo.width).toBeCloseTo(212.8, 6);
      // Wide phone: the 320 cap binds.
      expect(splashSharedStyles(430, 932).splashLogo.width).toBe(224);
    });

    it('tagline + amber + footnote: same face, size, leading, margins, padding, wrapping', () => {
      const styles = splashSharedStyles(390, 844);
      expect(styles.splashTagWrap.marginBottom).toBe(64);
      expect(styles.splashTagWrap.paddingHorizontal).toBe(32);
      expect(styles.splashTag.fontFamily).toBe(Fonts.italic);
      expect(styles.splashTag.fontSize).toBe(17);
      expect(styles.splashTag.lineHeight).toBe(25);
      expect(styles.splashTag.textAlign).toBe('center');
      expect(styles.splashTag.color).toBe('rgba(244,237,224,0.8)');
      // The amber phrase is the same tag style, re-tinted — not a
      // second type scale.
      expect(styles.accentItalic.fontFamily).toBe(Fonts.italic);
      expect(styles.accentItalic.color).toBe('#E0A868');
      // The footnote shares the tag's face/size/leading exactly.
      expect(styles.splashSub.fontFamily).toBe(Fonts.italic);
      expect(styles.splashSub.fontSize).toBe(17);
      expect(styles.splashSub.lineHeight).toBe(25);
      expect(styles.splashSub.textAlign).toBe('center');
      expect(styles.splashSub.color).toBe('rgba(216,203,184,0.55)');
    });

    it('bottom dock: absolute, 64pt from the bottom, 32pt sides, 16pt gap — the button grows upward', () => {
      const styles = splashSharedStyles(390, 844);
      expect(styles.splashActions.position).toBe('absolute');
      expect(styles.splashActions.left).toBe(32);
      expect(styles.splashActions.right).toBe(32);
      expect(styles.splashActions.bottom).toBe(64);
      expect(styles.splashActions.gap).toBe(16);
      // No `top`: the dock is bottom-anchored, so adding the LET'S
      // BEGIN button (onboarding only) extends it upward and the
      // footnote — the last child — stays at the same 64pt from the
      // bottom in both variants. The button displaces nothing else.
      expect('top' in styles.splashActions).toBe(false);
      // The button label keeps the old secondaryButtonText face.
      expect(styles.splashButtonText.fontFamily).toBe(Fonts.titleMedium);
    });

    it('glows: same sizes and positions on both variants (390×844)', () => {
      const styles = splashSharedStyles(390, 844);
      expect(SPLASH_SPEC_GLOWS.driftSize).toBe(540);
      expect(SPLASH_SPEC_GLOWS.driftMaxOpacity).toBe(0.28);
      expect(SPLASH_SPEC_GLOWS.bloomSize).toBe(460);
      // Drift glow centred at 46% height: top 388-270, left 195-270.
      expect(styles.driftGlowWrap.top).toBe(118);
      expect(styles.driftGlowWrap.left).toBe(-75);
      // Bloom centred at 44% height: top 371-230, left 195-230.
      expect(styles.bloomWrap.top).toBe(141);
      expect(styles.bloomWrap.left).toBe(-35);
      // Static centre glow (256pt @ 36%) and top glow (288pt).
      expect(styles.spGlowCenterWrap.top).toBe(176);
      expect(styles.spGlowCenterWrap.left).toBe(67);
      expect(styles.spGlowTopWrap.top).toBe(-96);
      expect(styles.spGlowTopWrap.left).toBe(51);
    });

    it('backdrop: same gradient triple and same veils on both screens', () => {
      expect([...SPLASH_BACKDROP_COLORS]).toEqual(['#090603', '#120A05', '#090603']);
      expect(SPLASH_BACKDROP_COLORS[0]).toBe(DarkColors.bgGradient1);
      expect(SPLASH_BACKDROP_COLORS[1]).toBe(DarkColors.bgGradient2);
      expect(SPLASH_BACKDROP_COLORS[2]).toBe(DarkColors.bgGradient3);
      // Full-screen veil, 2% warm brown.
      expect(SPLASH_VEIL_TOP.position).toBe('absolute');
      expect(SPLASH_VEIL_TOP.left).toBe(0);
      expect(SPLASH_VEIL_TOP.right).toBe(0);
      expect(SPLASH_VEIL_TOP.top).toBe(0);
      expect(SPLASH_VEIL_TOP.bottom).toBe(0);
      expect(SPLASH_VEIL_TOP.backgroundColor).toBe('rgba(160,100,48,0.02)');
      expect(SPLASH_VEIL_TOP.backgroundColor).toBe(DarkColors.ambientVeil2);
      // Bottom-right veil: 240pt circle, centre off the corner, 6% amber.
      expect(SPLASH_VEIL_BOTTOM.right).toBe(-64);
      expect(SPLASH_VEIL_BOTTOM.bottom).toBe(-80);
      expect(SPLASH_VEIL_BOTTOM.width).toBe(240);
      expect(SPLASH_VEIL_BOTTOM.height).toBe(240);
      expect(SPLASH_VEIL_BOTTOM.borderRadius).toBe(120);
      expect(SPLASH_VEIL_BOTTOM.backgroundColor).toBe('rgba(228,167,103,0.06)');
      expect(SPLASH_VEIL_BOTTOM.backgroundColor).toBe(DarkColors.ambientVeil1);
    });

    it('the spec is deterministic: same screen size, same styles — no per-variant input exists', () => {
      expect(splashSharedStyles(390, 844)).toEqual(splashSharedStyles(390, 844));
      expect(splashSharedStyles(390, 844)).not.toEqual(splashSharedStyles(360, 780));
    });
  });
});
