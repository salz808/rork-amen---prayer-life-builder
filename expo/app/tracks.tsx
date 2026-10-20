import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Lock } from 'lucide-react-native';
import AnimatedPressable from '@/components/AnimatedPressable';
import LibraryView from '@/components/LibraryView';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';
import { TRACKS, type Track } from '@/mocks/tracks';
import {
  foundationsCompleteFromProgress,
  getActiveTrackId,
  getFrontierStatus,
  isTrackGated,
  resolveEffectiveTrackId,
  setActiveTrackId,
  type FrontierStatus,
} from '@/lib/trackProgress';

export default function TracksScreen() {
  const router = useRouter();
  const C = useColors();
  const { state } = useApp();
  const [activeId, setActiveId] = useState<string>('foundations');
  const [frontierByTrack, setFrontierByTrack] = useState<Record<string, FrontierStatus>>({});

  const foundationsComplete = foundationsCompleteFromProgress(state.progress, state.journeyComplete);
  const effectiveActiveId = resolveEffectiveTrackId(activeId, foundationsComplete);

  useEffect(() => {
    (async () => {
      const id = await getActiveTrackId();
      setActiveId(id);
      const statuses: Record<string, FrontierStatus> = {};
      for (const t of TRACKS) {
        if (t.status === 'live' && t.id !== 'foundations') {
          statuses[t.id] = await getFrontierStatus(t.id);
        }
      }
      setFrontierByTrack(statuses);
    })();
  }, []);

  const select = async (trackId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setActiveTrackId(trackId);
    setActiveId(trackId);
    router.back();
  };

  const liveTracks = TRACKS.filter((t) => t.status === 'live').sort((a, b) => a.order - b.order);
  const soonTracks = TRACKS.filter((t) => t.status === 'coming_soon').sort((a, b) => a.order - b.order);

  const renderLockedCard = (track: Track) => (
    <View
      key={track.id}
      style={[styles.card, styles.lockedCard, { backgroundColor: C.surface, borderColor: C.border }]}
      testID={`track-locked-${track.id}`}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>
          {track.title}
        </Text>
        <View style={[styles.lockBadge, { backgroundColor: C.surfaceAlt }]}>
          <Lock size={12} color={C.textMuted} />
          <Text style={[styles.lockBadgeText, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>LOCKED</Text>
        </View>
      </View>
      <Text style={[styles.cardSub, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
        {track.subtitle} · {track.dayCount} days
      </Text>
      <Text style={[styles.cardDesc, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
        {track.description}
      </Text>
      <Text style={[styles.unlockNote, { color: C.accent, fontFamily: Fonts.titleMedium }]}>
        Unlocks when you finish Foundations
      </Text>
    </View>
  );

  const renderLiveCard = (track: Track) => {
    const isActive = track.id === effectiveActiveId;
    const isFoundations = track.id === 'foundations';
    const status = frontierByTrack[track.id];
    const completedDays = isFoundations
      ? state.progress.filter((p) => p.completed).length
      : status?.completedDays ?? 0;
    const isComplete = isFoundations ? foundationsComplete : status?.isComplete ?? false;
    const pct = Math.min(100, Math.round((completedDays / track.dayCount) * 100));
    const progressLabel = isComplete
      ? 'COMPLETE'
      : `DAY ${Math.min(completedDays + 1, track.dayCount)} OF ${track.dayCount}`;
    return (
      <AnimatedPressable
        key={track.id}
        onPress={() => select(track.id)}
        scaleValue={0.98}
        style={[
          styles.card,
          { backgroundColor: C.surface, borderColor: isActive ? C.accent : C.border },
          isActive && styles.activeCard,
        ]}
        testID={`track-${track.id}`}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: C.text, fontFamily: Fonts.titleBold }]}>
            {track.title}
          </Text>
          {isActive && (
            <View style={[styles.activeBadge, { backgroundColor: C.accent }]}>
              <Text style={[styles.activeText, { fontFamily: Fonts.titleBold }]}>ACTIVE</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardSub, { color: C.accent, fontFamily: Fonts.titleMedium }]}>
          {track.subtitle} · {track.dayCount} days
        </Text>
        <Text style={[styles.cardDesc, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
          {track.description}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: C.border }]}>
          <View style={[styles.progressFill, { backgroundColor: C.accent, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          {progressLabel}
        </Text>
      </AnimatedPressable>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          PRAYER TRACKS
        </Text>
        <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifLight }]}>
          Choose your journey
        </Text>
        <Text style={[styles.sub, { color: C.textMuted, fontFamily: Fonts.italic }]}>
          {foundationsComplete
            ? 'Each track is a complete journey. Foundations is finished — every open journey is yours, switch anytime.'
            : 'Each track is a complete journey. Foundations comes first — finishing it unlocks the rest.'}
        </Text>

        {liveTracks.map((track) =>
          isTrackGated(track.id, foundationsComplete) ? renderLockedCard(track) : renderLiveCard(track),
        )}

        {soonTracks.length > 0 && (
          <>
            <Text style={[styles.soonKicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
              {foundationsComplete ? 'COMING SOON' : 'LOCKED · COMING SOON'}
            </Text>
            {soonTracks.map((track) =>
              foundationsComplete ? (
                <View
                  key={track.id}
                  style={[styles.card, styles.soonCard, { backgroundColor: C.surface, borderColor: C.border }]}
                >
                  <Text style={[styles.cardTitle, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>
                    {track.title}
                  </Text>
                  <Text style={[styles.cardSub, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
                    {track.subtitle} · {track.dayCount} days
                  </Text>
                  <Text style={[styles.cardDesc, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
                    {track.description}
                  </Text>
                </View>
              ) : (
                renderLockedCard(track)
              ),
            )}
          </>
        )}

        <View style={styles.librarySection}>
          <Text style={[styles.kicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
            PRAYER LIBRARY
          </Text>
          <Text style={[styles.libraryTitle, { color: C.text, fontFamily: Fonts.serifLight }]}>
            {TRACKS.find((t) => t.id === effectiveActiveId)?.title ?? 'Foundations'} — day by day
          </Text>
          <LibraryView trackId={effectiveActiveId} embedded />
        </View>

        <AnimatedPressable
          onPress={() => router.back()}
          scaleValue={0.97}
          style={styles.cancel}
          testID="tracks-close"
        >
          <Text style={[styles.cancelText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
            CLOSE
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
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  activeCard: { borderWidth: 2 },
  lockedCard: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 22 },
  activeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { fontSize: 11, color: '#1A1006', letterSpacing: 1 },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockBadgeText: { fontSize: 11, letterSpacing: 1 },
  unlockNote: { fontSize: 13, marginTop: 2 },
  cardSub: { fontSize: 14, marginBottom: 10 },
  cardDesc: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, letterSpacing: 1.5 },
  soonKicker: { fontSize: 11, letterSpacing: 3, marginTop: 12, marginBottom: 12, textAlign: 'center' },
  soonCard: { opacity: 0.6 },
  librarySection: { marginTop: 28 },
  libraryTitle: { fontSize: 22, textAlign: 'center', marginBottom: 16 },
  cancel: { marginTop: 12, padding: 14, alignItems: 'center' },
  cancelText: { fontSize: 13, letterSpacing: 2 },
});
