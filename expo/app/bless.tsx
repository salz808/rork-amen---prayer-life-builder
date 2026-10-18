import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';
import { getHtmlDay } from '@/mocks/content';
import { DECLARATIONS } from '@/mocks/declarations';

type BlessSource = 'truth' | 'verse' | 'declaration';

export default function BlessScreen() {
  const router = useRouter();
  const C = useColors();
  const { state } = useApp();
  const [source, setSource] = useState<BlessSource>('truth');
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<any>(null);

  const dayData = useMemo(() => getHtmlDay(state.currentDay), [state.currentDay]);
  const declaration = useMemo(() => {
    const idx = Math.floor(Math.random() * DECLARATIONS.length);
    return DECLARATIONS[idx];
  }, []);

  const blessContent = useMemo(() => {
    switch (source) {
      case 'truth':
        return { label: 'THE TRUTH', text: dayData.identity, sub: dayData.verse };
      case 'verse':
        return { label: 'THE WORD', text: dayData.verse, sub: `Day ${state.currentDay} · ${dayData.title}` };
      case 'declaration':
        return { label: 'DECLARE THIS', text: declaration.text, sub: declaration.scripture ?? 'TRIAD Prayer' };
    }
  }, [source, dayData, declaration, state.currentDay]);

  const handleSend = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await cardRef.current?.capture?.();
      const message = `${note.trim() ? note.trim() + '\n\n' : ''}${blessContent.label}\n"${blessContent.text}"\n\n${blessContent.sub}\n\n— Sent with love from TRIAD Prayer`;

      if (uri) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { dialogTitle: 'Send this blessing' });
          setSharing(false);
          return;
        }
      }
      await Share.share({ message, title: 'A blessing for you' });
    } catch {
      Alert.alert('Could not send', 'Something went wrong. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const SourceTab = ({ id, label }: { id: BlessSource; label: string }) => (
    <AnimatedPressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSource(id);
      }}
      scaleValue={0.96}
      style={[
        styles.tab,
        { borderColor: C.border },
        source === id && { backgroundColor: C.accent, borderColor: C.accent },
      ]}
      testID={`bless-tab-${id}`}
    >
      <Text
        style={[
          styles.tabText,
          { fontFamily: Fonts.titleMedium, color: source === id ? '#1A1006' : C.textMuted },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          SEND A BLESSING
        </Text>
        <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifLight }]}>
          Who needs this today?
        </Text>
        <Text style={[styles.sub, { color: C.textMuted, fontFamily: Fonts.italic }]}>
          Pick a truth, add your words, send it straight to them.
        </Text>

        <View style={styles.tabs}>
          <SourceTab id="truth" label="Truth" />
          <SourceTab id="verse" label="Verse" />
          <SourceTab id="declaration" label="Declaration" />
        </View>

        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.cardWrap}>
          <View style={[styles.card, { backgroundColor: C.background }]}>
            <Text style={[styles.cardLabel, { fontFamily: Fonts.titleBold, color: C.accent }]}>
              {blessContent.label}
            </Text>
            <Text style={[styles.cardText, { fontFamily: Fonts.serifSemiBold, color: C.text }]}>
              "{blessContent.text}"
            </Text>
            <Text style={[styles.cardSub, { fontFamily: Fonts.serifRegular, color: C.textMuted }]}>
              {blessContent.sub}
            </Text>
            <Text style={[styles.cardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>
              TRIAD PRAYER
            </Text>
          </View>
        </ViewShot>

        <TextInput
          style={[styles.noteInput, { backgroundColor: C.surface, borderColor: C.border, color: C.text, fontFamily: Fonts.serifRegular }]}
          placeholder="Add your own words (optional)…"
          placeholderTextColor={C.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={280}
          testID="bless-note"
        />

        <AnimatedPressable
          onPress={handleSend}
          scaleValue={0.97}
          style={[styles.sendBtn, { backgroundColor: C.accent, opacity: sharing ? 0.6 : 1 }]}
          testID="bless-send"
        >
          <Text style={[styles.sendText, { fontFamily: Fonts.titleBold }]}>
            {sharing ? 'PREPARING…' : 'SEND BLESSING'}
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => router.back()}
          scaleValue={0.97}
          style={styles.cancel}
          testID="bless-cancel"
        >
          <Text style={[styles.cancelText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
            NOT NOW
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
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: { fontSize: 14 },
  cardWrap: { alignItems: 'center', marginBottom: 20 },
  card: {
    width: 300,
    height: 300,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 11, letterSpacing: 3, marginBottom: 12 },
  cardText: { fontSize: 18, textAlign: 'center', lineHeight: 26, marginBottom: 12 },
  cardSub: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  cardWatermark: { fontSize: 10, letterSpacing: 2 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  sendBtn: {
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 8,
  },
  sendText: { fontSize: 16, color: '#1A1006', letterSpacing: 1 },
  cancel: { padding: 14, alignItems: 'center' },
  cancelText: { fontSize: 13, letterSpacing: 2 },
});
