import {
  POSSESSION_PRAYER,
  SELF_HARM_PRAYER,
  SUPPORT_EMERGENCY_NUMBER,
  SUPPORT_EMERGENCY_TEL_URL,
  SUPPORT_HOTLINE_NUMBER,
  SUPPORT_HOTLINE_TEL_URL,
  THREAT_PRAYER,
  supportCardContent,
} from '../lib/supportCardContent';
import { WALL_GUIDELINES_TEXT } from '../lib/wallGuidelines';

describe('support card content', () => {
  it('self-harm variant is the Kai-approved prayer, with the Billy Graham number', () => {
    const card = supportCardContent('self_harm');
    expect(card?.status).toBe('approved');
    expect(card?.prayer).toBe(SELF_HARM_PRAYER);
    expect(card?.prayer).toContain('I curse the spirit of death off my life');
    expect(card?.prayer).toContain('I receive Your grace to stay');
    expect(SUPPORT_HOTLINE_NUMBER).toBe('888-388-2683');
    expect(SUPPORT_HOTLINE_TEL_URL).toBe('tel:+18883882683');
  });

  it('threat variant is APPROVED as written, addresses murder and rage, and is not the suicide prayer reused', () => {
    const card = supportCardContent('threat');
    expect(card?.status).toBe('approved');
    expect(card?.prayer).toBe(THREAT_PRAYER);
    expect(card?.prayer).not.toBe(SELF_HARM_PRAYER);
    expect(card?.prayer).toContain('spirit of murder, rage, and death');
    expect(card?.prayer).toContain('reach for help before I act');
    expect(card?.prayer).not.toContain('suicidal thought');
  });

  it('possession variant is the Kai-approved prayer (2026-10-26), with the edited ending', () => {
    const card = supportCardContent('possession');
    expect(card?.status).toBe('approved');
    expect(card?.prayer).toBe(POSSESSION_PRAYER);
    expect(card?.prayer).not.toBe(SELF_HARM_PRAYER);
    expect(card?.prayer).not.toBe(THREAT_PRAYER);
    expect(card?.prayer).toContain('I command every unclean spirit tormenting me to leave me now, and not return');
    expect(card?.prayer).toContain('I plead the blood of Jesus over me, over my mind, and over my home');
    // Kai's one edit to the draft: the closing line.
    expect(card?.prayer).toMatch(/In Jesus' name, amen\.$/);
    expect(card?.title).toBe('Pray this with us');
  });

  it('911 emergency constants are the values the tappable modal button dials', () => {
    // Pure-helper proxy for modal tappability: SupportCardModal's
    // emergency Pressable (testID support-card-emergency,
    // accessibilityRole button, accessibilityLabel "Call 911",
    // minHeight 44) dials exactly this URL, and the visible
    // "call 911" text uses exactly this number. The Pressable
    // itself is RN UI, not unit-testable as a pure helper; the
    // constants it dials are pinned here so a drift breaks a
    // test instead of silently dialling the wrong number.
    expect(SUPPORT_EMERGENCY_NUMBER).toBe('911');
    expect(SUPPORT_EMERGENCY_TEL_URL).toBe('tel:911');
  });

  it('card titles are unchanged: self-harm leads with "Pray this with us", threat as approved', () => {
    expect(supportCardContent('self_harm')?.title).toBe('Pray this with us');
    expect(supportCardContent('threat')?.title).toBe('Pray this before you act');
  });

  it('an unknown variant renders no card, never the self-harm prayer by fallthrough', () => {
    // Fix-everything (latent): supportCardContent used to fall
    // through to the self-harm prayer for any non-threat variant.
    expect(supportCardContent('bogus' as never)).toBeNull();
  });

  it('wall guidelines text is the Kai-approved wording, verbatim', () => {
    expect(WALL_GUIDELINES_TEXT).toBe(
      "The wall is for honest prayer requests, testimony of answered prayer, encouragement, and amen. " +
        "Please don't post harassment, threats, or hate; sexual or graphic content; spam, links, or money asks; " +
        "your phone, email, or address, or anyone else's; or pretend to be someone else. " +
        'Posts that break this are blocked or held for review, not published.',
    );
  });
});
