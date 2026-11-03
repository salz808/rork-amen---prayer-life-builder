/**
 * Wave 2, fix 6 (feedback #27): persisted Home banner dismissals.
 *
 * Home's smart-reminder / annual-upsell / reminder-setup banners had
 * no dismiss affordance and no dismissal state — tapping one only
 * navigated away, and it came back. Dismissal is stored per banner in
 * AsyncStorage (device-level, so it works for guests as well as
 * signed-in users, and survives restarts and sign-in):
 * - reminder: keyed per suggestion value (`reminder:12:00 PM`), so
 *   dismissing one suggestion does not silence a future, different
 *   suggestion — the banner reappears only when the advice changes.
 * - annual / reminderSetup: keyed bare, so a dismissed banner stays
 *   dismissed while its underlying condition still holds.
 * All storage access is best-effort: a storage failure hides the
 * banner for this session via in-memory state, and the next launch
 * simply shows it again rather than crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'triad_home_banner_dismissed_v1:';

export type DismissibleHomeBanner = 'reminder' | 'annual' | 'reminderSetup';

/** Storage suffix for a banner (variant = the reminder suggestion text). */
export function homeBannerDismissalKey(
  banner: DismissibleHomeBanner,
  variant?: string,
): string {
  return variant != null && variant !== '' ? `${banner}:${variant}` : banner;
}

/** All dismissed banner keys currently in storage (empty on any error). */
export async function loadDismissedHomeBanners(): Promise<Set<string>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return new Set(
      keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length)),
    );
  } catch {
    return new Set();
  }
}

/** Persist a dismissal. Best-effort: callers update in-memory state too. */
export async function dismissHomeBanner(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIX}${key}`, '1');
  } catch {
    // Best-effort only — the in-memory dismissal still hides the banner
    // for this session; it simply reappears on the next launch.
  }
}
