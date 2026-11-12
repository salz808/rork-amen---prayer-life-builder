import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  isGraduateFromProgress,
  isTrackGated,
  resolveEffectiveTrackId,
  setActiveTrackId,
  type FrontierStatus,
} from '@/lib/trackProgress';
import { refreshTruthWidget } from '@/lib/truthWidget';

export default function TracksScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  const { state } = useApp();
  // Finding 49 (device review 2026-11-10): Tracks was one endless
  // modal scroll (journeys + the full 30-day Library) with no way Home
  // but a small back arrow. It is now two sections behind tabs at the
  // top — Journeys and Library — so each screen is short. The Home
  // Saved row still deep-links here with ?section=library, which now
  // opens the Library tab instead of scrolling a long list.
  const [sectionTab, setSectionTab] = useState<'journeys' | 'library'>(
    section === 'library' ? 'library' : 'journeys',
  );
  // Null until the stored active track AND every frontier status have
  // loaded: the first frame used to paint Foundations as active with
  // Day-1 progress labels, then swap once storage resolved.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [frontierByTrack, setFrontierByTrack] = useState<Record<string, FrontierStatus>>({});

  const foundationsComplete = foundationsCompleteFromProgress(state.progress, state.journeyComplete);
  // Kai-approved 2026-10-26: gating (not display) uses the sticky
  // graduate flag, so a graduate on a second pass keeps every track
  // unlocked. foundationsComplete itself stays progress-derived so the
  // Foundations card still shows this pass's own progress honestly.
  const gatingComplete = isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated);
  const effectiveActiveId = resolveEffectiveTrackId(activeId ?? 'foundations', gatingComplete);

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
    // Round-3 B-M1 (partial): the widget follows the active track.
    void refreshTruthWidget();
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
        <Text style={[styles.cardTitle, { color: C.textSecondary, fontFamily: Fonts.serifMedium }]}>
          {track.title}
        </Text>
        <View style={[styles.lockBadge, { backgroundColor: C.surface }]}>
          <Lock size={14} color={C.textMuted} />
          <Text style={[styles.lockBadgeText, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>LOCKED</Text>
        </View>
      </View>
      <Text style={[styles.cardSub, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
        {track.subtitle} · {track.dayCount} days
      </Text>
      <Text style={[styles.cardDesc, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
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
      <Text style={[styles.cardTitle, { color: C.textSecondary, fontFamily: Fonts.serifMedium }]}>
        {track.title}
      </Text>
      <Text style={[styles.cardSub, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
        {track.subtitle} · {track.dayCount} days
      </Text>
      <Text style={[styles.cardDesc, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
        {track.description}
      </Text>
      <Text style={[styles.unlockNote, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
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
        <Text style={[styles.cardDesc, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
          {track.description}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: C.border }]}>
          <View style={[styles.progressFill, { backgroundColor: C.accent, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
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
          {/* Finding 49: an explicit way Home — a visible Done button.
              The modal presentation already allows swipe-down on iOS,
              but the only visible exit used to be the small back arrow.
              Done returns to Home, exactly like Back. */}
          <AnimatedPressable
            onPress={() => router.back()}
            scaleValue={0.96}
            style={styles.doneBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="tracks-done"
            accessibilityLabel="Done, back to Home"
            accessibilityRole="button"
          >
            <Text style={[styles.doneBtnText, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>Done</Text>
          </AnimatedPressable>
        </View>
        {/* Finding 46: the "PRAYER JOURNEYS" eyebrow + "Choose your
            journey" title said "journey" twice. No eyebrow; the title
            is "Prayer Journeys" and the intro below carries the guidance. */}
        <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifLight }]}>
          Prayer Journeys
        </Text>
        <Text style={[styles.sub, { color: C.textSecondary, fontFamily: Fonts.italic }]}>
          {foundationsComplete
            ? 'Each journey is a full path of daily prayer. Foundations is finished. Every open journey is yours. Come and go as you need.'
            : 'Each journey is a full path of daily prayer. Foundations comes first, then the rest open.'}
        </Text>
        {/* Finding 46: the note was four lines, rendered LARGER than the
            intro above it (inverted hierarchy). One line now, small and
            quiet (caption, muted); the intro above keeps the body size. */}
        <Text style={[styles.deviceNote, { color: C.textMuted, fontFamily: Fonts.titleRegular }]}>
          Progress saves on this device. Foundations syncs to your account.
        </Text>

        {/* Finding 49: section tabs — Journeys and Library are separate
            screens now, not one endless list. */}
        <View style={styles.sectionTabs} testID="tracks-section-tabs">
          <AnimatedPressable
            onPress={() => setSectionTab('journeys')}
            scaleValue={0.97}
            style={[
              styles.sectionTab,
              {
                backgroundColor: sectionTab === 'journeys' ? C.accent : C.surfaceAlt,
                borderColor: sectionTab === 'journeys' ? C.accent : C.border,
              },
            ]}
            testID="tracks-tab-journeys"
            accessibilityLabel="Journeys"
            accessibilityRole="button"
            accessibilityState={{ selected: sectionTab === 'journeys' }}
          >
            <Text style={[styles.sectionTabText, { color: sectionTab === 'journeys' ? '#1A1006' : C.textSecondary, fontFamily: Fonts.titleSemiBold }]}>Journeys</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setSectionTab('library')}
            scaleValue={0.97}
            style={[
              styles.sectionTab,
              {
                backgroundColor: sectionTab === 'library' ? C.accent : C.surfaceAlt,
                borderColor: sectionTab === 'library' ? C.accent : C.border,
              },
            ]}
            testID="tracks-tab-library"
            accessibilityLabel="Library"
            accessibilityRole="button"
            accessibilityState={{ selected: sectionTab === 'library' }}
          >
            <Text style={[styles.sectionTabText, { color: sectionTab === 'library' ? '#1A1006' : C.textSecondary, fontFamily: Fonts.titleSemiBold }]}>Library</Text>
          </AnimatedPressable>
        </View>

        {sectionTab === 'journeys' ? (
          <>
            {liveTracks.map((track) =>
              isTrackGated(track.id, gatingComplete) ? renderLockedCard(track) : renderLiveCard(track),
            )}

            {soonTracks.length > 0 && (
              <>
                <Text style={[styles.soonKicker, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                  COMING SOON
                </Text>
                {soonTracks.map((track) => renderComingSoonCard(track))}
              </>
            )}
          </>
        ) : (
          <View style={styles.librarySection}>
            <Text style={[styles.kicker, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
              PRAYER LIBRARY
            </Text>
            <Text style={[styles.libraryTitle, { color: C.text, fontFamily: Fonts.serifLight }]}>
              {TRACKS.find((t) => t.id === effectiveActiveId)?.title ?? 'Foundations'}, day by day
            </Text>
            <LibraryView trackId={effectiveActiveId} embedded />
          </View>
        )}

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
  backRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.10)',
  },
  // Finding 49: the explicit way Home — same quiet treatment as the
  // back button, 44pt tall, labelled in words, not just an arrow.
  doneBtn: {
    minWidth: 64,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(180,116,53,0.10)',
  },
  doneBtnText: { fontSize: T.size.button, lineHeight: T.leading.button, letterSpacing: 0.5 },
  // Finding 49: section tabs splitting Journeys / Library.
  sectionTabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  sectionTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabText: { fontSize: T.size.button, lineHeight: T.leading.button, letterSpacing: 0.5 },
  kicker: { fontSize: T.size.label, letterSpacing: 2, textAlign: 'center', marginBottom: 12, lineHeight: T.leading.label },
  title: { fontSize: T.size.title, textAlign: 'center', marginBottom: 8, lineHeight: T.leading.title },
  sub: { fontSize: T.size.body, textAlign: 'center', marginBottom: 12, lineHeight: T.leading.body },
  // Finding 46: one line, caption size, muted — quiet, under the intro.
  deviceNote: { fontSize: T.size.caption, textAlign: 'center', marginBottom: 20, lineHeight: T.leading.caption },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  activeCard: { borderWidth: 2 },
  lockedCard: { borderStyle: 'dashed' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: T.size.sectionTitle, flex: 1, lineHeight: T.leading.sectionTitle },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { fontSize: T.size.body, color: '#1A1006', letterSpacing: 1, lineHeight: T.leading.body },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockBadgeText: { fontSize: T.size.body, letterSpacing: 1, lineHeight: T.leading.body },
  unlockNote: { fontSize: T.size.body, marginTop: 2, lineHeight: T.leading.body },
  cardSub: { fontSize: T.size.body, marginBottom: 10, lineHeight: T.leading.body },
  cardDesc: { fontSize: T.size.body, lineHeight: T.leading.body, marginBottom: 14 },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: T.size.body, letterSpacing: 1.5, lineHeight: T.leading.body },
  soonKicker: { fontSize: T.size.label, letterSpacing: 2, marginTop: 12, marginBottom: 12, textAlign: 'center', lineHeight: T.leading.label },
  soonCard: { borderStyle: 'dashed' },
  librarySection: { marginTop: 4 },
  libraryTitle: { fontSize: T.size.sectionTitle, textAlign: 'center', marginBottom: 16, lineHeight: T.leading.sectionTitle },
});
