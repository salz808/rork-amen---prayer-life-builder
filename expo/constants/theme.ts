import DarkColors from './darkColors';
import { Fonts } from './fonts';
import {
  TYPOGRAPHY,
  LARGE_TEXT_FACTOR,
  MAX_FONT_SIZE_MULTIPLIER,
  resolveTypography,
  type TypographyRole,
  type TypographyToken,
} from './typography';

/**
 * TRIAD theme — single entry point (arena-audit fix pass, F1, 2026-11-15).
 *
 * Before this module the tokens were split across `colors.ts` /
 * `darkColors.ts` / `typography.ts` / `fonts.ts`, so screens re-derived
 * the same values inline (144 raw hexes outside `constants/`, two
 * copy-pasted background gradients, an un-tokenized text-opacity
 * ladder). New code imports from here; existing files keep their
 * `useColors()` / `useTypography()` hooks, which resolve against the
 * same sources below, so nothing already shipped changes value.
 *
 * The live theme is the dark palette in `darkColors.ts` — bg #0D0804,
 * accent #C8894A, text #F4EDE0 — and the Montserrat / Cormorant
 * Garamond families. The audit's Inter/Newsreader families and its
 * #140F0C / #D4A054 values are deliberately NOT adopted.
 */

export type { TypographyRole, TypographyToken };
export { TYPOGRAPHY, LARGE_TEXT_FACTOR, MAX_FONT_SIZE_MULTIPLIER, resolveTypography };
export { Fonts };

/** Live color palette (dark theme; theme overrides apply via useColors). */
export const colors = DarkColors;
export type Colors = typeof DarkColors;

/** 8pt spacing scale (index = step). Screen padding is step 8 (32). */
export const space = [0, 4, 8, 12, 16, 24, 32, 40, 48, 64] as const;

/** Corner radii. `lg` is the standard card radius. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/** Minimum touch-target expansion on every pressable. */
export const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 } as const;

/** Minimum tap-target size (pt). */
export const minTap = 44;

/** Shared horizontal screen padding (pt) — `components/ui/Screen`. */
export const screenPadding = 32;
