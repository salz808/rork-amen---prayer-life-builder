import {
  SELF_HARM_PRAYER,
  SUPPORT_HOTLINE_NUMBER,
  SUPPORT_HOTLINE_TEL_URL,
  THREAT_PRAYER,
  supportCardContent,
} from '../lib/supportCardContent';
import { WALL_GUIDELINES_TEXT } from '../lib/wallGuidelines';

describe('support card content', () => {
  it('self-harm variant is the Kai-approved prayer, with the Billy Graham number', () => {
    const card = supportCardContent('self_harm');
    expect(card.status).toBe('approved');
    expect(card.prayer).toBe(SELF_HARM_PRAYER);
    expect(card.prayer).toContain('I curse the spirit of death off my life');
    expect(card.prayer).toContain('I receive Your grace to stay');
    expect(SUPPORT_HOTLINE_NUMBER).toBe('888-388-2683');
    expect(SUPPORT_HOTLINE_TEL_URL).toBe('tel:+18883882683');
  });

  it('threat variant is APPROVED as written, addresses murder and rage, and is not the suicide prayer reused', () => {
    const card = supportCardContent('threat');
    expect(card.status).toBe('approved');
    expect(card.prayer).toBe(THREAT_PRAYER);
    expect(card.prayer).not.toBe(SELF_HARM_PRAYER);
    expect(card.prayer).toContain('spirit of murder, rage, and death');
    expect(card.prayer).toContain('reach for help before I act');
    expect(card.prayer).not.toContain('suicidal thought');
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
