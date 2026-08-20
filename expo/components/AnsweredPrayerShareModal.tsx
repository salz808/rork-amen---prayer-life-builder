import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Share2, X } from 'lucide-react-native';
import { Fonts } from '@/constants/fonts';
import type { AnsweredPrayer } from '@/types';

let ViewShot: React.ComponentType<{
  ref?: React.Ref<any>;
  options?: { format: string; quality: number };
  children?: React.ReactNode;
}> | null = null;
let _captureRef: ((ref: React.RefObject<any>, options?: { format: string; quality: number }) => Promise<string>) | null = null;

/** Loads react-native-view-shot lazily; silently unavailable on platforms without it. */
function ensureViewShot(): boolean {
  if (ViewShot && _captureRef) {
    return true;
  }
  try {
    const rvs = require('react-native-view-shot');
    ViewShot = rvs.default ?? rvs;
    _captureRef = rvs.captureRef;
  } catch {
    ViewShot = null;
    _captureRef = null;
  }
  return Boolean(ViewShot && _captureRef);
}

ensureViewShot();

const CARD_WIDTH = 330;

function ShareCard({ prayer }: { prayer: AnsweredPrayer }) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#1F1409', '#0D0804']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardInner}>
        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleBold }]}>TRIAD PRAYER</Text>

        <View style={styles.badgeRow}>
          <View style={styles.answeredBadge}>
            <Text style={[styles.answeredBadgeText, { fontFamily: Fonts.titleBold }]}>🙌 ANSWERED</Text>
          </View>
        </View>

        <Text style={[styles.request, { fontFamily: Fonts.italic }]}>&ldquo;{prayer.request}&rdquo;</Text>

        <View style={styles.dividerWrap}>
          <LinearGradient
            colors={['transparent', 'rgba(200,137,74,0.6)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.divider}
          />
        </View>

        <Text style={[styles.answerLabel, { fontFamily: Fonts.titleBold }]}>WHAT GOD DID</Text>
        <Text style={[styles.answer, { fontFamily: Fonts.serifRegular }]}>{prayer.answer}</Text>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { fontFamily: Fonts.titleLight }]}>{prayer.date} · TRIAD Prayer</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Full-screen modal that renders a beautiful, shareable card for an answered
 * prayer. On native it captures the card as an image (react-native-view-shot)
 * and opens the system share sheet; on web it falls back to the Web Share API.
 */
export default function AnsweredPrayerShareModal({
  prayer,
  onClose,
}: {
  prayer: AnsweredPrayer | null;
  onClose: () => void;
}) {
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);

  if (!prayer) {
    return null;
  }

  const shareText = `"${prayer.request}"\n\nGod answered: ${prayer.answer}\n\n— My Record of Faithfulness · TRIAD Prayer`;

  const handleShare = async () => {
    if (isSharing) {
      return;
    }
    setIsSharing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (Platform.OS === 'web') {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: 'An answered prayer', text: shareText });
        } else if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(shareText);
          Alert.alert('Copied', 'Your answered prayer was copied to the clipboard.');
        } else {
          Alert.alert('Sharing unavailable', 'Your browser does not support sharing. Please try on the mobile app.');
        }
        return;
      }

      if (!_captureRef || !cardRef.current) {
        Alert.alert('Sharing unavailable', 'Please try again in a moment.');
        return;
      }

      const uri = await _captureRef(cardRef, { format: 'png', quality: 1 });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your answered prayer',
      });
    } catch (error) {
      if (__DEV__) {
        console.log('[AnsweredPrayerShare] failed:', error);
      }
      Alert.alert('Sharing failed', 'We could not open the share sheet. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <View style={styles.center} pointerEvents="box-none">
        {ViewShot ? (
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }}>
            <ShareCard prayer={prayer} />
          </ViewShot>
        ) : (
          <ShareCard prayer={prayer} />
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.shareBtn, isSharing && styles.btnDisabled]}
            onPress={() => void handleShare()}
            disabled={isSharing}
            testID="answered-share-button"
          >
            <Share2 size={16} color="#0D0804" strokeWidth={2.4} />
            <Text style={[styles.shareBtnText, { fontFamily: Fonts.titleBold }]}>
              {isSharing ? 'PREPARING…' : 'SHARE'}
            </Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={onClose} testID="answered-share-close">
            <X size={15} color="rgba(244,237,224,0.6)" strokeWidth={2} />
            <Text style={[styles.closeBtnText, { fontFamily: Fonts.titleMedium }]}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,2,0,0.9)',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.28)',
    overflow: 'hidden',
    backgroundColor: '#0D0804',
  },
  cardInner: {
    padding: 30,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 4,
    color: '#C8894A',
    textAlign: 'center',
  },
  badgeRow: {
    alignItems: 'center',
    marginTop: 18,
  },
  answeredBadge: {
    backgroundColor: 'rgba(200,137,74,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.4)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  answeredBadgeText: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: '#C8894A',
  },
  request: {
    fontSize: 21,
    lineHeight: 30,
    color: '#F4EDE0',
    textAlign: 'center',
    marginTop: 20,
  },
  dividerWrap: {
    marginTop: 22,
    marginBottom: 22,
    alignItems: 'center',
  },
  divider: {
    width: 180,
    height: 1,
  },
  answerLabel: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: '#C8894A',
    textAlign: 'center',
    marginBottom: 10,
  },
  answer: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(244,237,224,0.88)',
    textAlign: 'center',
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 1,
    color: 'rgba(244,237,224,0.45)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C8894A',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 30,
  },
  shareBtnText: {
    fontSize: 13,
    letterSpacing: 2,
    color: '#0D0804',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(244,237,224,0.25)',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  closeBtnText: {
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(244,237,224,0.7)',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
