// Splash spec (2026-11-17, Worker B) — the SINGLE source of truth
// for the shared splash layout. The launch splash (BootScreen in
// app/_layout.tsx, variant="launch") and the onboarding splash step
// (app/onboarding.tsx, variant="onboarding") must match 100% in
// layout — same logo size/position, same tagline type/margins,
// same amber phrase, same footnote, same vertical spacing, same
// background. They used to arrive at those values by two different
// routes (launch: static DarkColors + unscaled TYPOGRAPHY tokens,
// because it renders outside AppProvider; onboarding: useColors() /
// useTypography() hooks), which split for seasonal-theme and Larger
// Text users, and by two different outer containers (BootScreen's
// full-screen absoluteFill centered view vs onboarding's SafeAreaView
// + KeyboardAvoidingView, whose insets shift centered content on a
// notched iPhone) and two different background stacks (launch had no
// ambient veils; onboarding had them, themed).
//
// This module fixes that by construction: BOTH variants consume
// these values, and neither resolves splash styles any other way.
// The values are the static fireside tokens — the launch variant
// cannot call the hooks (it renders outside AppProvider, and the
// profile/theme is not even loaded at boot), so the onboarding
// variant now uses the same static resolution instead of the hooks:
// for a default (fireside, normal-text) user the values are
// identical to what the hooks returned (pinned in
// __tests__/splashMotion.test.ts), and for seasonal-theme / Larger
// Text users the splash step is now the same on both screens rather
// than jumping 18% larger between the launch overlay and onboarding.
// The splash step only — every other onboarding step still uses the
// themed hooks. The backdrop (gradient + veils) is shared the same
// way via components/SplashBackdrop.tsx, which reads from here.
//
// Pure data only: no react-native / Reanimated imports, so node Jest
// can import this directly and pin the parity (see the 'launch /
// onboarding parity' block in __tests__/splashMotion.test.ts).
// The ONE intentional difference between the variants is the LET'S
// BEGIN button (onboarding only, absolutely positioned in
// splashActions — it grows upward from the bottom-anchored container
// and displaces nothing else). Everything else that differs is a
// defect, not a judgment call.

import DarkColors from '@/constants/darkColors';
import { Fonts } from '@/constants/fonts';
import { resolveTypography } from '@/constants/typography';
import {
  SPLASH_BLOOM_CENTER_Y_PCT,
  SPLASH_BLOOM_SIZE,
  SPLASH_DRIFT_CENTER_Y_PCT,
  SPLASH_DRIFT_GLOW_MAX_OPACITY,
  SPLASH_DRIFT_GLOW_SIZE,
} from '@/lib/splashMotion';

// ── Style inputs: the colors / type the splash reads ───────────────────
// Static fireside resolution, shared by both variants. These are the
// exact values useColors()/useTypography() return for a default user
// (DarkColors verbatim; body 17/25 unscaled).
export const SPLASH_STYLE_COLORS = {
  textSecondary: DarkColors.textSecondary,
  accentDark: DarkColors.accentDark,
  iconMuted: DarkColors.iconMuted,
} as const;

export const SPLASH_STYLE_TYPOGRAPHY = resolveTypography(false);

// ── Backdrop: gradient + ambient veils, shared by both screens ────────
// The gradient triple is BackgroundGradient's default (DarkColors).
export const SPLASH_BACKDROP_COLORS: readonly [string, string, string] = [
  DarkColors.bgGradient1,
  DarkColors.bgGradient2,
  DarkColors.bgGradient3,
] as const;

// Full-screen veil (onboarding's ambientVeilTop geometry, static color).
export const SPLASH_VEIL_TOP = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  backgroundColor: DarkColors.ambientVeil2,
} as const;

// Bottom-right veil (onboarding's ambientVeilBottom geometry, static
// color): 240pt circle, centre off the corner.
export const SPLASH_VEIL_BOTTOM = {
  position: 'absolute',
  right: -64,
  bottom: -80,
  width: 240,
  height: 240,
  borderRadius: 120,
  backgroundColor: DarkColors.ambientVeil1,
} as const;

// ── Shared element styles ──────────────────────────────────────────────
// One function of the screen size, called by components/SplashMotion
// for BOTH variants. Values copied verbatim from the pre-unification
// SplashMotionBody styles — nothing resized, only moved here so the
// two variants cannot drift. The glow-wrap positions reuse the
// lib/splashMotion constants (drift/bloom size + centre), so a
// choreography change flows to both variants at once.
export function splashSharedStyles(screenWidth: number, screenHeight: number) {
  const bodySize = SPLASH_STYLE_TYPOGRAPHY.size.body;
  const bodyLeading = SPLASH_STYLE_TYPOGRAPHY.leading.body;
  return {
    splashContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    driftGlowWrap: {
      position: 'absolute',
      top: Math.round(screenHeight * SPLASH_DRIFT_CENTER_Y_PCT) - SPLASH_DRIFT_GLOW_SIZE / 2,
      left: Math.round(screenWidth / 2) - SPLASH_DRIFT_GLOW_SIZE / 2,
    },
    bloomWrap: {
      position: 'absolute',
      top: Math.round(screenHeight * SPLASH_BLOOM_CENTER_Y_PCT) - SPLASH_BLOOM_SIZE / 2,
      left: Math.round(screenWidth / 2) - SPLASH_BLOOM_SIZE / 2,
    },
    spGlowCenterWrap: {
      position: 'absolute',
      top: Math.round(screenHeight * 0.36) - 128,
      left: Math.round(screenWidth / 2) - 128,
    },
    spGlowTopWrap: {
      position: 'absolute',
      top: -96,
      left: Math.round(screenWidth / 2) - 144,
    },
    splashBrand: {
      alignItems: 'center',
      marginBottom: 28,
    },
    splashLogo: {
      width: Math.min(screenWidth - 56, 320) * 0.7,
      height: 95,
    },
    splashTagWrap: {
      marginBottom: 64,
      paddingHorizontal: 32,
    },
    splashTag: {
      fontFamily: Fonts.italic,
      fontSize: bodySize,
      lineHeight: bodyLeading,
      textAlign: 'center',
      color: SPLASH_STYLE_COLORS.textSecondary,
    },
    accentItalic: {
      fontFamily: Fonts.italic,
      color: SPLASH_STYLE_COLORS.accentDark,
    },
    // LET'S BEGIN + footnote dock: bottom-anchored, so the button
    // (onboarding only) grows upward and the footnote sits at the
    // same 64pt-from-bottom in both variants.
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
      fontSize: bodySize,
      lineHeight: bodyLeading,
      textAlign: 'center',
      color: SPLASH_STYLE_COLORS.iconMuted,
    },
    // Same face the splash CTA used before the move (onboarding's
    // secondaryButtonText): titleMedium.
    splashButtonText: {
      fontFamily: Fonts.titleMedium,
    },
  } as const;
}

// Re-exported for the parity test: the glow sizes the wraps above
// position, so the test can pin them without importing the component.
export const SPLASH_SPEC_GLOWS = {
  driftSize: SPLASH_DRIFT_GLOW_SIZE,
  driftMaxOpacity: SPLASH_DRIFT_GLOW_MAX_OPACITY,
  bloomSize: SPLASH_BLOOM_SIZE,
} as const;
