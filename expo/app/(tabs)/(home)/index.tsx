import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Cloud,
  Heart,
  Play,
  Settings2,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';

import { Fonts } from '@/constants/fonts';
import { VERSES_OF_THE_DAY } from '@/constants/verses';
import { getDayContent, getPhaseLabel } from '@/mocks/content';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';




function getEncouragingSub(completedDays: number): string {
  if (completedDays === 0)  return "He's been waiting for this moment with you.";
  if (completedDays === 1)  return "One day in. God heard every word.";
  if (completedDays === 2)  return "Two days. A rhythm is beginning to form.";
  if (completedDays === 3)  return "Three days. Something is shifting in you.";
  if (completedDays === 4)  return "Four days faithful. He is faithful too.";
  if (completedDays === 5)  return "Five days of showing up. That matters.";
  if (completedDays === 6)  return "Six days. Tomorrow you'll have done what many never do.";
  if (completedDays === 7)  return "One full week. You are not the same person who started.";
  if (completedDays === 8)  return "Week two. The roots are going deeper.";
  if (completedDays === 9)  return "Nine days of faithfulness. God doesn't forget a single one.";
  if (completedDays === 10) return "Ten days. You've built something real here.";
  if (completedDays === 11) return "Eleven days. Your spirit is stronger than you know.";
  if (completedDays === 12) return "Twelve days in. Keep pressing — this is where it gets holy.";
  if (completedDays === 13) return "Thirteen days. The Father is shaping something in you.";
  if (completedDays === 14) return "Halfway home. Look how far grace has carried you.";
  if (completedDays === 15) return "Fifteen days of meeting with God. That's a legacy.";
  if (completedDays === 16) return "Sixteen days. You've crossed the halfway point. Don't stop now.";
  if (completedDays === 17) return "Seventeen days. Your prayer life is no longer an intention — it's a practice.";
  if (completedDays === 18) return "Eighteen days. The enemy doesn't want you here. Come anyway.";
  if (completedDays === 19) return "Nineteen days. You're walking in something most people only dream of.";
  if (completedDays === 20) return "Twenty days. The finish line is in sight.";
  if (completedDays === 21) return "Three weeks. You have been faithful in the secret place.";
  if (completedDays <= 25)  return "The last stretch. Every day here is sacred ground.";
  if (completedDays <= 29)  return "Almost. Don't let go now — He's been working in every session.";
  return "Thirty days. You built a prayer life. Come back anytime — He'll be here.";
}


const SECTION_LABELS: Record<string, string> = {
  settle: 'Settle',
  focus: 'Focus',
  thank: 'Thank',
  repent: 'Repent',
  invite: 'Invite',
  ask: 'Ask',
  declare: 'Declare',
  selah: 'Selah',
  act: 'Live It',
  verse: 'Verse',
};

export default function HomeScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const router = useRouter();

  const {
    state,
    isLoading,
    hasCompletedSessionToday,
    graceWindowRemaining,
    resetJourney,
    isStreakFrozen,
    hasFeature,
    hasCompletedDailyPrayerToday,
    getTodayDailyPrayerDay,
  } = useApp();
  const isLargeFont = state.fontSize === 'large';
  const [dailyPrayerLockVisible, setDailyPrayerLockVisible] = React.useState<boolean>(false);

  const greetingFade = useRef(new Animated.Value(0)).current;
  const greetingSlide = useRef(new Animated.Value(16)).current;
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(16)).current;
  const streakFade = useRef(new Animated.Value(0)).current;
  const streakSlide = useRef(new Animated.Value(16)).current;
  const restFade = useRef(new Animated.Value(0)).current;
  const restSlide = useRef(new Animated.Value(16)).current;
  const glowPulse = useRef(new Animated.Value(0.25)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const completedDays = useMemo(
    () => state.progress.filter((item) => item.completed).length,
    [state.progress]
  );
  const progressPercent = useMemo(
    () => Math.max(3.3, (completedDays / 30) * 100),
    [completedDays]
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.55,
          duration: 5000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.25,
          duration: 5000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(greetingFade, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(greetingSlide, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(heroFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(streakFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(streakSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(restFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(restSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [glowPulse, greetingFade, greetingSlide, heroFade, heroSlide, restFade, restSlide, streakFade, streakSlide]);

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: progressPercent,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressWidth]);

  const displayDay = useMemo(
    () => (hasCompletedSessionToday && state.currentDay > 1) ? state.currentDay - 1 : state.currentDay,
    [hasCompletedSessionToday, state.currentDay]
  );
  const dayContent = useMemo(() => getDayContent(displayDay), [displayDay]);
  const phaseLabel = useMemo(() => getPhaseLabel(displayDay), [displayDay]);
  const showGraceBadge = useMemo(
    () => graceWindowRemaining !== null && state.streakCount > 0,
    [graceWindowRemaining, state.streakCount]
  );
  const graceUrgent = useMemo(() => graceWindowRemaining === 0, [graceWindowRemaining]);
  const greetingName = useMemo(() => state.user?.firstName || 'Friend', [state.user?.firstName]);
  const encouragingSub = useMemo(() => getEncouragingSub(completedDays), [completedDays]);
  const hasDailyPrayerAccess = useMemo(() => Boolean(hasFeature('DAILY_PRAYER_POST_30')), [hasFeature]);
  const dailyPrayerDay = useMemo(() => getTodayDailyPrayerDay(), [getTodayDailyPrayerDay]);
  const dailyPrayerContent = useMemo(() => getDayContent(dailyPrayerDay), [dailyPrayerDay]);
  const todayLabel = useMemo(() => new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }), []);

  // Verse of the Day based on the day of the year to ensure it changes daily across the whole App but is consistent for the whole day.
  const todayVerse = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return VERSES_OF_THE_DAY[dayOfYear % VERSES_OF_THE_DAY.length];
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View pointerEvents="none" style={[styles.loadingGlow, { opacity: glowPulse }]}>
          <RadialGlow size={280} maxOpacity={0.14} />
        </Animated.View>
        <View style={styles.loadingContent}>
          <View style={styles.loadingHeaderSkeleton} />
          <View style={styles.loadingHeroSkeleton} />
          <View style={styles.loadingRowSkeleton} />
          <View style={styles.loadingRowSkeletonShort} />
        </View>
      </View>
    );
  }

  if (!state.user?.onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  const handleReviewDay = (day: number) => {
    const isCompleted = state.progress.some(p => p.day === day && p.completed);
    const isToday = day === state.currentDay;
    const isLocked = day > state.currentDay;

    if (isCompleted || (isToday && !isLocked)) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/session?day=${day}`);
    }
  };

  // handleShare and selectedContent are removed as they were part of the old ReviewModal logic

  if (state.journeyComplete) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[C.background, C.surface, C.background]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.completionContainer}>
            <View style={styles.completionOrb}>
              <View style={styles.completionInnerOrb}>
                <Check size={28} color={C.accent} strokeWidth={2.4} />
              </View>
            </View>
            <Text style={[styles.completionEyebrow, { fontFamily: Fonts.titleMedium }]}>JOURNEY COMPLETE</Text>
            <Text style={[styles.completionTitle, { fontFamily: Fonts.serifLight }]}>Keep the habit alive.</Text>
            <Text style={[styles.completionMessage, { fontFamily: Fonts.italic }]}>
              {hasDailyPrayerAccess
                ? `${todayLabel} · Today’s prayer is Day ${dailyPrayerDay}: ${dailyPrayerContent.title}.`
                : 'Daily Prayer Mode unlocks after Day 30 for Missions supporters.'}
            </Text>
            {hasCompletedDailyPrayerToday ? (
              <View style={styles.completedSessionCTA}>
                <Check size={16} color={C.accent} strokeWidth={3} />
                <Text style={[styles.completedSessionCTAText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>YOU PRAYED TODAY</Text>
              </View>
            ) : (
              <AnimatedPressable
                style={[styles.goldBorderButton, !hasDailyPrayerAccess && { opacity: 0.55 }]}
                onPress={() => {
                  if (!hasDailyPrayerAccess) {
                    setDailyPrayerLockVisible(true);
                    return;
                  }
                  router.push(`/session?day=${dailyPrayerDay}&mode=daily-prayer`);
                }}
                scaleValue={0.96}
                testID="daily-prayer-cta"
              >
                <Play size={15} color={C.accent} fill={C.accent} />
                <Text style={[styles.goldBorderButtonText, { fontFamily: Fonts.titleLight }]}>DAILY PRAYER</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable
              style={styles.ghostButton}
              onPress={() => {
                resetJourney();
              }}
              scaleValue={0.97}
              testID="restart-journey"
            >
              <Text style={[styles.ghostButtonText, { fontFamily: Fonts.titleLight }]}>Restart 30 Days</Text>
            </AnimatedPressable>
          </View>
        </SafeAreaView>
        <FeatureLockSheet
          visible={dailyPrayerLockVisible}
          onClose={() => setDailyPrayerLockVisible(false)}
          featureName="Daily Prayer Mode"
          requirement="Missions Level"
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[C.bgGradient1, C.bgGradient2, C.surface, C.bgGradient3]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <Animated.View style={[styles.ambientWrap, { opacity: glowPulse }]} pointerEvents="none">
        <View style={styles.ambientTopGlow}>
          <RadialGlow size={560} maxOpacity={0.18} style={styles.ambientEllipse} />
        </View>
        <View style={styles.ambientTopGlowWide}>
          <RadialGlow size={700} maxOpacity={0.12} style={styles.ambientWideEllipse} />
        </View>
        <View style={styles.ambientSideGlow}>
          <RadialGlow size={360} r={222} g={152} b={92} maxOpacity={0.12} />
        </View>
        <View style={styles.ambientLowerGlow}>
          <RadialGlow size={340} r={176} g={117} b={71} maxOpacity={0.08} />
        </View>
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          bounces={true}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: greetingFade,
              transform: [{ translateY: greetingSlide }],
            }}
          >
            <View style={styles.topBar}>
              <View style={styles.topBarLeft}>
                {state.streakCount > 0 && !showGraceBadge ? (
                  <View style={styles.streakPill}>
                    <Text style={styles.streakEmoji}>🔥</Text>
                    <Text style={[styles.streakText, { fontFamily: Fonts.titleMedium }]}>
                      {state.streakCount}-day streak
                    </Text>
                  </View>
                ) : null}
                {showGraceBadge ? (
                  <View style={[styles.streakPill, graceUrgent && styles.streakPillUrgent]}>
                    <AlertTriangle size={13} color={graceUrgent ? C.rose : C.accent} />
                    <Text style={[styles.streakText, { fontFamily: Fonts.titleMedium, color: graceUrgent ? C.rose : C.streakText }]}>
                      {graceUrgent ? 'Pray today' : 'Grace window'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/settings');
                }}
                scaleValue={0.97}
                style={styles.settingsBtn}
                testID="open-settings"
              >
                <Settings2 size={17} color={C.settingsIcon} />
              </AnimatedPressable>
            </View>

            <View style={styles.greetingSection}>
              <View style={styles.greetingGlow} pointerEvents="none">
                <RadialGlow size={300} r={223} g={161} b={97} maxOpacity={0.11} style={styles.greetingGlowShape} />
              </View>
              <Text style={[styles.greetingLabel, { fontFamily: Fonts.titleLight }]}>
                {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
              </Text>
              <Text style={[styles.greetingName, { fontFamily: Fonts.serifRegular }, isLargeFont && { fontSize: T.scale(46), lineHeight: 52 }]}>
                {greetingName}
              </Text>
              <Text style={[styles.greetingSub, { fontFamily: Fonts.italic }, isLargeFont && { fontSize: T.scale(18) }]}>
                {encouragingSub}
              </Text>
            </View>

            <Animated.View
              style={{
                opacity: streakFade,
                transform: [{ translateY: streakSlide }],
              }}
            >
              {state.streakCount > 0 && (
                <View style={[styles.streakCard, isStreakFrozen && styles.streakCardFrozen]}>
                  <Text style={styles.streakCardEmoji}>{isStreakFrozen ? '🧊' : '🔥'}</Text>
                  <Text style={[styles.streakCardText, { fontFamily: Fonts.titleLight }, isStreakFrozen && styles.streakCardTextFrozen]}>
                    <Text style={[styles.streakCardStrong, { fontFamily: Fonts.titleMedium }, isStreakFrozen && styles.streakCardStrongFrozen]}>
                      {state.streakCount}-day streak
                    </Text>
                    {isStreakFrozen ? ' · Grace day active' : ' · Keep walking in freedom'}
                  </Text>
                </View>
              )}
            </Animated.View>

            {!state.user?.id && state.currentDay >= 2 && (() => {
                const dismissed = state.user?.cloudPromptDismissedAt;
                // Show if never dismissed, OR re-show from Day 5+ if they previously skipped
                const showPrompt = !dismissed || (state.currentDay >= 5 && dismissed < Date.now() - 3 * 24 * 60 * 60 * 1000);
                return showPrompt ? (
                  <AnimatedPressable
                    onPress={() => router.push('/auth')}
                    scaleValue={0.97}
                    style={styles.authSoftPrompt}
                    testID="cloud-save-prompt"
                  >
                    <Cloud size={14} color={C.accentDark} />
                    <Text style={[styles.authSoftPromptText, { fontFamily: Fonts.titleMedium }]}>
                      SAVE YOUR PROGRESS TO THE CLOUD
                    </Text>
                    <ChevronRight size={12} color={C.chevronMuted} />
                  </AnimatedPressable>
                ) : null;
              })()}

            {/* Reminder re-prompt — shows Day 3+ if user skipped */}
            {state.user?.reminderTime === '' && state.currentDay >= 3 && (
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/settings');
                }}
                scaleValue={0.97}
                style={styles.reminderPrompt}
                testID="reminder-prompt"
              >
                <Bell size={14} color={C.accentDark} />
                <Text style={[styles.reminderPromptText, { fontFamily: Fonts.titleMedium }]}>
                  NEVER MISS A DAY — SET YOUR REMINDER
                </Text>
                <ChevronRight size={12} color={C.chevronMuted} />
              </AnimatedPressable>
            )}
          </Animated.View>

          <Animated.View
            style={{
              opacity: heroFade,
              transform: [{ translateY: heroSlide }],
            }}
          >
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progressLabel, { fontFamily: Fonts.titleMedium }]}>JOURNEY TO WHOLENESS</Text>
                <Text style={[styles.progressDay, { fontFamily: Fonts.titleLight }]}>
                  Day {state.currentDay} of 30
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressWidth.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[C.accentLight, C.accent, C.accentDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.progressDot} />
                </Animated.View>
                {/* Milestone tick marks */}
                {[7, 14, 21].map(d => (
                  <View
                    key={d}
                    style={[styles.milestoneTick, { left: `${(d / 30) * 100}%` as any }]}
                  />
                ))}
              </View>
              {/* Milestone labels */}
              <View style={styles.milestoneLabels}>
                {([7, 14, 21, 30] as const).map((d, i) => (
                  <View key={d} style={[styles.milestoneLabelWrap, { left: `${(d / 30) * 100}%` as any }]}>
                    <Text style={[styles.milestoneTick_label, { fontFamily: Fonts.titleLight, color: completedDays >= d ? C.accent : C.textMuted }]}>W{i + 1}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Daily Variable Surprise (The Drop) — treated as quiet secondary */}
            <View style={styles.dropCard}>
              <Text style={[styles.dropEyebrow, { fontFamily: Fonts.titleMedium, color: C.textMuted }]}>VERSE OF THE DAY</Text>
              <Text style={[styles.dropQuote, { fontFamily: Fonts.italic, color: C.textSecondary, fontSize: 17, lineHeight: 26, marginBottom: 8 }]}>
                "{todayVerse.text}"
              </Text>
              <Text style={[styles.dropRef, { fontFamily: Fonts.titleLight, color: C.textMuted, fontSize: 13 }]}>
                — {todayVerse.reference}
              </Text>
            </View>
          </Animated.View>

          {/* Weekly Wrapped Notification */}
          {[8, 15, 22, 31].includes(state.currentDay) && !hasCompletedSessionToday && (
            <Animated.View style={{ opacity: restFade, transform: [{ translateY: restSlide }], marginBottom: 16 }}>
              <AnimatedPressable
                style={styles.wrappedBanner}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/journey');
                }}
                scaleValue={0.97}
                testID="weekly-wrapped-banner"
              >
                <Text style={styles.wrappedEmoji}>✨</Text>
                <View style={styles.wrappedTextWrap}>
                  <Text style={[styles.wrappedTitle, { fontFamily: Fonts.titleBold }]}>
                    WEEK {state.currentDay === 8 ? 1 : state.currentDay === 15 ? 2 : state.currentDay === 22 ? 3 : 4} WRAPPED
                  </Text>
                  <Text style={[styles.wrappedSub, { fontFamily: Fonts.italic }]}>
                    Your insights are ready. See how you&apos;ve grown.
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
            </Animated.View>
          )}

          <Animated.View
            style={{
              opacity: heroFade,
              transform: [{ translateY: heroSlide }],
            }}
          >
            <Text style={[styles.sectionEyebrow, { fontFamily: Fonts.titleMedium }]}>TODAY&apos;S PRACTICE</Text>

            <AnimatedPressable
              style={styles.todayCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/session?day=${displayDay}`);
              }}
              scaleValue={0.97}
              testID="begin-today"
            >
              <LinearGradient
                colors={[C.surfaceElevated, C.warmLight, C.cardGradientEnd]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.todayCardInner}
              >
                <View style={styles.todayCardGlow} pointerEvents="none">
                  <RadialGlow size={240} r={228} g={165} b={103} maxOpacity={0.14} />
                </View>
                <View style={styles.todayCardGlowSecondary} pointerEvents="none">
                  <RadialGlow size={180} r={160} g={100} b={48} maxOpacity={0.08} />
                </View>
                <LinearGradient
                  colors={[C.transparent, C.dayChipTodayBorder, C.transparent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.todayCardAccentLine}
                />

                <Text style={[styles.todayCardDay, { fontFamily: Fonts.titleMedium }]}>
                  {'Day ' + displayDay + ' · ' + phaseLabel}
                </Text>
                <Text style={[styles.todayCardTitle, { fontFamily: Fonts.serifLight }, isLargeFont && { fontSize: T.scale(34), lineHeight: 40 }]}>
                  {dayContent.title}
                </Text>
                <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }, isLargeFont && { fontSize: T.scale(18) }]}>
                  {dayContent.settle}
                </Text>

                {state.activeSession && state.activeSession.day === displayDay && (
                  <View style={styles.resumeBadge}>
                    <Text style={styles.resumeBadgeText}>
                      RESUME · {state.activeSession.phase ? SECTION_LABELS[state.activeSession.phase]?.toUpperCase() : 'SETTLE'}
                    </Text>
                  </View>
                )}

                <View style={styles.todayCardRule} />


                <View style={styles.triadPills}>
                  {['Thank', 'Repent', 'Invite', 'Ask', 'Declare'].map((pill, i) => (
                    <View key={pill} style={i === 0 ? styles.triadPillActive : styles.triadPill} />
                  ))}
                  <Text style={[styles.triadPillLabel, { fontFamily: Fonts.titleLight }]}>5 prayer phases</Text>
                </View>


                <View style={styles.todayCardRule} />

                {/* Soundscape Selector removed as requested */}

                {hasCompletedSessionToday ? (
                  <>
                    <View style={[styles.todayCardCta, { opacity: 0.9 }]}>
                      <View style={styles.completedBadge}>
                        <Check size={11} color={C.accent} strokeWidth={3} />
                      </View>
                      <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>Completed today</Text>
                    </View>
                    {displayDay < 30 && (
                      <View style={styles.tomorrowCard}>
                        <Text style={styles.tomorrowEyebrow}>
                          Tomorrow • Day {displayDay + 1}
                        </Text>
                        <Text style={styles.tomorrowTitle}>
                          {getDayContent(displayDay + 1).title}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.todayCardCta}>
                    <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium }]}>
                      Begin today&apos;s prayer
                    </Text>
                    <ChevronRight size={14} color={C.accent} />
                  </View>
                )}
              </LinearGradient>
            </AnimatedPressable>
          </Animated.View>

          <Animated.View
            style={{
              opacity: restFade,
              transform: [{ translateY: restSlide }],
            }}
          >
            <Text style={[styles.sectionEyebrow, { fontFamily: Fonts.titleMedium }]}>30-DAY JOURNEY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayStripContent}
              style={styles.dayStrip}
            >
              {Array.from({ length: 30 }, (_, i) => {
                const dayNum = i + 1;
                const isDone = state.progress.some(p => p.day === dayNum && p.completed);
                const isToday = dayNum === state.currentDay;
                const isLocked = dayNum > state.currentDay;

                return (
                  <AnimatedPressable
                    key={dayNum}
                    onPress={() => handleReviewDay(dayNum)}
                    scaleValue={0.97}
                    style={[
                      styles.dayChip,
                      isDone && styles.dayChipDone,
                      isToday && styles.dayChipToday,
                      isLocked && styles.dayChipLocked,
                    ]}
                    testID={`day-chip-${dayNum}`}
                  >
                    <Text
                      style={[
                        styles.dayChipNum,
                        { fontFamily: Fonts.titleLight },
                        isDone && styles.dayChipNumDone,
                        isToday && { color: C.text, fontFamily: Fonts.titleBold },
                      ]}
                    >
                      {dayNum}
                    </Text>
                    <View
                      style={[
                        styles.dayChipDot,
                        isDone && styles.dayChipDotDone,
                        isToday && styles.dayChipDotToday,
                      ]}
                    />
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View
            style={{
              opacity: restFade,
              transform: [{ translateY: restSlide }],
              marginTop: 24,
            }}
          >
            <View style={styles.ctaStack}>
              <AnimatedPressable
                style={styles.libraryRow}
                hoverStyle={styles.libraryRowHovered}
                scaleValue={0.97}
                onPress={() => {
                  if (__DEV__) {
                    console.log('[Home] Opening library route', {
                      currentDay: state.currentDay,
                      tierLevel: state.tierLevel,
                    });
                  }
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/library');
                }}
                testID="open-library-home"
              >
                <View style={styles.libraryIconWrap}>
                  <Play size={12} color={C.white} fill={C.white} />
                </View>
                <View style={styles.libraryCopy}>
                  <Text style={[styles.libraryLabel, { fontFamily: Fonts.titleMedium }]} numberOfLines={1}>Prayer Library</Text>
                  <Text style={[styles.librarySub, { fontFamily: Fonts.italic }]} numberOfLines={1}>Browse all 30 days. Partner unlocks the full archive.</Text>
                </View>
                <ChevronRight size={14} color={C.chevronMuted} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.supportRow}
                hoverStyle={styles.supportRowHovered}
                scaleValue={0.97}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/paywall');
                }}
                testID="support-cause-home"
              >
                <View style={styles.supportHeart}>
                  <Heart size={12} color={C.white} fill={C.white} />
                </View>
                <Text style={[styles.supportLabel, { fontFamily: Fonts.titleMedium }]} numberOfLines={1}>Support Development</Text>
                <ChevronRight size={14} color={C.chevronMuted} />
              </AnimatedPressable>
            </View>
          </Animated.View>

          {!hasCompletedSessionToday ? (
            <Animated.View
              style={{
                opacity: restFade,
                transform: [{ translateY: restSlide }],
                marginTop: 20,
                marginBottom: 12,
              }}
            >
              <AnimatedPressable
                style={styles.goldBorderButton}
                onPress={() => {
                  router.push('/session');
                }}
                scaleValue={0.96}
                hapticStyle={Haptics.ImpactFeedbackStyle.Medium}
                testID="begin-today-cta"
              >
                <Play size={15} color={C.accent} fill={C.accent} />
                <Text style={[styles.goldBorderButtonText, { fontFamily: Fonts.titleLight }]}>BEGIN TODAY</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : (
            <Animated.View
              style={{
                opacity: restFade,
                transform: [{ translateY: restSlide }],
                marginTop: 20,
                marginBottom: 12,
                alignItems: 'center',
              }}
            >
              <View style={styles.completedSessionCTA}>
                <Check size={16} color={C.accent} strokeWidth={3} />
                <Text style={[styles.completedSessionCTAText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>DAILY PRACTICE COMPLETE</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

    </View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  authSoftPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    backgroundColor: C.supportRowBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 20,
    alignSelf: 'flex-start',
  },
  authSoftPromptText: {
    fontSize: T.scale(10),
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  reminderPrompt: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: C.sageBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.sageLight,
    marginTop: 14,
    alignSelf: 'flex-start' as const,
  },
  reminderPromptText: {
    fontSize: 9.2,
    letterSpacing: 1.5,
    color: C.sageDark,
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 8,
    paddingBottom: 140,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
  },
  loadingGlow: {
    position: 'absolute',
    top: 88,
    alignSelf: 'center',
  },
  loadingContent: {
    width: '100%',
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingHeaderSkeleton: {
    height: 24,
    width: 144,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingHeroSkeleton: {
    height: 240,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingRowSkeleton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingRowSkeletonShort: {
    height: 56,
    width: '72%',
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  ambientVeil: {
    ...StyleSheet.absoluteFillObject,
  },
  ambientWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -164,
    left: Math.round(Dimensions.get('window').width / 2) - 280,
  },
  ambientTopGlowWide: {
    position: 'absolute',
    top: -208,
    left: Math.round(Dimensions.get('window').width / 2) - 350,
    opacity: 0.92,
  },
  ambientEllipse: {
    transform: [{ scaleY: 0.58 }],
  },
  ambientWideEllipse: {
    transform: [{ scaleY: 0.42 }],
  },
  ambientSideGlow: {
    position: 'absolute',
    top: 144,
    right: -128,
    opacity: 0.78,
  },
  ambientLowerGlow: {
    position: 'absolute',
    bottom: 160,
    left: -118,
    opacity: 0.62,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.pillBorder,
    backgroundColor: C.pillBg,
    gap: 7,
  },
  streakPillUrgent: {
    borderColor: C.rose,
    backgroundColor: C.roseBg,
  },
  streakEmoji: {
    fontSize: T.scale(13),
  },
  streakText: {
    fontSize: T.scale(11),
    letterSpacing: 0.3,
    color: C.streakText,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.pillBorder,
    backgroundColor: C.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  wordmark: {
    fontSize: T.scale(38),
    letterSpacing: 6,
    color: '#F5EFE7',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  wordmarkSub: {
    fontSize: T.scale(12),
    letterSpacing: 2,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
  },
  greetingLabel: {
    fontSize: T.scale(11),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 8,
    opacity: 0.8,
  },
  greetingSection: {
    position: 'relative',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  greetingGlow: {
    position: 'absolute',
    top: -88,
    left: -84,
    opacity: 0.9,
  },
  greetingGlowShape: {
    transform: [{ scaleY: 0.62 }, { rotate: '-10deg' }],
  },
  greetingName: {
    fontSize: T.scale(44),
    lineHeight: 48,
    letterSpacing: -1,
    color: C.text,
    marginBottom: 8,
  },
  greetingSub: {
    fontSize: T.scale(16),
    lineHeight: 24,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 17,
    paddingVertical: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.accentBg,
    marginTop: 20,
    marginBottom: 24,
  },
  streakCardFrozen: {
    borderColor: C.sageLight,
    backgroundColor: C.sageBg,
  },
  streakCardTextFrozen: {
    color: C.sageDark,
  },
  streakCardStrongFrozen: {
    color: C.sage,
  },
  streakCardEmoji: {
    fontSize: T.scale(20),
  },
  streakCardText: {
    flex: 1,
    fontSize: T.scale(12),
    letterSpacing: 0.3,
    color: C.textSecondary,
  },
  streakCardStrong: {
    color: C.accentDark,
  },
  progressSection: {
    marginBottom: 28,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  progressDay: {
    fontSize: T.scale(11),
    color: C.textSecondary,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.border,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.accent,
    minWidth: 14,
  },
  progressDot: {
    position: 'absolute',
    right: -5,
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  sectionEyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    marginBottom: 16,
    color: C.accentDark,
    opacity: 0.85,
  },
  todayCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent,
    overflow: 'hidden',
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      web: { boxShadow: `0 4px 16px rgba(180,116,53,0.1)` },
    }),
  },
  todayCardInner: {
    padding: 16,
    position: 'relative',
  },
  todayCardGlow: {
    position: 'absolute',
    top: -72,
    right: -28,
    opacity: 0.74,
  },
  todayCardGlowSecondary: {
    position: 'absolute',
    bottom: -82,
    left: -36,
    opacity: 0.4,
  },
  todayCardAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },

  todayCardDay: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
    color: C.accent,
  },
  todayCardTitle: {
    fontSize: T.scale(30),
    lineHeight: 34,
    letterSpacing: -0.3,
    marginBottom: 10,
    color: C.text,
  },
  todayCardDesc: {
    fontSize: T.scale(15),
    lineHeight: 26,
    marginBottom: 18,
    color: C.textSecondary,
  },
  todayCardRule: {
    height: 1,
    marginVertical: 16,
    backgroundColor: C.border,
  },
  triadPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triadPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.chipBorder,
  },
  triadPillActive: {
    backgroundColor: C.accent,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  triadPillLabel: {
    fontSize: T.scale(9.5),
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
    opacity: 0.7,
    marginLeft: 4,
  },
  todayCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  resumeBadge: {
    marginTop: 12,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.chipActiveBg,
    justifyContent: 'center',
  },
  resumeBadgeText: {
    fontFamily: Fonts.titleMedium,
    fontSize: T.scale(9),
    letterSpacing: 1.5,
    color: C.accent,
    textTransform: 'uppercase' as const,
  },
  tomorrowCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.phaseCardBg,
    alignItems: 'center',
  },
  tomorrowEyebrow: {
    fontFamily: Fonts.titleMedium,
    fontSize: T.scale(10),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
    marginBottom: 4,
  },
  tomorrowTitle: {
    fontFamily: Fonts.serifLight,
    fontSize: T.scale(18),
    lineHeight: 24,
    color: C.textSecondary,
    textAlign: 'center' as const,
  },
  todayCardCtaText: {
    fontSize: T.scale(12),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  completedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.chipActiveBg,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
  },
  dayStrip: {
    marginBottom: 10,
  },
  dayStripContent: {
    gap: 7,
    paddingRight: 8,
  },
  dayChip: {
    width: 46,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.dayChipBg,
  },
  dayChipDone: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.dayChipDoneBg,
  },
  dayChipToday: {
    borderColor: C.accent,
    backgroundColor: C.dayChipTodayBg,
  },
  dayChipLocked: {
    backgroundColor: C.dayChipLockedBg,
    borderColor: C.borderLight,
  },
  dayChipNum: {
    fontSize: T.scale(13),
    color: C.dayChipText,
  },
  dayChipNumDone: {
    color: C.accent,
  },
  dayChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dayChipDotDone: {
    backgroundColor: C.accent,
  },
  dayChipDotToday: {
    backgroundColor: C.accent,
  },
  quoteCard: {
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.1)',
    borderRadius: 18,
    padding: 22,
    marginBottom: 14,
    backgroundColor: C.supportRowBg,
  },
  quoteText: {
    fontSize: T.scale(14),
    lineHeight: 24,
    marginBottom: 10,
    color: C.quoteText,
  },
  quoteAuthor: {
    fontSize: T.scale(10),
    letterSpacing: 0.3,
    color: C.textMuted,
  },
  ctaStack: {
    gap: 12,
  },
  libraryRow: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.supportRowBg,
  },
  libraryRowHovered: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.supportRowHoverBg,
  },
  libraryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  libraryCopy: {
    flex: 1,
    gap: 4,
  },
  libraryLabel: {
    fontSize: T.scale(13),
    letterSpacing: 0.1,
    color: C.text,
  },
  librarySub: {
    fontSize: T.scale(12),
    color: C.textMuted,
  },
  supportRow: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    backgroundColor: C.supportRowBg,
  },
  supportRowHovered: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.supportRowHoverBg,
  },
  supportHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  supportLabel: {
    flex: 1,
    fontSize: T.scale(13),
    letterSpacing: 0.1,
    color: C.text,
  },
  goldBorderButton: {
    minHeight: 56,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: 'transparent',
  },
  goldBorderButtonText: {
    fontSize: T.scale(13),
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  ghostButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ghostButtonText: {
    fontSize: T.scale(14),
    letterSpacing: 0.2,
    color: C.textMuted,
  },
  completionContainer: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    backgroundColor: C.supportRowBg,
  },
  completionInnerOrb: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentBg,
  },
  completionEyebrow: {
    fontSize: T.scale(11),
    letterSpacing: 2.4,
    marginBottom: 12,
    color: C.textMuted,
  },
  completionTitle: {
    fontSize: T.scale(32),
    lineHeight: 40,
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 14,
    color: C.text,
  },
  completionMessage: {
    fontSize: T.scale(15),
    lineHeight: 26,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 36,
    color: C.quoteText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    maxHeight: '85%',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
      }
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalDayLabel: {
    fontSize: T.scale(10),
    letterSpacing: 3,
    color: C.accent,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: T.scale(22),
    color: C.text,
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: {
    flex: 0,
  },
  modalBody: {
    gap: 20,
    paddingBottom: 20,
  },
  modalFooter: {
    marginTop: 20,
    width: '100%',
  },
  reviewSection: {
    gap: 8,
  },
  sectionLbl: {
    fontSize: T.scale(8),
    letterSpacing: 2,
    color: C.textMuted,
  },
  truthText: {
    fontSize: T.scale(18),
    lineHeight: 28,
    color: C.text,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  verseText: {
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  shareBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 20,
  },
  shareBtnText: {
    fontSize: T.scale(12),
    color: '#FFF',
    letterSpacing: 1.2,
  },
  fullText: {
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textSecondary,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
  completedSessionCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: C.chipActiveBg,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
  },
  completedSessionCTAText: {
    fontSize: T.scale(12),
    letterSpacing: 1.5,
    color: C.sage,
  },
  /* ── Milestone tick marks ── */
  milestoneTick: {
    position: 'absolute' as const,
    width: 1,
    height: 9,
    top: -2,
    backgroundColor: 'rgba(200,137,74,0.28)',
    transform: [{ translateX: -0.5 }],
  },
  milestoneLabels: {
    position: 'relative' as const,
    height: 18,
    marginTop: 10,
    marginBottom: 6,
  },
  milestoneLabelWrap: {
    position: 'absolute' as const,
    transform: [{ translateX: -8 }],
  },
  milestoneTick_label: {
    fontSize: 9.2,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    opacity: 0.65,
  },
  /* ── Soundscape row on today card ── */
  soundscapeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  soundscapeRowLabel: {
    fontSize: T.scale(9),
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.5)',
  },
  soundscapeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
  },
  soundscapeChipActive: {
    borderColor: 'rgba(200,137,74,0.4)',
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  soundscapeChipText: {
    fontSize: T.scale(8.5),
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.5)',
  },
  soundscapeChipTextActive: {
    color: '#180C02',
  },
  /* ── The Drop (Daily Variable Surprise) ── */
  dropCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.borderLight,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  dropGlowWrap: {
    position: 'absolute' as const,
    top: -50,
    right: -50,
  },
  dropEyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 10,
  },
  dropQuote: {
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 10,
  },
  dropRef: {
    fontSize: 13,
  },
  
  /* ── Weekly Wrapped Banner ── */
  wrappedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
  },
  wrappedEmoji: {
    fontSize: 27.6,
  },
  wrappedTextWrap: {
    flex: 1,
    gap: 4,
  },
  wrappedTitle: {
    fontSize: 12.6,
    letterSpacing: 2,
    color: 'rgba(200,137,74,0.85)',
  },
  wrappedSub: {
    fontSize: 16.1,
    color: 'rgba(244,237,224,0.7)',
  },
});
