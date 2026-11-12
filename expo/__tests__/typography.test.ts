import {
  TYPOGRAPHY,
  resolveTypography,
  LARGE_TEXT_FACTOR,
  type TypographyRole,
} from '@/constants/typography';
import { Fonts } from '@/constants/fonts';

const ROLES = Object.keys(TYPOGRAPHY) as TypographyRole[];

// The 2026-11-05 typography audit's §6 target ramp, asserted exactly: a
// drift here is a design change, not a refactor, and needs Kai's eye.
const EXPECTED: Record<TypographyRole, { size: number; lineHeight: number }> = {
  display: { size: 36, lineHeight: 44 },
  title: { size: 32, lineHeight: 36 },
  sectionTitle: { size: 22, lineHeight: 28 },
  prayerBody: { size: 24, lineHeight: 32 },
  scripture: { size: 22, lineHeight: 30 },
  body: { size: 17, lineHeight: 22 },
  bodySmall: { size: 16, lineHeight: 20 },
  label: { size: 14.5, lineHeight: 20 },
  caption: { size: 15, lineHeight: 20 },
  button: { size: 16, lineHeight: 22 },
  tabLabel: { size: 12, lineHeight: 16 },
  number: { size: 30, lineHeight: 34 },
  numberChrome: { size: 14.5, lineHeight: 20 },
  footnote: { size: 14, lineHeight: 20 },
  citation: { size: 14, lineHeight: 20 },
  rowTitle: { size: 20, lineHeight: 26 },
};

describe('typography tokens', () => {
  it('matches the audit token table exactly', () => {
    ROLES.forEach((role) => {
      expect(TYPOGRAPHY[role].size).toBe(EXPECTED[role].size);
      expect(TYPOGRAPHY[role].lineHeight).toBe(EXPECTED[role].lineHeight);
    });
  });

  it('every token carries a line-height greater than its size', () => {
    ROLES.forEach((role) => {
      expect(TYPOGRAPHY[role].lineHeight).toBeGreaterThan(TYPOGRAPHY[role].size);
    });
  });

  it('no italic serif below body: every sub-body token is Montserrat', () => {
    const italicFamilies = new Set([
      Fonts.italic,
      Fonts.italicMedium,
      Fonts.italicSemiBold,
      Fonts.serifLightItalic,
    ]);
    ROLES.forEach((role) => {
      if (TYPOGRAPHY[role].size < TYPOGRAPHY.body.size) {
        expect(italicFamilies.has(TYPOGRAPHY[role].family)).toBe(false);
      }
    });
  });

  it('normal mode returns the token pt exactly', () => {
    const { size, leading } = resolveTypography(false);
    expect(size.display).toBe(36);
    expect(size.body).toBe(17);
    expect(leading.body).toBe(22);
    expect(size.tabLabel).toBe(12);
  });

  it('Larger Text scales size and leading by 1.18, never tracking', () => {
    expect(LARGE_TEXT_FACTOR).toBe(1.18);
    const { size, leading } = resolveTypography(true);
    expect(size.body).toBe(20.1);
    expect(leading.body).toBe(26);
    expect(size.display).toBe(42.5);
    // Tracking is absolute: the token table itself is unchanged.
    expect(TYPOGRAPHY.label.letterSpacing).toBe(1.5);
  });

  it('Larger Text strictly enlarges every token (no Home-greeting inversion)', () => {
    const normal = resolveTypography(false);
    const large = resolveTypography(true);
    ROLES.forEach((role) => {
      expect(large.size[role]).toBeGreaterThan(normal.size[role]);
      expect(large.leading[role]).toBeGreaterThan(normal.leading[role]);
    });
  });
});
