import React, { useMemo } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import type { SupportCardVariant } from '@/lib/moderation';
import {
  SUPPORT_EMERGENCY_NUMBER,
  SUPPORT_EMERGENCY_TEL_URL,
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
 * except when a self_harm, threat, or possession hold requests it.
 */
export default function SupportCardModal({
  visible,
  variant,
  onClose,
  blocked = false,
}: {
  visible: boolean;
  variant: SupportCardVariant | null;
  onClose: () => void;
  /**
   * Block-wins card (server-signalled only, see
   * supportCardVariantForBlock): the post was REJECTED, not held,
   * so the held line below must not claim it was saved for
   * review — no row exists. Defaults to false (the existing
   * held path); only a server-signalled block sets it true.
   * Prayer, title, and hotline are identical in both cases.
   */
  blocked?: boolean;
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

  const handleEmergencyCall = () => {
    void Linking.openURL(SUPPORT_EMERGENCY_TEL_URL).catch(() => {
      // Same fallback as the hotline button: '911' stays visible
      // in the button text, so a failed dial still leaves the
      // user with a number they can dial by hand.
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
              selectable
              accessibilityRole="text"
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
            <Pressable
              style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
              onPress={handleEmergencyCall}
              testID="support-card-emergency"
              accessibilityRole="button"
              accessibilityLabel="Call 911"
            >
              <Text style={[styles.dangerLine, { fontFamily: Fonts.titleMedium }]}>
                If you are in immediate danger, call {SUPPORT_EMERGENCY_NUMBER}.
              </Text>
            </Pressable>
            <Text style={[styles.heldLine, { fontFamily: Fonts.italic }]}>
              {blocked
                // Kai-approved 2026-10-26: a blocked post has no
                // row, so claiming it was "saved for review" would
                // be false. This states only what is true — it was
                // not shared and will not appear. Never show the
                // held claim for a rejected post.
                ? 'Your post was not shared and will not appear on the wall.'
                : 'Your post was held and will not appear on the wall. It is saved for review. Only you can see it here.'}
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
    dangerButton: {
      // 44pt touch target (same rule as the close button): the
      // emergency line is a tappable dial button, not plain text.
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    dangerLine: {
      fontSize: T.scale(13),
      color: '#F4EDE0',
      textAlign: 'center',
    },
    heldLine: {
      fontSize: T.scale(13),
      lineHeight: T.scale(19),
      color: '#C9BBA6',
      textAlign: 'center',
      marginBottom: 20,
    },
    closeButton: {
      // Fix-everything (minor): 44pt touch target — see guidelines sheet.
      paddingVertical: 14,
      paddingHorizontal: 20,
      minHeight: 44,
      justifyContent: 'center',
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
