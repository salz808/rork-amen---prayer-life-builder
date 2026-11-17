import DarkColors from '@/constants/darkColors';
import {
  applyTheme,
  getThemeOverride,
  type ThemeName,
} from '@/services/themes';

// GPT-6 item 2 (2026-11-16): the GlowButton's dark #180C02 label sat on
// a gradient whose deep stop was only 3.91:1 in the default theme —
// below WCAG AA 4.5:1 for normal text — and worse in the seasonal
// themes (ordinary 2.49:1, pentecost 2.32:1). The deep stops were
// lightened so BOTH gradient stops clear 4.5:1 in EVERY theme. These
// tests pin that contract: a token change that drops any stop below
// 4.5:1 fails here before the button ships unreadable.
//
// The gradient resolves through C.accent / C.accentDeep (see
// components/GlowButton.tsx), and useColors() always starts from
// DarkColors with a per-theme override — so resolving each theme the
// same way covers every stop the button can actually render.
// constants/colors.ts (light) is NOT resolved by useColors and is
// deliberately out of scope here.

// Must match styles.text color in components/GlowButton.tsx.
const BUTTON_TEXT = '#180C02';
// WCAG AA minimum for normal text (the button label is 15pt Montserrat).
const AA_NORMAL = 4.5;

const THEME_NAMES: ThemeName[] = [
  'default',
  'monastic',
  'ordinary',
  'advent',
  'lent',
  'easter',
  'pentecost',
];

type Rgb = { r: number; g: number; b: number; a: number };

function parseColor(color: string): Rgb {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const rgba = color.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (!rgba) throw new Error(`buttonContrast: unparsable color ${color}`);
  return {
    r: Number(rgba[1]),
    g: Number(rgba[2]),
    b: Number(rgba[3]),
    a: rgba[4] === undefined ? 1 : Number(rgba[4]),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(parseColor(foreground));
  const l2 = relativeLuminance(parseColor(background));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Alpha-composite `foreground` over an opaque `background` hex.
function compositeOver(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  const mix = (f: number, b: number) =>
    Math.round(fg.a * f + (1 - fg.a) * b);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(mix(fg.r, bg.r))}${toHex(mix(fg.g, bg.g))}${toHex(
    mix(fg.b, bg.b),
  )}`;
}

function themeColors(theme: ThemeName) {
  return applyTheme(DarkColors, getThemeOverride(theme));
}

describe('GlowButton contrast (GPT-6 item 2)', () => {
  it.each(THEME_NAMES)(
    'primary label #180C02 clears AA 4.5:1 on BOTH gradient stops (%s)',
    (theme) => {
      const C = themeColors(theme);
      expect(contrastRatio(BUTTON_TEXT, C.accent)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(BUTTON_TEXT, C.accentDeep)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_NAMES)(
    'the deep stop stays visibly deeper than the light stop (%s)',
    (theme) => {
      const C = themeColors(theme);
      expect(relativeLuminance(parseColor(C.accentDeep))).toBeLessThan(
        relativeLuminance(parseColor(C.accent)),
      );
    },
  );

  it.each(THEME_NAMES)(
    'ghost label (accentDark) clears AA 4.5:1 on its dark surface (%s)',
    (theme) => {
      const C = themeColors(theme);
      // The ghost container is accentBg (a translucent wash) over the
      // surface — composite it to get the real background under the text.
      const ghostBg = compositeOver(C.accentBg, C.surface);
      expect(contrastRatio(C.accentDark, ghostBg)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it('documents why accentDark must never be text on amber (1.40:1)', () => {
    // Default theme only: this pins the reason for the rule, not a
    // value to preserve. If the tokens ever change so accentDark on
    // accent DOES clear AA, delete this test — the prohibition no
    // longer applies. Until then, accentDark stays off the gradient.
    const C = themeColors('default');
    expect(contrastRatio(C.accentDark, C.accent)).toBeLessThan(AA_NORMAL);
  });
});
