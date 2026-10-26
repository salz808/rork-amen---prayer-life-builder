import React, { useMemo } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import type { SupportCardVariant } from '@/lib/moderation';
import {
  SUPPORT_HOTLINE_NAME,
  SUPPORT_HOTLINE_NUMBER,
  SUPPORT_HOTLINE_TEL_URL,
  supportCardContent,
} from '@/lib/supportCardContent';

/**
 * Support card — shown ONLY on a triggered wall hold, rendered once
 * from the root layout and driven by AppProvider context.
 *
 * Order on the card is deliberate (Kai's direction): the prayer
 * first, then the call button, then the quiet immediate-danger
 * line. The held post stays held and never publishes, whether the
 * user calls, closes, or does nothing — closing this card is not
 * publishing, and calling is not publishing.
 *
 * No SOS/crisis banner anywhere else: this modal is never rendered
 * except when a self_harm or threat hold requests it.
 */
export default function SupportCardModal({
  visible,
  variant,
  onClose,
}: {
  visible: boolean;
  variant: SupportCardVariant | null;
  onClose: () => void;
}) {
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  const content = variant ? supportCardContent(variant) : null;

  const handleCall = () => {
    void Linking.openURL(SUPPORT_HOTLINE_TEL_URL).catch(() => {
      // The number stays visible on the button, so a failed dial
      // still leaves the user with something they can dial by hand.
    });
  };

  if (!content) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} testID="support-card-modal">
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={[styles.title, { fontFamily: Fonts.titleMedium }]}>
              {content.title.toUpperCase()}
            </Text>
            <Text
              style={[styles.prayer, { fontFamily: Fonts.serifRegular }]}
              testID="support-card-prayer"
            >
              {content.prayer}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
              onPress={handleCall}
              testID="support-card-call"
              accessibilityRole="button"
              accessibilityLabel={`Call ${SUPPORT_HOTLINE_NAME} at ${SUPPORT_HOTLINE_NUMBER}`}
            >
              <Text style={[styles.callButtonText, { fontFamily: Fonts.titleBold }]}>
                CALL {SUPPORT_HOTLINE_NUMBER}
              </Text>
              <Text style={[styles.callButtonSub, { fontFamily: Fonts.titleMedium }]}>
                {SUPPORT_HOTLINE_NAME}
              </Text>
            </Pressable>
            <Text style={[styles.dangerLine, { fontFamily: Fonts.titleMedium }]}>
              If you are in immediate danger, call 911.
            </Text>
            <Text style={[styles.heldLine, { fontFamily: Fonts.italic }]}>
              Your post was held and will not appear on the wall. It is saved for the care team to review.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={onClose}
              testID="support-card-close"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={[styles.closeButtonText, { fontFamily: Fonts.titleMedium }]}>
                CLOSE
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(T: any) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(13,8,4,0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    cardScroll: {
      width: '100%',
      maxHeight: '88%',
    },
    cardScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    card: {
      width: '100%',
      backgroundColor: '#1A1006',
      borderWidth: 1,
      borderColor: '#C8924A',
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
    },
    title: {
      fontSize: T.scale(16),
      color: '#F4EDE0',
      letterSpacing: 1,
      marginBottom: 16,
      textAlign: 'center',
    },
    prayer: {
      fontSize: T.scale(16),
      lineHeight: T.scale(24),
      color: '#E8DCC8',
      textAlign: 'center',
      marginBottom: 24,
    },
    callButton: {
      width: '100%',
      backgroundColor: '#C8924A',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 16,
    },
    callButtonText: {
      fontSize: T.scale(13),
      color: '#0D0804',
      letterSpacing: 0.5,
    },
    callButtonSub: {
      fontSize: T.scale(13),
      color: '#0D0804',
      marginTop: 2,
    },
    dangerLine: {
      fontSize: T.scale(13),
      color: '#F4EDE0',
      textAlign: 'center',
      marginBottom: 12,
    },
    heldLine: {
      fontSize: T.scale(13),
      lineHeight: T.scale(19),
      color: '#C9BBA6',
      textAlign: 'center',
      marginBottom: 20,
    },
    closeButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: T.scale(13),
      color: '#F4EDE0',
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
