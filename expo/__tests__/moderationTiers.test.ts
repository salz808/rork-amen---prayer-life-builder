import {
  holdCategory,
  isHeldWallPost,
  isSelfHarmHold,
  isThreatHold,
  supportCardVariantForBlock,
  supportCardVariantForHold,
} from '../lib/moderation';

describe('moderation tiers client contract (migration 00019)', () => {
  it('a published post is neither held nor a self-harm hold', () => {
    const post = { hiddenAt: null, hiddenReason: null };
    expect(isHeldWallPost(post)).toBe(false);
    expect(holdCategory(post)).toBeNull();
    expect(isSelfHarmHold(post)).toBe(false);
  });

  it('a tier-2 hold is held, with its category parsed', () => {
    expect(isHeldWallPost({ hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: 'hold:link' })).toBe(true);
    expect(holdCategory({ hiddenReason: 'hold:link' })).toBe('link');
    expect(holdCategory({ hiddenReason: 'hold:contact' })).toBe('contact');
    expect(holdCategory({ hiddenReason: 'hold:money' })).toBe('money');
    expect(holdCategory({ hiddenReason: 'hold:threat' })).toBe('threat');
    expect(holdCategory({ hiddenReason: 'hold:hate' })).toBe('hate');
    // Fix-everything: self_harm parsing was asserted only via the
    // variant path before — assert it directly here, for all six
    // documented categories.
    expect(holdCategory({ hiddenReason: 'hold:self_harm' })).toBe('self_harm');
  });

  it('an unknown hold suffix is not a category (whitelist, G6)', () => {
    const held = { hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: 'hold:foo' };
    expect(holdCategory(held)).toBeNull();
    expect(isSelfHarmHold(held)).toBe(false);
    expect(isThreatHold(held)).toBe(false);
    // Still a held row (hiddenAt), so the generic notice applies —
    // but no card variant may fire.
    expect(isHeldWallPost(held)).toBe(true);
    expect(supportCardVariantForHold(held)).toBeNull();
  });

  it('a report-hidden post is held but is NOT a tier-2 hold', () => {
    const post = { hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: 'reports' };
    expect(isHeldWallPost(post)).toBe(true);
    expect(holdCategory(post)).toBeNull();
    expect(isSelfHarmHold(post)).toBe(false);
  });

  it('only a self-harm hold trips the support-card hook predicate', () => {
    expect(
      isSelfHarmHold({ hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: 'hold:self_harm' }),
    ).toBe(true);
    expect(
      isSelfHarmHold({ hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: 'hold:threat' }),
    ).toBe(false);
    // A self-harm reason without a hidden row is not a hold: the
    // hook must never fire on a stale or partial object.
    expect(isSelfHarmHold({ hiddenAt: null, hiddenReason: 'hold:self_harm' })).toBe(false);
  });

  it('malformed reasons never parse as a hold category', () => {
    expect(holdCategory({ hiddenReason: 'hold:' })).toBeNull();
    expect(holdCategory({ hiddenReason: 'holdself_harm' })).toBeNull();
    expect(holdCategory({ hiddenReason: undefined })).toBeNull();
    expect(holdCategory(null)).toBeNull();
  });

  it('block-wins card fires ONLY on a server-signalled self_harm/threat block', () => {
    // Canonical server shapes (draft 00020 §BLOCK-CARD-SIGNAL).
    expect(supportCardVariantForBlock(new Error('MODERATION_BLOCKED:SELF_HARM: wall text rejected'))).toBe('self_harm');
    expect(supportCardVariantForBlock('MODERATION_BLOCKED:THREAT: wall text rejected')).toBe('threat');
    // Possession joined the signal when its card was approved
    // (2026-10-26), same mechanism, dormant until the server
    // section ships.
    expect(supportCardVariantForBlock('MODERATION_BLOCKED:POSSESSION: wall text rejected')).toBe('possession');
    // Today's live generic block carries no category: no card,
    // generic alert path only — this is the dormant-until-server
    // behaviour, not a bug.
    expect(supportCardVariantForBlock(new Error('MODERATION_BLOCKED: wall text rejected by moderation filter'))).toBeNull();
    // Profanity-only and every non-card category stay generic,
    // even if a future server ever suffixes them.
    expect(supportCardVariantForBlock(new Error('MODERATION_BLOCKED:HATE: wall text rejected'))).toBeNull();
    expect(supportCardVariantForBlock(new Error('MODERATION_BLOCKED:LINK: wall text rejected'))).toBeNull();
    expect(supportCardVariantForBlock(new Error('MODERATION_BLOCKED:MONEY: wall text rejected'))).toBeNull();
    // No client text scan: user text alone — even self-harm
    // wording, even inside an error — must never trigger a card.
    // Only the server-written code does.
    expect(supportCardVariantForBlock(new Error('kill myself'))).toBeNull();
    expect(supportCardVariantForBlock(new Error('something MODERATION_BLOCKED went wrong'))).toBeNull();
    expect(supportCardVariantForBlock(new Error('moderation_blocked:self_harm'))).toBeNull();
    expect(supportCardVariantForBlock(null)).toBeNull();
    expect(supportCardVariantForBlock(undefined)).toBeNull();
    expect(supportCardVariantForBlock(42 as never)).toBeNull();
  });

  it('support-card variant follows the server hold category only', () => {
    const held = (reason: string) => ({ hiddenAt: '2026-10-25T00:00:00Z', hiddenReason: reason });
    expect(supportCardVariantForHold(held('hold:self_harm'))).toBe('self_harm');
    expect(supportCardVariantForHold(held('hold:threat'))).toBe('threat');
    expect(supportCardVariantForHold(held('hold:possession'))).toBe('possession');
    expect(isThreatHold(held('hold:threat'))).toBe(true);
    expect(isThreatHold(held('hold:self_harm'))).toBe(false);
    // Other holds and report-hides keep the generic notice: no card.
    expect(supportCardVariantForHold(held('hold:link'))).toBeNull();
    expect(supportCardVariantForHold(held('hold:money'))).toBeNull();
    expect(supportCardVariantForHold(held('reports'))).toBeNull();
    expect(supportCardVariantForHold({ hiddenAt: null, hiddenReason: null })).toBeNull();
    // A threat reason without a hidden row is not a hold.
    expect(supportCardVariantForHold({ hiddenAt: null, hiddenReason: 'hold:threat' })).toBeNull();
  });
});
