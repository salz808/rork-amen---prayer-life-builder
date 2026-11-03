import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';
import {
  resolveTypography,
  type TypographyRole,
} from '@/constants/typography';

const LARGE_SCALE = 1.18;
const BASE_SCALE = 1.15;
const MIN_LEGIBLE_SIZE = 13.4;

export type { TypographyRole };

/**
 * Typography hook — Wave 3 token adoption (PROMPT 1 remediation).
 *
 * Preferred API: `T.size.<role>` / `T.leading.<role>` from
 * `constants/typography.ts`. Normal mode returns the token's final pt
 * exactly; Larger Text scales size and line-height by 1.18. This replaces
 * the old pattern of ad-hoc `T.scale(n)` literals, whose hidden ×1.15
 * multiplier made code sizes understate on-screen sizes by 15%.
 *
 * `scale(base)` is retained ONLY for the documented non-role sizes:
 * data-driven sizes (WordCloud word weights) and glyph sizes (emoji, the
 * declarations explainer dot box). Do not use it for reading text — a new
 * `T.scale(n)` on a text style is how the 739-literal inventory happened,
 * and the Wave 3 counting check treats any new one as a regression.
 */
export function useTypography() {
  const { state } = useApp();
  const isLarge = state.fontSize === 'large';

  return useMemo(() => {
    const { size, leading } = resolveTypography(isLarge);
    return {
      scale: (base: number): number => {
        const scaled = base * BASE_SCALE * (isLarge ? LARGE_SCALE : 1);
        const legibleSize = base < 12 ? Math.max(scaled, MIN_LEGIBLE_SIZE) : scaled;
        return Math.round(legibleSize * 10) / 10;
      },
      size,
      leading,
      isLarge,
    };
  }, [isLarge]);
}
