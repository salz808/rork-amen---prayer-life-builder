import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react-native';
import AnimatedPressable from '@/components/AnimatedPressable';
import LibraryView from '@/components/LibraryView';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
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
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  const { state } = useApp();
  // Null until the stored active track AND every frontier status have
  // loaded: the first frame used to paint Foundations as active with
  // Day-1 progress labels, then swap once storage resolved.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [frontierByTrack, setFrontierByTrack] = useState<Record<string, FrontierStatus>>({});

  const foundationsComplete = foundationsCompleteFromProgress(state.progress, state.journeyComplete);
  const effectiveActiveId = resolveEffectiveTrackId(activeId ?? 'foundations', foundationsComplete);

  useEffect(() => {
    (async () => {
      try {
        const id = await getActiveTrackId();
        const statuses: Record<string, FrontierStatus> = {};
        for (const t of TRACKS) {
          if (t.status === 'live' && t.id !== 'foundations') {
            statuses[t.id] = await getFrontierStatus(t.id);
          }
        }
        setFrontierByTrack(statuses);
        setActiveId(id);
      } catch {
        setActiveId('foundations');
      }
    })();
  }, []);

  const select = async (trackId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Audit round 3, J-S8: switching tracks used to silently discard the
    // in-progress day's session. Ask first when one exists for another
    // track (or a legacy session that would be dropped on the new screen).
    const s = state.activeSession;
    // Warn exactly when the session screen's clear effect would drop this
    // session: a tracked session for another track, or a legacy no-trackId
    // session moving to a non-Foundations screen.
    if (s && ((s.trackId && s.trackId !== trackId) || (!s.trackId && trackId !== 'foundations'))) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Switch tracks?',
          'Your in-progress day on the current track won’t be saved. Switch anyway?',
          [
            { text: 'Stay', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Switch', style: 'destructive', onPress: () => resolve(true) },
          ],
        );
      });
      if (!proceed) return;
    }
    await setActiveTrackId(trackId);
    setActiveId(trackId);
    router.back();
  };

  const liveTracks = TRACKS.filter((t) => t.status === 'live').sort((a, b) => a.order - b.order);
  const soonTracks = TRACKS.filter((t) => t.status === 'coming_soon').sort((a, b) => a.order - b.order);

  const renderLockedCard = (track: Track) => (
    <View
      key={track.id}
      style={[styles.card, styles.lockedCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
      testID={`track-locked-${track.id}`}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: C.textMuted, fontFamily: Fonts.serifMedium }]}>
          {track.title}
        </Text>
        <View style={[styles.lockBadge, { backgroundColor: C.surface }]}>
          <Lock size={14} color={C.textMuted} />
          <Text style={[styles.lockBadgeText, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>LOCKED</Text>
        </View>
      </View>
      <Text style={[styles.cardSub, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
        {track.subtitle} · {track.dayCount} days
      </Text>
      <Text style={[styles.cardDesc, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
        {track.description}
      </Text>
      <Text style={[styles.unlockNote, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>
        Unlocks when you finish Foundations
      </Text>
    </View>
  );

  // Pre-launch audit M-1: coming_soon tracks used to render through
  // renderLockedCard ("Unlocks when you finish Foundations") before
  // Foundations completed, but they never unlock on completion — they
  // have no days and stay non-tappable. This card makes no unlock claim
  // at all; the unlock line stays only on renderLockedCard, which is now
  // used solely for live tracks gated by isTrackGated.
  const renderComingSoonCard = (track: Track) => (
    <View
      key={track.id}
      style={[styles.card, styles.soonCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
      testID={`track-soon-${track.id}`}
    >
      <Text style={[styles.cardTitle, { color: C.textMuted, fontFamily: Fonts.serifMedium }]}>
        {track.title}
      </Text>
      <Text style={[styles.cardSub, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
        {track.subtitle} · {track.dayCount} days
      </Text>
      <Text style={[styles.cardDesc, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
        {track.description}
      </Text>
      <Text style={[styles.unlockNote, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
        Coming soon
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
          <Text style={[styles.cardTitle, { color: C.text, fontFamily: Fonts.serifMedium }]}>
            {track.title}
          </Text>
          <View style={styles.headerMeta}>
            {isActive && (
              <View style={[styles.activeBadge, { backgroundColor: C.accent }]}>
                <Text style={[styles.activeText, { fontFamily: Fonts.titleBold }]}>ACTIVE</Text>
              </View>
            )}
            <ChevronRight size={18} color={C.chevronMuted} />
          </View>
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

  if (activeId === null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
        <View style={styles.skeletonWrap} testID="tracks-loading-skeleton">
          <View style={[styles.skeletonTitle, { backgroundColor: C.surfaceAlt }]} />
          <View style={[styles.skeletonCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} />
          <View style={[styles.skeletonCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} />
          <View style={[styles.skeletonCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.backRow}>
          <AnimatedPressable
            onPress={() => router.back()}
            scaleValue={0.94}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="tracks-close"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={C.textSecondary} />
          </AnimatedPressable>
        </View>
        <Text style={[styles.kicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          PRAYER TRACKS
        </Text>
        <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifLight }]}>
          Choose your journey
        </Text>
        <Text style={[styles.sub, { color: C.textMuted, fontFamily: Fonts.italic }]}>
          {foundationsComplete
            ? 'Each track is a full journey. Foundations is finished. Every open journey is yours. Come and go as you need.'
            : 'Each track is a full journey. Foundations comes first, then the rest open.'}
        </Text>
        {/* Round-2 H3 disclosure (chosen over cloud sync in this window):
            non-Foundations track progress lives only on this device —
            it is not uploaded by syncAppState, so reinstalling, moving
            to a new device, or clearing app data restarts a track at
            Day 1. Foundations progress, by contrast, is cloud-synced
            and restores on sign-in. A sync payload for track frontier /
            completions would need a new table + merge rule and a
            build-6 interplay check; that is deferred, not silently
            dropped — the limitation is stated here instead. */}
        <Text style={[styles.deviceNote, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
          Note: progress on these journeys is saved on this device only. Foundations progress syncs to your account; track progress does not yet — reinstalling or switching devices restarts a track at Day 1.
        </Text>

        {liveTracks.map((track) =>
          isTrackGated(track.id, foundationsComplete) ? renderLockedCard(track) : renderLiveCard(track),
        )}

        {soonTracks.length > 0 && (
          <>
            <Text style={[styles.soonKicker, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
              COMING SOON
            </Text>
            {soonTracks.map((track) => renderComingSoonCard(track))}
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

      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (T: any) => StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  skeletonWrap: {
    flex: 1,
    padding: 24,
    paddingTop: 12,
    gap: 16,
  },
  skeletonTitle: {
    height: 28,
    width: '60%',
    alignSelf: 'center',
    borderRadius: 8,
    marginBottom: 12,
  },
  skeletonCard: {
    height: 120,
    borderRadius: 18,
    borderWidth: 1,
  },
  content: { padding: 24, paddingTop: 12 },
  backRow: { flexDirection: 'row', marginBottom: 8 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.10)',
  },
  kicker: { fontSize: T.scale(13), letterSpacing: 3, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: T.scale(24), textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: T.scale(14), textAlign: 'center', marginBottom: 28, lineHeight: T.scale(19) },
  deviceNote: { fontSize: T.scale(13), textAlign: 'center', marginBottom: 20, lineHeight: T.scale(18) },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  activeCard: { borderWidth: 2 },
  lockedCard: { borderStyle: 'dashed' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: T.scale(19), flex: 1 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { fontSize: T.scale(13), color: '#1A1006', letterSpacing: 1 },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockBadgeText: { fontSize: T.scale(13), letterSpacing: 1 },
  unlockNote: { fontSize: T.scale(13), marginTop: 2 },
  cardSub: { fontSize: T.scale(14), marginBottom: 10 },
  cardDesc: { fontSize: T.scale(14), lineHeight: T.scale(19), marginBottom: 14 },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: T.scale(13), letterSpacing: 1.5 },
  soonKicker: { fontSize: T.scale(13), letterSpacing: 3, marginTop: 12, marginBottom: 12, textAlign: 'center' },
  soonCard: { borderStyle: 'dashed' },
  librarySection: { marginTop: 28 },
  libraryTitle: { fontSize: T.scale(19), textAlign: 'center', marginBottom: 16 },
});
