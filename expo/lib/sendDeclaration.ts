import { Share } from 'react-native';
import * as Haptics from 'expo-haptics';
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
    ? "Saw this and thought of you — for when it's heavy."
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
    '— sent from TRIAD Prayer',
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
