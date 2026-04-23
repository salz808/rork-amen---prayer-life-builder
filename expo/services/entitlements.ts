import { UserTier } from '@/types';

export const TRUSTED_ENTITLEMENTS = ['support', 'missions', 'partner'] as const;

export type TrustedEntitlement = (typeof TRUSTED_ENTITLEMENTS)[number];

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

export const TIER_HIERARCHY: Record<TrustedEntitlement, UserTier> = {
  support: UserTier.SUPPORT,
  missions: UserTier.MISSIONS,
  partner: UserTier.PARTNER,
};

export function normalizeEntitlements(entitlements: string[]): TrustedEntitlement[] {
  const normalized = entitlements
    .map((entitlement) => entitlement.trim().toLowerCase())
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
 * Check if a feature is available for a given tier
 */
export function hasFeature(feature: FeatureKey, tier: UserTier): boolean | number | string {
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
    case 'DAILY_PRAYER_POST_30':
    case 'STREAK_HEATMAP':
      return tier >= UserTier.MISSIONS;

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
export function getFeatureRequirement(feature: FeatureKey): string {
  switch (feature) {
    case 'DARK_MODE':
    case 'PLAYBACK_SPEED_RANGE':
      return 'Support Level';
    case 'VOICEOVER':
    case 'DAILY_PRAYER_POST_30':
    case 'STREAK_HEATMAP':
      return 'Missions Level';
    case 'BROWSE_LIBRARY':
    case 'RETREAT_MODE':
    case 'MONASTIC_THEME':
      return 'Partner Level';
    default:
      return 'a subscription';
  }
}
