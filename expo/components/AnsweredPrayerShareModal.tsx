import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Share2, X } from 'lucide-react-native';
import { Fonts } from '@/constants/fonts';
import type { AnsweredPrayer } from '@/types';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { TRIAD_APP_STORE_URL } from '@/lib/sendDeclaration';

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

const SIGN_OFF = 'God is real. Jesus loves you, and your life matters.';

// The exported card is a true 1080x1920 (9:16) Stories canvas — the same
// full-resolution off-screen capture approach as the session share card.
// The on-screen preview renders the identical layout scaled down.
const CARD_W = 1080;
const CARD_H = 1920;

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const PREVIEW_W = Math.max(
  200,
  Math.min(288, WIN_W - 72, (WIN_H - 250) * (CARD_W / CARD_H)),
);

/** Keeps a long prayer from overwhelming the card; the full text still travels in the share message. */
function cardText(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * 9:16 testimony card. Every metric derives from the canvas width, so the
 * preview and the exported 1080x1920 image are the same design at two sizes.
 */
function ShareCard({ prayer, width }: { prayer: AnsweredPrayer; width: number }) {
  const s = width / CARD_W;

  return (
    <View
      style={{
        width,
        height: width * (CARD_H / CARD_W),
        borderRadius: 80 * s,
        borderWidth: 1,
        borderColor: 'rgba(200,137,74,0.28)',
        overflow: 'hidden',
        backgroundColor: '#0D0804',
      }}
    >
      <LinearGradient
        colors={['#1F1409', '#0D0804']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 92 * s,
          paddingTop: 110 * s,
          paddingBottom: 84 * s,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: Fonts.titleBold,
              fontSize: 40 * s,
              letterSpacing: 11 * s,
              color: '#C8894A',
              textAlign: 'center',
            }}
          >
            ANSWERED PRAYER
          </Text>
          <View style={{ marginTop: 30 * s }}>
            <LinearGradient
              colors={['transparent', 'rgba(200,137,74,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: 300 * s, height: 1 }}
            />
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingHorizontal: 8 * s }}>
          <Text
            style={{
              fontFamily: Fonts.titleBold,
              fontSize: 31 * s,
              letterSpacing: 7 * s,
              color: 'rgba(200,137,74,0.85)',
              textAlign: 'center',
              marginBottom: 28 * s,
            }}
          >
            I PRAYED FOR
          </Text>
          <Text
            style={{
              fontFamily: Fonts.serifRegular,
              fontSize: 57 * s,
              lineHeight: 79 * s,
              color: '#F4EDE0',
              textAlign: 'center',
            }}
          >
            &ldquo;{cardText(prayer.request, 150)}&rdquo;
          </Text>

          <View style={{ marginVertical: 52 * s }}>
            <LinearGradient
              colors={['transparent', 'rgba(200,137,74,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: 420 * s, height: 1 }}
            />
          </View>

          <Text
            style={{
              fontFamily: Fonts.titleBold,
              fontSize: 31 * s,
              letterSpacing: 7 * s,
              color: 'rgba(200,137,74,0.85)',
              textAlign: 'center',
              marginBottom: 28 * s,
            }}
          >
            WHAT GOD DID
          </Text>
          <Text
            style={{
              fontFamily: Fonts.serifRegular,
              fontSize: 46 * s,
              lineHeight: 66 * s,
              color: 'rgba(244,237,224,0.92)',
              textAlign: 'center',
            }}
          >
            {cardText(prayer.answer, 300)}
          </Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: Fonts.italic,
              fontSize: 41 * s,
              lineHeight: 56 * s,
              color: 'rgba(244,237,224,0.9)',
              textAlign: 'center',
              marginBottom: 44 * s,
            }}
          >
            {SIGN_OFF}
          </Text>
          <Text
            style={{
              fontFamily: Fonts.titleBold,
              fontSize: 34 * s,
              letterSpacing: 6 * s,
              color: '#C8894A',
              textAlign: 'center',
            }}
          >
            TRIAD PRAYER
          </Text>
          <Text
            style={{
              fontFamily: Fonts.titleLight,
              fontSize: 30 * s,
              letterSpacing: 2 * s,
              color: 'rgba(244,237,224,0.45)',
              textAlign: 'center',
              marginTop: 14 * s,
            }}
          >
            {prayer.date} · My Record of Faithfulness
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Full-screen modal that shares an answered prayer as a 9:16 testimony
 * card (Stories format). On native it captures the full-resolution card
 * as an image (react-native-view-shot, off-screen like the session share
 * card) and opens the system share sheet; on web it falls back to the
 * Web Share API. Nothing is shared until the user taps SHARE — the card
 * only ever carries the words the user themselves wrote.
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

  const shareText = [
    `"${prayer.request}"`,
    '',
    `God answered: ${prayer.answer}`,
    '',
    SIGN_OFF,
    '',
    '— My Record of Faithfulness · TRIAD Prayer',
    TRIAD_APP_STORE_URL,
  ].join('\n');

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
        dialogTitle: 'Share your testimony',
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
        <ShareCard prayer={prayer} width={PREVIEW_W} />

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

      {/* Off-screen full-resolution card for capture — same pattern as session.tsx */}
      <View style={styles.captureWrap} pointerEvents="none">
        {ViewShot ? (
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }}>
            <ShareCard prayer={prayer} width={CARD_W} />
          </ViewShot>
        ) : (
          <View ref={cardRef}>
            <ShareCard prayer={prayer} width={CARD_W} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...absoluteFillObject,
    backgroundColor: 'rgba(4,2,0,0.9)',
  },
  center: {
    ...absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  captureWrap: {
    position: 'absolute',
    left: -5000,
    top: 0,
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
    fontSize: 13,
    letterSpacing: 2,
    color: 'rgba(244,237,224,0.7)',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
