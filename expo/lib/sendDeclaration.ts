import { Platform, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import type { DeclarationItem } from '@/mocks/declarations';
import type { Feeling } from '@/mocks/feelingDeclarations';

export const TRIAD_APP_STORE_URL = 'https://apps.apple.com/app/id6767898619';

/**
 * The personal message behind "Send to a friend".
 *
 * Written to read like something a friend would actually send — a warm
 * opener, the declaration itself, its scripture, and a short blessing —
 * never marketing copy. When the send starts from the "When it's heavy"
 * feeling flow, the opener names that moment so the friend knows why
 * this declaration, why now.
 */
export function buildDeclarationSendMessage(
  item: DeclarationItem,
  feeling?: Feeling | null,
): string {
  const opener = feeling
    ? "Saw this and thought of you. For when it's heavy."
    : 'Saw this and thought of you.';

  return [
    opener,
    '',
    `"${item.text}"`,
    '',
    item.scripture,
    '',
    'Praying it over you today.',
    '',
    'Sent from TRIAD Prayer',
    TRIAD_APP_STORE_URL,
  ].join('\n');
}

/** Opens the native share sheet with the personal send-to-a-friend message. */
export function shareDeclarationWithFriend(
  item: DeclarationItem,
  feeling?: Feeling | null,
): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const message = buildDeclarationSendMessage(item, feeling);
  void Share.share({ message, title: 'A truth for you' });
}

/**
 * Shares a captured declaration image (1080x1080 editorial card, built in
 * app/(tabs)/declarations/index.tsx in the same system as the session
 * Share Truth image). The image is the primary path; the text message
 * stays as the fallback whenever image sharing is unavailable or fails,
 * so a share never silently does nothing.
 */
export async function shareDeclarationImageAsync(
  uri: string,
  item: DeclarationItem,
  feeling?: Feeling | null,
): Promise<void> {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'A truth for you',
        UTI: 'public.png',
      });
      return;
    }
    // iOS-only: Share.share supports a file url.
    if (Platform.OS === 'ios') {
      await Share.share({
        url: uri,
        title: 'A truth for you',
        message: buildDeclarationSendMessage(item, feeling),
      });
      return;
    }
  } catch (error) {
    if (__DEV__) console.log('[Declarations] image share failed, falling back to text', error);
  }
  shareDeclarationWithFriend(item, feeling);
}
