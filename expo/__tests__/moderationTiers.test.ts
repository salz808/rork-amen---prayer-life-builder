import { holdCategory, isHeldWallPost, isSelfHarmHold } from '../lib/moderation';

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
});
