import { getTierFromEntitlements, hasFeature, normalizeEntitlements } from '@/services/entitlements';
import { UserTier } from '@/types';

describe('normalizeEntitlements', () => {
  it('translates the single RevenueCat entitlement to partner', () => {
    expect(normalizeEntitlements(['premium'])).toEqual(['partner']);
  });

  it('normalizes case and whitespace before aliasing', () => {
    expect(normalizeEntitlements([' Premium ', 'PREMIUM'])).toEqual(['partner']);
  });

  it('passes trusted entitlements through and drops unknown ones', () => {
    expect(normalizeEntitlements(['support', 'bogus', 'missions'])).toEqual(['support', 'missions']);
  });

  it('dedupes after aliasing', () => {
    expect(normalizeEntitlements(['premium', 'partner'])).toEqual(['partner']);
  });

  it('returns empty for empty or unknown-only input', () => {
    expect(normalizeEntitlements([])).toEqual([]);
    expect(normalizeEntitlements(['nope'])).toEqual([]);
  });
});

describe('getTierFromEntitlements', () => {
  it('maps premium to the Partner tier', () => {
    expect(getTierFromEntitlements(['premium'])).toBe(UserTier.PARTNER);
  });

  it('returns FREE for no entitlements', () => {
    expect(getTierFromEntitlements([])).toBe(UserTier.FREE);
  });

  it('keeps the highest tier across several grants', () => {
    expect(getTierFromEntitlements(['support', 'premium'])).toBe(UserTier.PARTNER);
    expect(getTierFromEntitlements(['support'])).toBe(UserTier.SUPPORT);
  });
});

describe('hasFeature', () => {
  it('gates the full session history on Partner', () => {
    expect(hasFeature('SESSION_HISTORY', UserTier.PARTNER)).toBe(999);
    expect(hasFeature('SESSION_HISTORY', UserTier.FREE)).toBe(7);
  });
});
