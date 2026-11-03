import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import AnimatedPressable from '@/components/AnimatedPressable';
import RadialGlow from '@/components/RadialGlow';
import { Fonts } from '@/constants/fonts';
import { getDayContent } from '@/mocks/content';
import { getTrack, getTrackDay as getTrackDayContent } from '@/mocks/tracks';
import { getFrontierStatus, getTrackCompletedDays, type FrontierStatus } from '@/lib/trackProgress';
import { getTierFromEntitlements, hasFeature } from '@/services/entitlements';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useApp } from '@/providers/AppProvider';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

function getPhaseTags(day: number): string[] {
  if (day <= 10) {
    return ['Spirit', 'Soul', 'Body'];
  }
  if (day <= 20) {
    return ['Soul', 'Spirit', 'Body'];
  }
  return ['Body', 'Soul', 'Spirit'];
}

interface LibraryViewProps {
  /** Which journey's archive to show. Defaults to Foundations. */
  trackId?: string;
  /** When true, renders without its own ScrollView (for embedding in a parent scroll). */
  embedded?: boolean;
}

/**
 * Prayer Library — the day-by-day archive of a journey. Lives in the
 * Journeys (tracks) screen for the active journey. Partners (BROWSE_LIBRARY
 * tier — the Partner tier, which the entitlement system also grants via
 * the 'missions' identifier) can open ANY day, including days ahead of
 * the frontier; free users revisit only days they have reached, one day
 * at a time. A jumped-ahead completion never leaps the frontier (see
 * lib/journeyCompletion.ts / lib/trackProgress.ts jumped-day records).
 */
export default function LibraryView({ trackId = 'foundations', embedded = false }: LibraryViewProps) {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state } = useApp();
  const [frontier, setFrontier] = useState<FrontierStatus | null>(null);
  const [jumpedCompletedDays, setJumpedCompletedDays] = useState<number[]>([]);
  // Tier, the way the app determines it everywhere else: entitlements
  // -> tier (missions maps to Partner) -> BROWSE_LIBRARY feature. No
  // new entitlement name; the literal-'partner' isPartner helper would
  // wrongly exclude missions-entitlement Partners.
  const canJumpAhead = hasFeature('BROWSE_LIBRARY', getTierFromEntitlements(state.entitlements)) === true;

  const isFoundations = trackId === 'foundations';
  const track = getTrack(trackId);
  const dayCount = track?.dayCount ?? 30;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, index) => index + 1),
    [dayCount],
  );

  useEffect(() => {
    if (isFoundations) return;
    let mounted = true;
    void (async () => {
      const status = await getFrontierStatus(trackId);
      const jumped = await getTrackCompletedDays(trackId);
      if (mounted) {
        setFrontier(status);
        setJumpedCompletedDays(jumped);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isFoundations, trackId]);

  // Non-Foundations frontier status resolves asynchronously; until it
  // lands, days must not render as locked (or answer taps as locked).
  const frontierPending = !isFoundations && frontier === null;

  const handleOpenDay = (day: number) => {
    if (frontierPending) return;
    if (isFoundations) {
      // Pacing, not paywall, for free users: a future day gets the
      // pacing message — never a paywall upsell for something paying
      // would not unlock. Partners (BROWSE_LIBRARY) may step ahead;
      // the session gate enforces the same tier check, and completion
      // of a jumped day never leaps the frontier.
      if (day > state.currentDay && !canJumpAhead) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          'One day at a time',
          `Day ${day} opens as you walk this journey — one day per day. Rest in today's prayer.`,
          [{ text: 'Amen', style: 'cancel' }],
        );
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/session?day=${day}`);
      return;
    }

    // Track days: everything up to the frontier is a revisit; beyond it is
    // still ahead on the journey (pacing — not a paywall) for free users.
    // Partners may step ahead here too; a jumped track completion is
    // recorded only in the completed-days set, never as frontier progress.
    const frontierDay = frontier?.day ?? 1;
    if (day > frontierDay && !canJumpAhead) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'One day at a time',
        `Day ${day} opens as you walk this journey — one day per day. Rest in today's prayer.`,
        [{ text: 'Amen', style: 'cancel' }],
      );
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/session?day=${day}`);
  };

  const unlockedLabel = isFoundations
    ? canJumpAhead
      ? 'All 30 days open · Partner'
      : `Unlocked through Day ${state.currentDay}`
    : frontier?.isComplete
      ? 'Journey complete'
      : canJumpAhead
        ? 'All days open · Partner'
        : `Unlocked through Day ${frontier?.day ?? 1}`;

  const content = (
    <>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>PRAYER LIBRARY</Text>
          <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>Browse every day.</Text>
          <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>
            {isFoundations
              ? canJumpAhead
                ? 'As a Partner, every day is open — revisit any day, or step ahead. Your daily walk still advances one day at a time.'
                : 'Browse the full path. Every day you have reached is yours to revisit; new days unlock one at a time.'
              : canJumpAhead
                ? "As a Partner, every day is open — revisit any day, or step ahead. Your daily walk still advances one day at a time."
                : "Every day you've reached on this journey is yours to revisit, any time."}
          </Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Sparkles size={14} color={C.accent} />
              <Text style={[styles.heroBadgeText, { fontFamily: Fonts.titleMedium }]}>{dayCount} guided sessions</Text>
            </View>
            {frontierPending ? null : (
              <View style={styles.heroBadge}>
                <Text style={[styles.heroBadgeText, { fontFamily: Fonts.titleMedium }]}>
                  {unlockedLabel}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.heroBody, { fontFamily: Fonts.italic }]}>Every card opens the full session, with the same calm feel you know from Home.</Text>
        </View>

        <View style={styles.grid}>
          {days.map((day) => {
            const dayContent = isFoundations
              ? getDayContent(day)
              : getTrackDayContent(trackId, day) ?? getDayContent(day);
            const tags = isFoundations
              ? getPhaseTags(day)
              : dayContent.phase
                ? [dayContent.phase]
                : [];
            const isCompleted = isFoundations
              ? state.progress.some((item) => item.day === day && item.completed)
              : day <= (frontier?.completedDays ?? 0) || jumpedCompletedDays.includes(day);
            const isLocked = isFoundations
              ? day > state.currentDay && !canJumpAhead
              : frontierPending
                ? false
                : day > (frontier?.day ?? 1) && !canJumpAhead;

            return (
              <AnimatedPressable
                key={day}
                style={[styles.card, isLocked && styles.cardLocked, isCompleted && styles.cardCompleted]}
                onPress={() => handleOpenDay(day)}
                scaleValue={0.98}
                testID={`library-day-${day}`}
              >
                <LinearGradient
                  colors={isLocked ? [C.surfaceAlt, C.surface, C.surfaceAlt] : [C.surfaceElevated, C.warmLight, C.cardGradientEnd]}
                  start={{ x: 0.08, y: 0 }}
                  end={{ x: 0.92, y: 1 }}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.dayLabel, { fontFamily: Fonts.titleMedium }]}>{`DAY ${day}`}</Text>
                      <Text style={[styles.dayTitle, { fontFamily: Fonts.serifRegular }]} numberOfLines={2}>{dayContent.title}</Text>
                    </View>
                    {isLocked ? (
                      <View style={styles.lockPill}>
                        <Lock size={13} color={C.textMuted} />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.tagRow}>
                    {tags.map((tag) => (
                      <View key={`${day}-${tag}`} style={styles.tagPill}>
                        <Text style={[styles.tagText, { fontFamily: Fonts.titleMedium }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.cardPhase, { fontFamily: Fonts.italic }]} numberOfLines={2}>{dayContent.phase}</Text>

                  {isCompleted ? (
                    <View style={styles.completedPill}>
                      <Text style={[styles.completedText, { fontFamily: Fonts.titleMedium }]}>Completed</Text>
                    </View>
                  ) : null}

                  {isLocked ? (
                    <View style={styles.lockOverlay} pointerEvents="none">
                      <View style={styles.lockCurtain} />
                      <View style={styles.lockOverlayInner}>
                        <Lock size={16} color={C.text} />
                        <Text style={[styles.lockTitle, { fontFamily: Fonts.titleSemiBold }]}>Ahead</Text>
                        <Text style={[styles.lockSub, { fontFamily: Fonts.titleLight }]}>Opens as you walk</Text>
                      </View>
                    </View>
                  ) : null}
                </LinearGradient>
              </AnimatedPressable>
            );
          })}
        </View>
    </>
  );

  return (
    <View style={styles.root}>
      <View style={styles.ambientGlow} pointerEvents="none">
        <RadialGlow size={420} maxOpacity={0.12} />
      </View>
      {embedded ? (
        <View style={styles.embeddedContent}>{content}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} testID="library-scroll">
          {content}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (C: ReturnType<typeof useColors>, T: ReturnType<typeof useTypography>) => StyleSheet.create({
  root: {
    flex: 1,
  },
  ambientGlow: {
    position: 'absolute',
    top: -120,
    left: -40,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 150,
  },
  embeddedContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  headerCopy: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.textSecondary,
  },
  heroCard: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    marginBottom: 22,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.accentBg,
  },
  heroBadgeMuted: {
    backgroundColor: C.overlayLight,
  },
  heroBadgeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1,
    color: C.text,
    textTransform: 'uppercase' as const,
  },
  heroBody: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  grid: {
    gap: 14,
  },
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  cardLocked: {
    opacity: 0.96,
  },
  cardCompleted: {
    borderColor: C.accent,
  },
  cardGradient: {
    padding: 18,
    minHeight: 158,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  dayLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    maxWidth: '92%',
  },
  lockPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.overlayLight,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.overlayLight,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  tagText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: C.textSecondary,
  },
  cardPhase: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    paddingRight: 12,
  },
  completedPill: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentLight,
  },
  completedText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  lockOverlay: {
    ...absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCurtain: {
    ...absoluteFillObject,
    backgroundColor: C.overlay,
    opacity: 0.56,
  },
  lockOverlayInner: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  lockTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: 1.4,
    color: C.text,
    textTransform: 'uppercase' as const,
  },
  lockSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
});
