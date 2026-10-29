import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import { WALL_GUIDELINES_TEXT } from '@/lib/wallGuidelines';

/**
 * Wall guidelines sheet — opened only from the small "Wall
 * guidelines" affordance inside the wall composer. Deliberately
 * NOT a permanent banner: Kai wants the wall uncluttered, and the
 * rules text lives one quiet tap away instead of above every post.
 * The text itself is Kai-approved verbatim (lib/wallGuidelines.ts).
 */
export default function WallGuidelinesSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} testID="wall-guidelines-sheet">
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={[styles.title, { fontFamily: Fonts.titleMedium }]}>
              WALL GUIDELINES
            </Text>
            <Text
              style={[styles.body, { fontFamily: Fonts.serifRegular }]}
              testID="wall-guidelines-text"
              selectable
            >
              {WALL_GUIDELINES_TEXT}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={onClose}
              testID="wall-guidelines-close"
              accessibilityRole="button"
              accessibilityLabel="Close wall guidelines"
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
    body: {
      fontSize: T.scale(16),
      lineHeight: T.scale(24),
      color: '#E8DCC8',
      textAlign: 'center',
      marginBottom: 24,
    },
    closeButton: {
      // Fix-everything (minor): 44pt touch target — 10pt padding
      // plus 13pt text came to ~33pt tall.
      paddingVertical: 14,
      paddingHorizontal: 20,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: T.scale(14.5),
      color: '#F4EDE0',
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
