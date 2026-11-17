// SplashMotion — the onboarding splash's Reanimated motion layer
// (GPT-6 spec, 2026-11-17). Owns the splash visuals only: one ambient
// drifting glow, one one-time bloom, and the sequenced arrival beats.
// Onboarding (app/onboarding.tsx) keeps the step logic and renders
// this component for the splash step; every other step still uses the
// existing RN Animated API — Reanimated lives only here.
//
// Motion summary:
//   Ambient — ONE 540pt amber glow drifting a slow diagonal oval
//     (26s cycle, linear phase, no pause at the ends), view opacity
//     0.40↔0.78, centre ~46% of screen height. Runs while the splash
//     is visible; cancelled on leaving / unmount / Reduce Motion.
//     BackgroundGradient, the static centre/top glows (0.08) and the
//     ambient veils are untouched (parent renders the gradient/veils).
//   Bloom — one 460pt warm bloom behind the logo, once per session:
//     scale 0.72→1.24 over 380ms, opacity 0→0.65→0 over 950ms
//     (380ms expand, 570ms fade). Starts at t=0 so light is opening
//     when the logo arrives at 320ms. Scale and opacity are
//     INDEPENDENT shared values.
//   Arrival — ~2.35s, every beat cubic-bezier(0.22, 1, 0.36, 1), no
//     spring/overshoot: logo 320–920, tagline 960–1400, amber phrase
//     1280–1700, LET'S BEGIN 1650–2110, footnote 1980–2340.
//   One-time rule — bloom + entrance play once per session. The parent
//     holds a SplashSession in a ref (the screen stays mounted while
//     steps change) and passes alreadyPlayed; a return visit renders
//     final state with no re-play. A fresh launch is a new session.
//   Reduce Motion — no bloom, no drift, no staggered entrance:
//     everything at final state instantly, button live at once.
//     Toggling the OS setting while visible cancels the loops.
//   Button gating — LET'S BEGIN is not tappable before its beat
//     finishes (2110ms): pointerEvents none on its wrapper AND the
//     onPress guard. (GlowButton's own `disabled` is NOT used — it
//     dims the button to 0.5 opacity, which would survive the entrance.)
//   No divider — the 48pt amber rule is baked into the logo image
//     itself; a separate element would double the line.
//   Launch variant — the same motion, rendered on every cold launch
//     from app/_layout.tsx OUTSIDE AppProvider: no LET'S BEGIN button,
//     no button gating, and onEntranceComplete fires once when the
//     entrance finishes (SPLASH_TOTAL_MS, or later when fonts land
//     late — see the font gate below) or immediately in final /
//     Reduce Motion mode. It must NOT call useColors()/useTypography()
//     (both require AppProvider); it uses DarkColors + the unscaled
//     TYPOGRAPHY tokens directly, which resolve to the same values the
//     hooks return for a default (fireside, normal-text) user —
//     __tests__/splashMotion.test.ts pins those values. Seasonal-theme
//     users and Larger Text are the flagged exceptions: the hook
//     scales type ×1.18, the static tokens do not, and a seasonal
//     theme re-tints textSecondary / accentDark / iconMuted.
//   Font gate (launch variant) — the entrance starts at mount, NOT
//     gated on appReady, but the TEXT beats (tagline / amber /
//     footnote — Cormorant italic) wait for the fontsReady prop
//     (appReady in _layout.tsx): while it is false they stay at
//     their start values (opacity 0), so no text ever renders in the
//     system fallback font. When it flips true, the beats run with
//     their relative stagger from then (lib/splashMotion.ts
//     resolveTextBeatGate); if fonts were already ready at mount the
//     schedule is exactly today's. The logo (image), bloom, drift
//     and static glows start at mount regardless. In final mode
//     (alreadyPlayed / Reduce Motion) text renders at rest at once —
//     the gate never blanks or hides it.
//// Jest note: react-native-reanimated resolves to the hand-written
// mock (expo/__mocks__/react-native-reanimated.js) — shared values
// mutate, builders return their target instantly, useAnimatedStyle
// evaluates once. Never import react-native-worklets here.

import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import GlowButton from '@/components/GlowButton';
import RadialGlow from '@/components/RadialGlow';
import DarkColors from '@/constants/darkColors';
import { Fonts } from '@/constants/fonts';
import { resolveTypography } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import {
  SPLASH_BEATS,
  SPLASH_BLOOM_CENTER_Y_PCT,
  SPLASH_BLOOM_EXPAND_MS,
  SPLASH_BLOOM_FADE_MS,
  SPLASH_BLOOM_PEAK_OPACITY,
  SPLASH_BLOOM_SCALE_END,
  SPLASH_BLOOM_SIZE,
  SPLASH_BUTTON_REST_MS,
  SPLASH_CTA_LABEL,
  SPLASH_DRIFT_CENTER_Y_PCT,
  SPLASH_DRIFT_GLOW_MAX_OPACITY,
  SPLASH_DRIFT_GLOW_SIZE,
  SPLASH_DRIFT_MS,
  SPLASH_EASE,
  SPLASH_FADE_EASE,
  SPLASH_FOOTNOTE,
  SPLASH_TAGLINE_AMBER,
  SPLASH_TAGLINE_LEAD,
  resolveSplashPlan,
  resolveTextBeatGate,
  splashFinalValues,
  splashStartValues,
} from '@/lib/splashMotion';
import type { SplashValues } from '@/lib/splashMotion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The one entrance easing, and the bloom-fade easing, as Reanimated
// easings. No spring/overshoot anywhere in this file.
const ENTER_EASE = Easing.bezier(...SPLASH_EASE);
const BLOOM_FADE_EASE = Easing.bezier(...SPLASH_FADE_EASE);

export type SplashMotionVariant = 'onboarding' | 'launch';

interface SplashMotionProps {
  reduceMotion: boolean;
  /** True once the entrance + bloom have played this session. */
  alreadyPlayed: boolean;
  /** Called when the entrance starts (parent marks the session played). */
  onEntrancePlayed: () => void;
  /** LET'S BEGIN — advances to the name step (onboarding variant only). */
  onBegin?: () => void;
  /** 'onboarding' (default): full splash with the button. 'launch':
      the cold-launch overlay — same motion, no button, no gating. */
  variant?: SplashMotionVariant;
  /** True once the custom fonts are loaded. The TEXT beats (tagline /
      amber / footnote — Cormorant italic) wait for this so they never
      render in the system fallback font; the logo, bloom and drift
      start at mount regardless. Defaults true — the onboarding variant
      renders after fonts load, so it is never gated. The launch
      variant's parent passes appReady here. */
  fontsReady?: boolean;
  /** Fires once when the entrance finishes (SPLASH_TOTAL_MS after
      entrance start, or later when fonts land late — see the font
      gate), or immediately in final / Reduce Motion mode. */
  onEntranceComplete?: () => void;
}

/** The colors / type a splash render needs, resolved by the caller:
    the onboarding variant from the hooks, the launch variant from the
    static constants (it renders outside AppProvider). Only the three
    colors and the body size/leading below are read. */
interface SplashMotionStyleValues {
  colors: Pick<typeof DarkColors, 'textSecondary' | 'accentDark' | 'iconMuted'>;
  typography: {
    size: { body: number };
    leading: { body: number };
  };
}

type SplashMotionBodyProps = SplashMotionProps &
  SplashMotionStyleValues & { variant: SplashMotionVariant };

function SplashMotionBody({
  reduceMotion,
  alreadyPlayed,
  onEntrancePlayed,
  onBegin,
  variant,
  fontsReady = true,
  onEntranceComplete,
  colors: C,
  typography: T,
}: SplashMotionBodyProps) {
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        splashContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        driftGlowWrap: {
          position: 'absolute',
          top: Math.round(SCREEN_HEIGHT * SPLASH_DRIFT_CENTER_Y_PCT) - SPLASH_DRIFT_GLOW_SIZE / 2,
          left: Math.round(SCREEN_WIDTH / 2) - SPLASH_DRIFT_GLOW_SIZE / 2,
        },
        bloomWrap: {
          position: 'absolute',
          top: Math.round(SCREEN_HEIGHT * SPLASH_BLOOM_CENTER_Y_PCT) - SPLASH_BLOOM_SIZE / 2,
          left: Math.round(SCREEN_WIDTH / 2) - SPLASH_BLOOM_SIZE / 2,
        },
        spGlowCenterWrap: {
          position: 'absolute',
          top: Math.round(SCREEN_HEIGHT * 0.36) - 128,
          left: Math.round(SCREEN_WIDTH / 2) - 128,
        },
        spGlowTopWrap: {
          position: 'absolute',
          top: -96,
          left: Math.round(SCREEN_WIDTH / 2) - 144,
        },
        splashBrand: {
          alignItems: 'center',
          marginBottom: 28,
        },
        splashLogo: {
          width: Math.min(SCREEN_WIDTH - 56, 320) * 0.7,
          height: 95,
        },
        splashTagWrap: {
          marginBottom: 64,
          paddingHorizontal: 32,
        },
        splashTag: {
          fontFamily: Fonts.italic,
          fontSize: T.size.body,
          lineHeight: T.leading.body,
          textAlign: 'center',
          color: C.textSecondary,
        },
        accentItalic: {
          fontFamily: Fonts.italic,
          color: C.accentDark,
        },
        splashActions: {
          position: 'absolute',
          left: 32,
          right: 32,
          bottom: 64,
          gap: 16,
          alignItems: 'center',
        },
        fullWidth: {
          width: '100%',
        },
        splashSub: {
          fontFamily: Fonts.italic,
          fontSize: T.size.body,
          lineHeight: T.leading.body,
          textAlign: 'center',
          color: C.iconMuted,
        },
        // Same face the splash CTA used before the move (onboarding's
        // secondaryButtonText): titleMedium.
        splashButtonText: {
          fontFamily: Fonts.titleMedium,
        },
      }),
    [C, T],
  );

  // The mount's plan: entrance only on a fresh session with motion on.
  // Initial shared values match the plan so the first paint is right
  // even before the effect runs (entrance starts hidden; final state
  // starts at rest).
  const plan = resolveSplashPlan({ reduceMotion, alreadyPlayed });
  const initial: SplashValues = plan.mode === 'entrance' ? splashStartValues() : splashFinalValues();

  const phase = useSharedValue(0);
  const bloomScale = useSharedValue(initial.bloomScale);
  const bloomOpacity = useSharedValue(initial.bloomOpacity);
  const logoOpacity = useSharedValue(initial.logoOpacity);
  const logoY = useSharedValue(initial.logoY);
  const logoScale = useSharedValue(initial.logoScale);
  const taglineOpacity = useSharedValue(initial.taglineOpacity);
  const taglineY = useSharedValue(initial.taglineY);
  const amberOpacity = useSharedValue(initial.amberOpacity);
  const amberY = useSharedValue(initial.amberY);
  const buttonOpacity = useSharedValue(initial.buttonOpacity);
  const buttonY = useSharedValue(initial.buttonY);
  const buttonScale = useSharedValue(initial.buttonScale);
  const footnoteOpacity = useSharedValue(initial.footnoteOpacity);
  const footnoteY = useSharedValue(initial.footnoteY);

  // Guards the one-time rule within this mount (the parent's
  // alreadyPlayed prop only changes across mounts): once the entrance
  // has started here, a Reduce Motion toggle must not replay it.
  const playedLocallyRef = useRef(false);
  // Guards onEntranceComplete against double-fire: the effect below
  // can re-run on a Reduce Motion toggle / return visit, and the
  // launch parent unmounts on the callback.
  const entranceCompleteFiredRef = useRef(false);
  // Font gate: the launch splash's text beats wait for fontsReady.
  // entranceStartRef stamps the entrance start so a late fontsReady
  // can be measured against it; textBeatsStartedRef keeps the beats
  // one-time; completeTimerRef owns the onEntranceComplete timer,
  // created once the text-beat schedule is known (at mount on the
  // fast path, when fonts land on the slow path).
  const fontsReadyRef = useRef(fontsReady);
  const entranceStartRef = useRef<number | null>(null);
  const textBeatsStartedRef = useRef(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The parent callbacks' latest identities, read through refs so the
  // entrance effect does NOT re-run when the parent passes a new arrow
  // identity (the launch overlay passes inline arrows; re-running
  // would snap the entrance to final mid-play). The sync effect runs
  // before the entrance effect on every commit.
  const onEntrancePlayedRef = useRef(onEntrancePlayed);
  const onEntranceCompleteRef = useRef(onEntranceComplete);
  useEffect(() => {
    onEntrancePlayedRef.current = onEntrancePlayed;
    onEntranceCompleteRef.current = onEntranceComplete;
    fontsReadyRef.current = fontsReady;
  });
  // LET'S BEGIN unlocks when its beat finishes (SPLASH_BUTTON_REST_MS).
  // buttonReady is DERIVED during render, not set in the effect: the
  // plan already says whether the button is live at once (final state)
  // or locked until the beat ends — the only state is the timer's
  // unlock flag, set from the timeout callback. (A synchronous
  // setButtonReady in the effect body trips react-hooks/set-state-in-effect.)
  const [buttonUnlocked, setButtonUnlocked] = useState(false);
  const buttonReady = plan.buttonReadyDelayMs === 0 || buttonUnlocked;

  // onEntranceComplete fires once — when the entrance finishes, or
  // immediately in final / Reduce Motion mode. The ref guards the
  // double-fire; the entrance effect and the font-gate effect below
  // both schedule it through scheduleEntranceComplete.
  const fireEntranceComplete = () => {
    if (entranceCompleteFiredRef.current) {
      return;
    }
    entranceCompleteFiredRef.current = true;
    onEntranceCompleteRef.current?.();
  };

  const scheduleEntranceComplete = (delayMs: number) => {
    if (completeTimerRef.current !== null) {
      clearTimeout(completeTimerRef.current);
    }
    completeTimerRef.current = setTimeout(fireEntranceComplete, delayMs);
  };

  const clearEntranceComplete = () => {
    if (completeTimerRef.current !== null) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  };

  // Starts the three TEXT beats (tagline / amber / footnote) with the
  // delays resolveTextBeatGate computes for fonts landing
  // fontsReadyAtMs after entrance start. Returns the gate so the
  // caller can schedule onEntranceComplete at its
  // entranceCompleteAtMs. The logo / bloom / drift / button beats are
  // NOT gated — they start at mount in the entrance effect.
  const startTextBeats = (fontsReadyAtMs: number) => {
    const gate = resolveTextBeatGate(fontsReadyAtMs);
    const taglineBeat = SPLASH_BEATS.find((b) => b.key === 'tagline');
    const amberBeat = SPLASH_BEATS.find((b) => b.key === 'amber');
    const footnoteBeat = SPLASH_BEATS.find((b) => b.key === 'footnote');
    if (taglineBeat && amberBeat && footnoteBeat) {
      taglineOpacity.value = withDelay(
        gate.taglineDelayMs,
        withTiming(1, { duration: taglineBeat.durationMs, easing: ENTER_EASE }),
      );
      taglineY.value = withDelay(
        gate.taglineDelayMs,
        withTiming(0, { duration: taglineBeat.durationMs, easing: ENTER_EASE }),
      );
      amberOpacity.value = withDelay(
        gate.amberDelayMs,
        withTiming(1, { duration: amberBeat.durationMs, easing: ENTER_EASE }),
      );
      amberY.value = withDelay(
        gate.amberDelayMs,
        withTiming(0, { duration: amberBeat.durationMs, easing: ENTER_EASE }),
      );
      footnoteOpacity.value = withDelay(
        gate.footnoteDelayMs,
        withTiming(1, { duration: footnoteBeat.durationMs, easing: ENTER_EASE }),
      );
      footnoteY.value = withDelay(
        gate.footnoteDelayMs,
        withTiming(0, { duration: footnoteBeat.durationMs, easing: ENTER_EASE }),
      );
    }
    return gate;
  };

  useEffect(() => {
    const final = splashFinalValues();
    const setFinal = () => {
      bloomScale.value = final.bloomScale;
      bloomOpacity.value = final.bloomOpacity;
      logoOpacity.value = final.logoOpacity;
      logoY.value = final.logoY;
      logoScale.value = final.logoScale;
      taglineOpacity.value = final.taglineOpacity;
      taglineY.value = final.taglineY;
      amberOpacity.value = final.amberOpacity;
      amberY.value = final.amberY;
      buttonOpacity.value = final.buttonOpacity;
      buttonY.value = final.buttonY;
      buttonScale.value = final.buttonScale;
      footnoteOpacity.value = final.footnoteOpacity;
      footnoteY.value = final.footnoteY;
    };

    // onEntranceComplete fires once — when the entrance finishes, or
    // immediately in final / Reduce Motion mode (the branches below).
    // The ref guards the double-fire; the timer is created in the
    // entrance branch (fast path) or by the font-gate effect (slow
    // path) and cleared by that branch's cleanup.
    // Reduce Motion: no bloom, no drift, no delayed entrance — final
    // state instantly, button live at once (via the derived plan).
    if (reduceMotion) {
      setFinal();
      fireEntranceComplete();
      return;
    }

    // Ambient drift: runs while the splash is visible (motion on),
    // on first play AND on return visits. Cancelled by the cleanup
    // below when leaving the step / unmounting / Reduce Motion.
    phase.value = withRepeat(
      withTiming(1, { duration: SPLASH_DRIFT_MS, easing: Easing.linear }),
      -1,
      false,
    );

    const play = !alreadyPlayed && !playedLocallyRef.current;
    if (!play) {
      // Return visit in the same session: final state, no second
      // entrance, no second bloom. Drift (above) still runs.
      setFinal();
      fireEntranceComplete();
      return () => {
        cancelAnimation(phase);
      };
    }

    playedLocallyRef.current = true;
    onEntrancePlayedRef.current();
    // Stamps t=0 for the font gate: a late fontsReady is measured
    // against this so the text beats keep their relative stagger.
    entranceStartRef.current = Date.now();

    // WOW bloom (t=0): scale expands 0.72→1.24 over 380ms and stays;
    // opacity rises 0→0.65 over the same 380ms, then fades to 0 over
    // 570ms. Scale and opacity are independent shared values.
    bloomScale.value = withTiming(SPLASH_BLOOM_SCALE_END, {
      duration: SPLASH_BLOOM_EXPAND_MS,
      easing: ENTER_EASE,
    });
    bloomOpacity.value = withSequence(
      withTiming(SPLASH_BLOOM_PEAK_OPACITY, {
        duration: SPLASH_BLOOM_EXPAND_MS,
        easing: ENTER_EASE,
      }),
      withTiming(0, { duration: SPLASH_BLOOM_FADE_MS, easing: BLOOM_FADE_EASE }),
    );

    // Arrival beats — one shared value per beat, withDelay/withTiming,
    // all on the same cubic-bezier(0.22, 1, 0.36, 1). The logo and the
    // button start at mount: neither depends on fonts. The TEXT beats
    // (tagline / amber / footnote) are font-gated — see startTextBeats
    // and the font-gate effect below.
    const beat = SPLASH_BEATS.find((b) => b.key === 'logo');
    const buttonBeat = SPLASH_BEATS.find((b) => b.key === 'button');
    if (beat && buttonBeat) {
      logoOpacity.value = withDelay(beat.delayMs, withTiming(1, { duration: beat.durationMs, easing: ENTER_EASE }));
      logoY.value = withDelay(beat.delayMs, withTiming(0, { duration: beat.durationMs, easing: ENTER_EASE }));
      logoScale.value = withDelay(beat.delayMs, withTiming(1, { duration: beat.durationMs, easing: ENTER_EASE }));
      buttonOpacity.value = withDelay(buttonBeat.delayMs, withTiming(1, { duration: buttonBeat.durationMs, easing: ENTER_EASE }));
      buttonY.value = withDelay(buttonBeat.delayMs, withTiming(0, { duration: buttonBeat.durationMs, easing: ENTER_EASE }));
      buttonScale.value = withDelay(buttonBeat.delayMs, withTiming(1, { duration: buttonBeat.durationMs, easing: ENTER_EASE }));
    }

    // Font gate, fast path: fonts already ready at mount — the gate
    // returns today's schedule (960/1280/1980) and completion stays
    // at SPLASH_TOTAL_MS. Slow path (fontsReady false): the text
    // beats stay at their start values (opacity 0 — no text renders
    // in the fallback font) until the font-gate effect starts them
    // when fontsReady flips true; completion is scheduled there.
    if (fontsReadyRef.current) {
      const gate = startTextBeats(0);
      textBeatsStartedRef.current = true;
      scheduleEntranceComplete(gate.entranceCompleteAtMs);
    }

    // The button unlocks when its beat finishes (timeout callback
    // state — the only setState this effect performs). The launch
    // variant has no button, so it needs no unlock timer.
    const timer =
      variant === 'onboarding'
        ? setTimeout(() => setButtonUnlocked(true), SPLASH_BUTTON_REST_MS)
        : undefined;

    // The entrance is done when the last beat ends — onEntranceComplete
    // was scheduled above (fast path) or is scheduled by the font-gate
    // effect when fonts land (slow path). The launch variant has no
    // button, but it still reports completion — the overlay hides on
    // this callback.
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      clearEntranceComplete();
      cancelAnimation(phase);
      cancelAnimation(bloomScale);
      cancelAnimation(bloomOpacity);
      cancelAnimation(logoOpacity);
      cancelAnimation(logoY);
      cancelAnimation(logoScale);
      cancelAnimation(taglineOpacity);
      cancelAnimation(taglineY);
      cancelAnimation(amberOpacity);
      cancelAnimation(amberY);
      cancelAnimation(buttonOpacity);
      cancelAnimation(buttonY);
      cancelAnimation(buttonScale);
      cancelAnimation(footnoteOpacity);
      cancelAnimation(footnoteY);
    };
    // Shared values are stable handles; the effect re-runs only when
    // the plan inputs change (Reduce Motion toggle / return visit /
    // variant). The parent callbacks are read through refs (above)
    // and deliberately NOT deps: a new arrow identity must not
    // restart the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyPlayed, reduceMotion, variant]);

  // Font gate, slow path: when fontsReady flips true mid-entrance,
  // start the text beats with their relative stagger from now
  // (tagline → amber → footnote, same durations/easing) and schedule
  // onEntranceComplete for when the last beat ends. No-ops: the fast
  // path (beats already started), final mode (alreadyPlayed / Reduce
  // Motion — text is already at rest there and is never blanked while
  // waiting for fonts), and before the entrance starts
  // (entranceStartRef null). Once started, the beats run once —
  // textBeatsStartedRef guards against a second start.
  // startTextBeats / scheduleEntranceComplete only touch refs and
  // stable shared values, so they are deliberately NOT deps.
  useEffect(() => {
    if (!fontsReady) {
      return;
    }
    if (textBeatsStartedRef.current) {
      return;
    }
    if (entranceStartRef.current === null) {
      return;
    }
    const fontsReadyAtMs = Date.now() - entranceStartRef.current;
    const gate = startTextBeats(fontsReadyAtMs);
    textBeatsStartedRef.current = true;
    scheduleEntranceComplete(gate.entranceCompleteAtMs - fontsReadyAtMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsReady]);

  // Ambient drift style. The math mirrors lib/splashMotion driftOffset
  // / driftOpacity inline — a worklet cannot call an imported plain
  // function, so the rotated-ellipse formula lives here too (keep in
  // sync: 135° rotation, ±12% width / ±7% height, opacity 0.40–0.78).
  // Continuous linear phase: phase runs 0→1 over 26s and repeats, so
  // the glow never pauses at the ends of its oval.
  const driftStyle = useAnimatedStyle(() => {
    'worklet';
    const theta = phase.value * 2 * Math.PI;
    const a = SCREEN_WIDTH * 0.12;
    const b = SCREEN_HEIGHT * 0.07;
    const cosR = Math.cos((3 * Math.PI) / 4);
    const sinR = Math.sin((3 * Math.PI) / 4);
    const ex = Math.cos(theta);
    const ey = Math.sin(theta);
    // Same normalisation as lib/splashMotion driftOffset: the rotated
    // ellipse's raw extents exceed the ±12%/±7% bounds, so each axis
    // is rescaled to exactly its bound.
    const ampX = Math.hypot(a * cosR, b * sinR);
    const ampY = Math.hypot(a * sinR, b * cosR);
    const sx = a / ampX;
    const sy = b / ampY;
    return {
      opacity: 0.59 + 0.19 * Math.sin(phase.value * 2 * Math.PI),
      transform: [
        { translateX: (a * ex * cosR - b * ey * sinR) * sx },
        { translateY: (a * ex * sinR + b * ey * cosR) * sy },
      ],
    };
  });

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloomOpacity.value,
    transform: [{ scale: bloomScale.value }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoY.value }, { scale: logoScale.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }));
  const amberStyle = useAnimatedStyle(() => ({
    opacity: amberOpacity.value,
    transform: [{ translateY: amberY.value }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonY.value }, { scale: buttonScale.value }],
  }));
  const footnoteStyle = useAnimatedStyle(() => ({
    opacity: footnoteOpacity.value,
    transform: [{ translateY: footnoteY.value }],
  }));

  return (
    <View style={styles.splashContainer} testID="splash-motion">
      <Animated.View pointerEvents="none" style={[styles.driftGlowWrap, driftStyle]}>
        <RadialGlow size={SPLASH_DRIFT_GLOW_SIZE} maxOpacity={SPLASH_DRIFT_GLOW_MAX_OPACITY} />
      </Animated.View>
      <View pointerEvents="none" style={styles.spGlowCenterWrap}>
        <RadialGlow size={256} maxOpacity={0.08} />
      </View>
      <View pointerEvents="none" style={styles.spGlowTopWrap}>
        <RadialGlow size={288} maxOpacity={0.08} />
      </View>

      <Animated.View pointerEvents="none" style={[styles.bloomWrap, bloomStyle]}>
        {/* maxOpacity 1: the bloom's 0→0.65→0 peak lives in the view
            opacity above, so the gradient core reads 0.65 at peak. */}
        <RadialGlow size={SPLASH_BLOOM_SIZE} maxOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.splashBrand, logoStyle]}>
        <Image
          source={require('../assets/images/triad-prayer-logo.png')}
          style={styles.splashLogo}
          resizeMode="contain"
          accessibilityLabel="TRIAD Prayer"
        />
      </Animated.View>

      {/* The tagline is one sentence split into two separately animated
          wrappers (lead line, then the amber phrase) — same copy,
          same styles, no divider. The amber phrase now starts on its
          own centred line; the wording is unchanged.
          lib/sessionDuration.ts: measured Day 1, not a round number —
          ~3 minutes prayed as designed. */}
      <View style={styles.splashTagWrap}>
        <Animated.View style={taglineStyle}>
          <Text style={styles.splashTag}>{SPLASH_TAGLINE_LEAD}</Text>
        </Animated.View>
        <Animated.View style={amberStyle}>
          <Text style={[styles.splashTag, styles.accentItalic]}>{SPLASH_TAGLINE_AMBER}</Text>
        </Animated.View>
      </View>

      <View style={styles.splashActions}>
        {/* Launch variant: no LET'S BEGIN button and no gating — the
            footnote is the only bottom element. */}
        {variant === 'onboarding' ? (
          <Animated.View
            style={[styles.fullWidth, buttonStyle]}
            pointerEvents={buttonReady ? 'auto' : 'none'}
            testID="splash-begin-wrap"
          >
            <GlowButton
              label={SPLASH_CTA_LABEL}
              onPress={() => {
                if (!buttonReady) {
                  return;
                }
                onBegin?.();
              }}
              variant="primary"
              textStyle={styles.splashButtonText}
              style={styles.fullWidth}
              testID="splash-lets-begin"
            />
          </Animated.View>
        ) : null}
        <Animated.View style={footnoteStyle}>
          <Text style={styles.splashSub}>{SPLASH_FOOTNOTE}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Variants ─────────────────────────────────────────────────────────────
// The launch variant renders outside AppProvider, so it must not call
// useColors()/useTypography() — both call useApp(). It uses the static
// dark palette + unscaled tokens directly: for a default (fireside,
// normal-text) user these resolve to exactly the values the hooks
// return (DarkColors verbatim; TYPOGRAPHY.body 17/25 — pinned in
// __tests__/splashMotion.test.ts). Seasonal-theme users and Larger
// Text are the flagged exceptions — see the header note. The module-
// level LAUNCH_TYPOGRAPHY keeps the style memo's dependency stable
// across renders (resolveTypography builds a fresh object per call).
const LAUNCH_TYPOGRAPHY = resolveTypography(false);

function SplashMotionLaunch(props: SplashMotionProps & { variant: SplashMotionVariant }) {
  return <SplashMotionBody {...props} colors={DarkColors} typography={LAUNCH_TYPOGRAPHY} />;
}

function SplashMotionOnboarding(props: SplashMotionProps & { variant: SplashMotionVariant }) {
  const C = useColors();
  const T = useTypography();
  return <SplashMotionBody {...props} colors={C} typography={T} />;
}

export default function SplashMotion({
  reduceMotion,
  alreadyPlayed,
  onEntrancePlayed,
  onBegin,
  variant = 'onboarding',
  fontsReady,
  onEntranceComplete,
}: SplashMotionProps) {
  const shared = { reduceMotion, alreadyPlayed, onEntrancePlayed, onBegin, variant, fontsReady, onEntranceComplete };
  if (variant === 'launch') {
    return <SplashMotionLaunch {...shared} />;
  }
  return <SplashMotionOnboarding {...shared} />;
}
