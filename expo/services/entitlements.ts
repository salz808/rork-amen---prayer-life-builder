import { UserTier } from '@/types';

export const TRUSTED_ENTITLEMENTS = ['support', 'missions', 'partner'] as const;

export type TrustedEntitlement = (typeof TRUSTED_ENTITLEMENTS)[number];

/**
 * Entitlement identifiers granted by RevenueCat that are aliases of a
 * trusted entitlement. The RevenueCat project has exactly ONE entitlement —
 * 'premium' — attached to every product, including the Partner pair the app
 * sells (triad_missions_monthly / triad_missions_annual). Incoming 'premium'
 * grants are therefore translated to the 'partner' entitlement here, the
 * single normalization point every consumer reads through, so a RevenueCat
 * 'premium' grant behaves exactly like a 'partner' grant downstream.
 */
const ENTITLEMENT_ALIASES: Record<string, TrustedEntitlement> = {
  premium: 'partner',
};

export type FeatureKey =
  | 'SESSION_HISTORY' // Returns max days: 7, 30, or 999
  | 'DARK_MODE'
  | 'AMBIENT_SOUNDSCAPES_COUNT' // Returns max count: 1, 2, 3, 4
  | 'PLAYBACK_SPEED_RANGE' // Returns range: '1x', 'limited', 'standard', 'full'
  | 'VOICEOVER'
  | 'DAILY_PRAYER_POST_30'
  | 'STREAK_HEATMAP'
  | 'BROWSE_LIBRARY'
  | 'RETREAT_MODE'
  | 'MONASTIC_THEME';

/**
 * There is now a single paid tier (Partner, $4.99/mo · $39.99/yr), sold as
 * the triad_missions_monthly / triad_missions_annual products. RevenueCat
 * grants that tier through its single 'premium' entitlement, translated to
 * 'partner' in normalizeEntitlements (see ENTITLEMENT_ALIASES). The trusted
 * 'missions' and 'partner' identifiers also map to the Partner tier, and
 * legacy 'support' keeps its smaller perk set.
 */
export const TIER_HIERARCHY: Record<TrustedEntitlement, UserTier> = {
  support: UserTier.SUPPORT,
  missions: UserTier.PARTNER,
  partner: UserTier.PARTNER,
};

export function normalizeEntitlements(entitlements: string[]): TrustedEntitlement[] {
  const normalized = entitlements
    .map((entitlement) => entitlement.trim().toLowerCase())
    .map((entitlement) => ENTITLEMENT_ALIASES[entitlement] ?? entitlement)
    .filter((entitlement): entitlement is TrustedEntitlement => TRUSTED_ENTITLEMENTS.includes(entitlement as TrustedEntitlement));

  return Array.from(new Set(normalized));
}

/**
 * Returns the highest tier level based on active entitlements
 */
export function getTierFromEntitlements(entitlements: string[]): UserTier {
  let highest = UserTier.FREE;
  for (const ent of normalizeEntitlements(entitlements)) {
    const level = TIER_HIERARCHY[ent];
    if (level !== undefined && level > highest) {
      highest = level;
    }
  }
  return highest;
}

/**
 * Check if a feature is available for a given tier.
 *
 * F39 (owner ruling): Daily Prayer Mode is FREE for all graduates — anyone
 * who has completed the 30-day journey gets DAILY_PRAYER_POST_30 regardless
 * of tier. Callers that know the user's journey status pass `isGraduate`;
 * the tier check remains as a fallback for callers that don't. Voiceover
 * and the streak heat map stay tier-gated — they are separate features.
 */
export function hasFeature(feature: FeatureKey, tier: UserTier, isGraduate: boolean = false): boolean | number | string {
  switch (feature) {
    case 'SESSION_HISTORY':
      if (tier >= UserTier.MISSIONS) return 999;
      if (tier >= UserTier.SUPPORT) return 30;
      return 7;

    case 'DARK_MODE':
      return tier >= UserTier.SUPPORT;

    case 'AMBIENT_SOUNDSCAPES_COUNT':
      if (tier === UserTier.PARTNER) return 4;
      if (tier === UserTier.MISSIONS) return 3;
      if (tier === UserTier.SUPPORT) return 2;
      return 1;

    case 'PLAYBACK_SPEED_RANGE':
      if (tier === UserTier.PARTNER) return 'full'; // 0.5x–2x
      if (tier === UserTier.MISSIONS) return 'standard'; // 0.5x–1.5x
      if (tier >= UserTier.SUPPORT) return 'limited'; // 0.8x–1.2x
      return '1x';

    case 'VOICEOVER':
    case 'STREAK_HEATMAP':
      return tier >= UserTier.MISSIONS;

    case 'DAILY_PRAYER_POST_30':
      return isGraduate || tier >= UserTier.MISSIONS;

    case 'BROWSE_LIBRARY':
    case 'RETREAT_MODE':
    case 'MONASTIC_THEME':
      return tier >= UserTier.PARTNER;

    default:
      return false;
  }
}

/**
 * Helper to get feature requirement description for the UI
 */
export function getFeatureRequirement(_feature: FeatureKey): string {
  return 'Partner';
}
