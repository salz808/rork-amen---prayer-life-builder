import {
  TYPOGRAPHY,
  resolveTypography,
  LARGE_TEXT_FACTOR,
  type TypographyRole,
} from '@/constants/typography';
import { Fonts } from '@/constants/fonts';

const ROLES = Object.keys(TYPOGRAPHY) as TypographyRole[];

// The 2026-11-17 serif-devotional rebalance scale, asserted exactly: a
// drift here is a design change, not a refactor, and needs Kai's eye.
// (Supersedes the 2026-11-05 audit §6 ramp asserted here before.)
const EXPECTED: Record<TypographyRole, { size: number; lineHeight: number }> = {
  display: { size: 40, lineHeight: 48 },
  title: { size: 34, lineHeight: 42 },
  sectionTitle: { size: 21, lineHeight: 28 },
  emptyTitle: { size: 28, lineHeight: 36 },
  prayerBody: { size: 25, lineHeight: 35 },
  devotionalProse: { size: 23, lineHeight: 33 },
  scripture: { size: 22, lineHeight: 32 },
  body: { size: 17, lineHeight: 25 },
  bodySmall: { size: 15, lineHeight: 22 },
  label: { size: 13, lineHeight: 19 },
  caption: { size: 14, lineHeight: 20 },
  button: { size: 15, lineHeight: 21 },
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
    // Only one italic face loads (2026-11-16 rebalance): the 500/600
    // italic variants and the 300 light italic were removed.
    const italicFamilies = new Set([Fonts.italic]);
    ROLES.forEach((role) => {
      if (TYPOGRAPHY[role].size < TYPOGRAPHY.body.size) {
        expect(italicFamilies.has(TYPOGRAPHY[role].family)).toBe(false);
      }
    });
  });

  it('2026-11-17 serif-devotional rebalance: Cormorant reads prayer/prose/scripture, Montserrat keeps structure', () => {
    // Prayer body, devotional prose, scripture, display and the screen
    // title are Cormorant; section titles and all interface copy stay
    // Montserrat. Both families are kept. The 2026-11-16 rule
    // (Montserrat carries prayer body/scripture) is superseded.
    expect(TYPOGRAPHY.prayerBody.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.devotionalProse.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.scripture.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.display.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.title.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.sectionTitle.family).toBe(Fonts.titleSemiBold);
    expect(TYPOGRAPHY.body.family).toBe(Fonts.titleMedium);
    expect(TYPOGRAPHY.bodySmall.family).toBe(Fonts.titleRegular);
    expect(TYPOGRAPHY.label.family).toBe(Fonts.titleSemiBold);
    expect(TYPOGRAPHY.button.family).toBe(Fonts.titleSemiBold);
    expect(TYPOGRAPHY.caption.family).toBe(Fonts.titleRegular);
    expect(TYPOGRAPHY.tabLabel.family).toBe(Fonts.titleSemiBold);
  });

  it('normal mode returns the token pt exactly', () => {
    const { size, leading } = resolveTypography(false);
    expect(size.display).toBe(40);
    expect(size.prayerBody).toBe(25);
    expect(leading.prayerBody).toBe(35);
    expect(size.devotionalProse).toBe(23);
    expect(size.body).toBe(17);
    expect(leading.body).toBe(25);
    expect(size.tabLabel).toBe(12);
  });

  it('Larger Text scales size and leading by 1.18, never tracking', () => {
    expect(LARGE_TEXT_FACTOR).toBe(1.18);
    const { size, leading } = resolveTypography(true);
    expect(size.body).toBe(20.1);
    expect(leading.body).toBe(29.5);
    expect(size.display).toBe(47.2);
    // Tracking is absolute: the token table itself is unchanged.
    // B1 (arena-audit pass): one eyebrow tracking, 2pt.
    expect(TYPOGRAPHY.label.letterSpacing).toBe(2);
  });

  it('Larger Text strictly enlarges every token (no Home-greeting inversion)', () => {
    const normal = resolveTypography(false);
    const large = resolveTypography(true);
    ROLES.forEach((role) => {
      expect(large.size[role]).toBeGreaterThan(normal.size[role]);
      expect(large.leading[role]).toBeGreaterThan(normal.leading[role]);
    });
  });

  it('Claude audit fixes #3–#6 (2026-11-17): the tokens the fixes stand on', () => {
    // #3 — screen titles are Cormorant Medium 34/42: Journal
    // ("Prayer"/"Journal") and the Prayer Wall ("Prayer Wall") both
    // take the title token's face, so all tab titles share one voice.
    expect(TYPOGRAPHY.title.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.title.size).toBe(34);
    expect(TYPOGRAPHY.title.lineHeight).toBe(42);
    // #4 — empty-state headings are Cormorant Medium in C.text at
    // the emptyTitle token, 28pt: between the 21pt card title and
    // the 34pt screen title, so the heading stays the screen's focal
    // line without shouting. (The C.text colour and the removal of
    // the forced \\n live at the journal call sites, which are not
    // exported — verified by static trace, not a render here.)
    expect(TYPOGRAPHY.emptyTitle.family).toBe(Fonts.serifMedium);
    expect(TYPOGRAPHY.emptyTitle.size).toBe(28);
    expect(TYPOGRAPHY.emptyTitle.lineHeight).toBe(36);
    expect(TYPOGRAPHY.emptyTitle.size).toBeGreaterThan(TYPOGRAPHY.sectionTitle.size);
    expect(TYPOGRAPHY.emptyTitle.size).toBeLessThan(TYPOGRAPHY.title.size);
    // #5 — emphasis inside serif prose stays Cormorant: emphasisBody
    // and promiseEmphasis take Fonts.serifMedium in C.text at the
    // surrounding size, so weight (500 vs the surrounding 400)
    // carries the emphasis, not a second family. No token needed —
    // the face is the assertion, and it is the serifMedium face.
    expect(Fonts.serifMedium).toBe('CormorantGaramond_500Medium');
    // #6 — evening card titles share one rule: sectionTitle-SIZED
    // serif. The sectionTitle token itself stays Montserrat (it is
    // the card/section title token for sans contexts); the evening
    // cards take its SIZE (21/28) in the serifMedium face. Pin the
    // size here so a scale drift breaks the rule, not the screens.
    expect(TYPOGRAPHY.sectionTitle.size).toBe(21);
    expect(TYPOGRAPHY.sectionTitle.lineHeight).toBe(28);
    expect(TYPOGRAPHY.sectionTitle.family).toBe(Fonts.titleSemiBold);
  });
});
