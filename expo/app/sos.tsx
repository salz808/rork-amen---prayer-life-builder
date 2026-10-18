import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { SOS_OPTIONS, SosFeeling } from '@/mocks/sos';

export default function SosScreen() {
  const router = useRouter();
  const C = useColors();

  const pick = (feeling: SosFeeling) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/session?mode=sos&feeling=${feeling}`);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          I'M HERE
        </Text>
        <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifLight }]}>
          What's weighing on you?
        </Text>
        <Text style={[styles.sub, { color: C.textMuted, fontFamily: Fonts.italic }]}>
          You don't have to carry this alone. Pick what's closest — we'll pray through it together, right now.
        </Text>

        <View style={styles.options}>
          {SOS_OPTIONS.map((opt) => (
            <AnimatedPressable
              key={opt.id}
              onPress={() => pick(opt.id)}
              scaleValue={0.97}
              style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
              testID={`sos-${opt.id}`}
            >
              <Text style={[styles.label, { color: C.text, fontFamily: Fonts.titleBold }]}>
                {opt.label}
              </Text>
              <Text style={[styles.sublabel, { color: C.textMuted, fontFamily: Fonts.italic }]}>
                {opt.sublabel}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <AnimatedPressable
          onPress={() => router.back()}
          scaleValue={0.97}
          style={styles.cancel}
          testID="sos-cancel"
        >
          <Text style={[styles.cancelText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
            NOT RIGHT NOW
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { padding: 24, paddingTop: 32 },
  kicker: { fontSize: 12, letterSpacing: 3, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 28, textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  options: { gap: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  label: { fontSize: 19, marginBottom: 4 },
  sublabel: { fontSize: 14 },
  cancel: { marginTop: 28, padding: 14, alignItems: 'center' },
  cancelText: { fontSize: 13, letterSpacing: 2 },
});
