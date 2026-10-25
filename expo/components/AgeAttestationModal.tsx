import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/fonts';

/**
 * Shared 13+ attestation modal (audit round 2, hole #4).
 *
 * Used by the startup gate (legacy signed-in users who never saw the auth
 * screen's gate) and the wall-write gate (first Amen / post from any
 * session without a recorded attestation, including anonymous guests).
 * Policy: the social features (Prayer Wall) are 13+; the personal prayer
 * journey is not gated. Declining never bricks the app — it just keeps
 * the wall gated and re-asks next launch / next wall write.
 */
export default function AgeAttestationModal({
  visible,
  onConfirm,
  onDecline,
}: {
  visible: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { fontFamily: Fonts.titleMedium }]}>
            ONE THING FIRST
          </Text>
          <Text style={[styles.body, { fontFamily: Fonts.serifRegular }]}>
            TRIAD Prayer is a community app for ages 13 and up, including the
            public Prayer Wall. To use the community wall, please confirm you
            are 13 or older.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={onConfirm}
          >
            <Text style={[styles.primaryText, { fontFamily: Fonts.titleMedium }]}>
              I AM 13 OR OLDER
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={onDecline}
          >
            <Text style={[styles.secondaryText, { fontFamily: Fonts.titleRegular }]}>
              I&apos;m under 13
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,8,4,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
    fontSize: 18,
    color: '#F4EDE0',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#E8DCC8',
    textAlign: 'center',
    marginBottom: 24,
  },
  primary: {
    width: '100%',
    backgroundColor: '#C8924A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    fontSize: 15,
    color: '#0D0804',
    letterSpacing: 0.5,
  },
  secondary: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 15,
    color: '#F4EDE0',
  },
  pressed: {
    opacity: 0.7,
  },
});
