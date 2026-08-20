import { Alert, Linking, Platform } from 'react-native';

/**
 * Numeric Apple ID for TRIAD Prayer. Filled once the App Store listing is
 * live — until then the review prompt silently skips itself.
 */
const APP_STORE_ID = '';

export function getWriteReviewUrl(): string | null {
  if (Platform.OS !== 'ios' || !APP_STORE_ID) {
    return null;
  }
  return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
}

/**
 * One-time "rate us" prompt. Only fires on iOS devices once the App Store ID
 * is set; frequency gating (once per app lifetime) is handled by the caller.
 */
export function showAppReviewPrompt(): void {
  const url = getWriteReviewUrl();
  if (!url) {
    return;
  }

  Alert.alert(
    'Enjoying TRIAD?',
    'Seven days of prayer is no small thing. A quick review helps others find their way here.',
    [
      { text: 'Maybe Later', style: 'cancel' },
      {
        text: 'Leave a Review',
        onPress: () => {
          void Linking.openURL(url).catch(() => undefined);
        },
      },
    ],
  );
}
