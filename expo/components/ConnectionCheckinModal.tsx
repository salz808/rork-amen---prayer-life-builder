import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/providers/AppProvider';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';

const GOLD = '#C8894A';
const SCALE_LABELS = ['Distant', 'Far', 'Present', 'Near', 'Close'];

/**
 * Periodic self-measurement: one honest question — "How connected do you feel
 * to God right now?" — answered on a 1-5 scale. Answers are charted in the
 * journal so the user can see change over their journey.
 */
export default function ConnectionCheckinModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { addConnectionCheckin } = useApp();
  const [submitted, setSubmitted] = useState<number | null>(null);
  // Lane D (PL-H12): house pattern so Larger Text scales this modal.
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);

  useEffect(() => {
    if (!visible) {
      setSubmitted(null);
    }
  }, [visible]);

  const handleSelect = (score: number) => {
    if (submitted !== null) {
      return;
    }
    setSubmitted(score);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addConnectionCheckin(score);
    setTimeout(onClose, 1600);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitted === null ? onClose : undefined}
        />
        {/* M41: same 88%-bounded ScrollView pattern as SupportCardModal /
            AgeAttestationModal, so the card scrolls instead of clipping
            on small-height / large-text screens. The backdrop Pressable
            above still dismisses taps outside the scroll region. */}
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.card}>
          {submitted === null ? (
            <>
              <Text style={[styles.eyebrow, { fontFamily: Fonts.titleBold }]}>ONE HONEST QUESTION</Text>
              <Text style={[styles.question, { fontFamily: Fonts.italic }]}>
                How connected do you feel to God right now?
              </Text>
              <Text style={[styles.sub, { fontFamily: Fonts.titleLight }]}>
                There&apos;s no wrong answer. This is just between you and Him.
              </Text>
              <View style={styles.scaleRow}>
                {SCALE_LABELS.map((label, index) => {
                  const score = index + 1;
                  return (
                    <Pressable
                      key={label}
                      style={styles.scaleItem}
                      onPress={() => handleSelect(score)}
                      testID={`checkin-score-${score}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${score}, ${label}`}
                    >
                      <View style={styles.scaleDot}>
                        <Text style={[styles.scaleNum, { fontFamily: Fonts.titleBold }]}>{score}</Text>
                      </View>
                      <Text style={[styles.scaleLabel, { fontFamily: Fonts.titleLight }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={styles.skipBtn} testID="checkin-skip">
                <Text style={[styles.skip, { fontFamily: Fonts.titleMedium }]}>Not right now</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.thanksEmoji}>🕊</Text>
              <Text style={[styles.thanksTitle, { fontFamily: Fonts.serifLight }]}>
                Thank you for your honesty.
              </Text>
              <Text style={[styles.thanksSub, { fontFamily: Fonts.italic }]}>
                Your answer is charted in your journal — so you can see change, not guess at it.
              </Text>
            </>
          )}
        </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(T: any) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,2,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  cardScroll: {
    width: '100%',
    maxHeight: '88%',
  },
  cardScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#171009',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    borderRadius: 24,
    padding: 26,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: T.scale(14.5),
    letterSpacing: 2.5,
    color: GOLD,
  },
  question: {
    fontSize: T.scale(18),
    lineHeight: T.scale(26),
    color: '#F4EDE0',
    textAlign: 'center',
    marginTop: 14,
  },
  sub: {
    fontSize: T.scale(14.5),
    lineHeight: T.scale(20),
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    marginTop: 10,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 24,
  },
  scaleItem: {
    alignItems: 'center',
    gap: 8,
  },
  scaleDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.4)',
    backgroundColor: 'rgba(200,137,74,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleNum: {
    fontSize: T.scale(14.5),
    color: '#F4EDE0',
  },
  scaleLabel: {
    fontSize: T.scale(14.5),
    letterSpacing: 0.3,
    color: 'rgba(244,237,224,0.8)',
  },
  skipBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 22,
  },
  skip: {
    fontSize: T.scale(14.5),
    letterSpacing: 1,
    color: 'rgba(244,237,224,0.8)',
  },
  // Intentionally fixed: thanks emoji glyph size, not reading text (lane D).
  thanksEmoji: {
    fontSize: 30,
  },
  thanksTitle: {
    fontSize: T.scale(19),
    color: '#F4EDE0',
    textAlign: 'center',
    marginTop: 12,
  },
  thanksSub: {
    fontSize: T.scale(14.5),
    lineHeight: T.scale(20),
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    marginTop: 10,
  },
  });
}
