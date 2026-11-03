import { Fonts } from '@/constants/fonts';

/**
 * TRIAD typography tokens — Wave 3 (PROMPT 1 remediation).
 *
 * Source: the PROMPT 1 visual/UX/a11y audit §3.2. Before this module the app
 * had no type system at all: ~739 ad-hoc `T.scale(n)` literals multiplied by
 * 1.15 (1.357 in Larger Text), so code reading 14.5 pt rendered at 16.7 pt,
 * display text hit 50–74 pt, and one number (14.5) meant body, label,
 * button, caption, and tab label at once.
 *
 * Sizes below are FINAL normal-mode pt (what the user sees). The hook in
 * `hooks/useTypography.ts` applies the Larger Text factor (×1.18) on top of
 * these values — Larger Text is a deliberate accessibility layer over the
 * tokens, never an inline override (the old Home greeting overrides that
 * made the name SMALLER in Larger Text mode are deleted, not migrated).
 *
 * How to use:
 * - Inside a component with `const T = useTypography()`:
 *     fontSize: T.size.body, lineHeight: T.leading.body
 * - Inside a static StyleSheet (no hook in scope — e.g. Circles, the boot
 *   screen, ErrorBoundary): `TYPOGRAPHY.body.size` / `.lineHeight`. Static
 *   use does NOT scale with Larger Text, exactly like the raw numbers it
 *   replaces; prefer the hook wherever a component already has one.
 *
 * Family is documentation here, not enforcement: the size/leading accessors
 * deliberately do not rewrite `fontFamily`, so adopting a token never
 * silently changes a screen's voice (Cormorant for sacred text, Montserrat
 * for UI). The two exceptions are the audit's floor rules, applied during
 * migration: (1) no italic Cormorant below `body` — helper text uses
 * `caption` (Montserrat Regular); (2) no `textMuted` for information —
 * informational text uses the secondary colour, muted only for `footnote`.
 *
 * Floor rules (non-negotiable, audit §3.2):
 * 1. No italic serif below `body` (17 pt).
 * 2. No text in `textMuted` except `footnote`.
 * 3. No `adjustsFontSizeToFit` on a row of peers — if one chip/label in a
 *    row must shrink, the row's token is wrong; resize the token or reflow
 *    the row. Shrink is allowed only for a single centred display line.
 * 4. Every text style carries a line-height — every token below has one.
 * 5. No new `fontSize`/`lineHeight` literal outside this file. The only
 *    sanctioned `T.scale()` uses left are data-driven or glyph sizes
 *    (WordCloud weights, emoji glyphs, the declarations explainer dot box),
 *    each documented at its call site and in the Wave 3 log.
 * 6. Larger Text scales tokens; it never overrides them inline.
 *
 * `numberChrome` is a documented extension of the audit's `number` row,
 * which itself gives two sizes (large 28 for stats, 13 for chrome
 * progress). Splitting them into two named tokens keeps call sites honest
 * about which one they mean.
 */

export type TypographyRole =
  | 'display'
  | 'title'
  | 'sectionTitle'
  | 'prayerBody'
  | 'scripture'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'button'
  | 'tabLabel'
  | 'number'
  | 'numberChrome'
  | 'footnote';

export interface TypographyToken {
  /** Job this token is for — use only for this. */
  job: string;
  family: string;
  /** Final normal-mode pt. */
  size: number;
  /** Final normal-mode pt. Always present (floor rule 4). */
  lineHeight: number;
  /** Tracking in pt. Button primaries use 1.5; chips keep 0.5 locally. */
  letterSpacing: number;
}

export const TYPOGRAPHY: Record<TypographyRole, TypographyToken> = {
  display: {
    job: 'Greeting name, hero numerals, celebration titles, modal verse',
    family: Fonts.serifRegular,
    size: 40,
    lineHeight: 48,
    letterSpacing: -1,
  },
  title: {
    job: 'Screen titles (one per screen)',
    family: Fonts.serifLight,
    size: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sectionTitle: {
    job: 'Card/section titles',
    family: Fonts.serifRegular,
    size: 24,
    lineHeight: 30,
    letterSpacing: 0,
  },
  prayerBody: {
    job: 'Session movement text',
    family: Fonts.serifRegular,
    size: 26,
    lineHeight: 34,
    letterSpacing: 0,
  },
  scripture: {
    job: 'Verse text, declaration card text',
    family: Fonts.serifRegular,
    size: 20,
    lineHeight: 28,
    letterSpacing: 0,
  },
  body: {
    job: 'Body copy, descriptions',
    family: Fonts.titleMedium,
    size: 17,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  bodySmall: {
    job: 'Secondary body, card descriptions',
    family: Fonts.titleMedium,
    size: 16,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  label: {
    job: 'Eyebrows, section labels, metric labels (UPPERCASE by convention)',
    family: Fonts.titleSemiBold,
    size: 13,
    lineHeight: 18,
    letterSpacing: 2,
  },
  caption: {
    job: 'Helper, "how measured", footnotes, timestamps (never italic serif)',
    family: Fonts.titleRegular,
    size: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  button: {
    job: 'All CTA/button/chip text (one token per row — never per-peer shrink)',
    family: Fonts.titleSemiBold,
    size: 15,
    lineHeight: 20,
    letterSpacing: 1.5,
  },
  tabLabel: {
    job: 'Bottom tab labels only — sized for "Community" at full width',
    family: Fonts.titleMedium,
    size: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  number: {
    job: 'Large stats and counts',
    family: Fonts.titleLight,
    size: 28,
    lineHeight: 32,
    letterSpacing: 0,
  },
  numberChrome: {
    job: 'Chrome progress counters (session "01 · 07")',
    family: Fonts.titleMedium,
    size: 13,
    lineHeight: 18,
    letterSpacing: 2,
  },
  footnote: {
    job: 'Legal, attribution, "saved on device" notes ONLY — never instructions',
    family: Fonts.titleRegular,
    size: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
};

/** Larger Text multiplier — the same 1.18 the old scaler used. */
export const LARGE_TEXT_FACTOR = 1.18;

/**
 * Pure resolver so the token math is unit-testable without the provider.
 * Normal mode returns the audit's final pt exactly; Larger Text scales
 * size and line-height by 1.18 (tracking is absolute and never scales).
 */
export function resolveTypography(isLarge: boolean): {
  size: Record<TypographyRole, number>;
  leading: Record<TypographyRole, number>;
} {
  const factor = isLarge ? LARGE_TEXT_FACTOR : 1;
  const size = {} as Record<TypographyRole, number>;
  const leading = {} as Record<TypographyRole, number>;
  (Object.keys(TYPOGRAPHY) as TypographyRole[]).forEach((role) => {
    size[role] = Math.round(TYPOGRAPHY[role].size * factor * 10) / 10;
    leading[role] = Math.round(TYPOGRAPHY[role].lineHeight * factor * 10) / 10;
  });
  return { size, leading };
}

/**
 * Dynamic Type policy per token (audit §4.3). Display/title are capped so
 * iOS Larger Text cannot blow a hero line out of its container; body text
 * is left uncapped so it reflows. This is a prop-level policy
 * (`maxFontSizeMultiplier` on Text elements): the tab label already sets
 * 1.25, and applying the caps to display/title Text elements is a
 * device-verified follow-up recorded in the Wave 3 log — the token styles
 * themselves cannot carry the prop.
 */
export const MAX_FONT_SIZE_MULTIPLIER: Partial<Record<TypographyRole, number>> = {
  display: 1.25,
  title: 1.25,
};
