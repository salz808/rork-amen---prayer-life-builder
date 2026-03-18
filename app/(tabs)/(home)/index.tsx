import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Heart,
  Lock,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import SettingsSheet from '@/components/SettingsSheet';
import ReflectionModal from '@/components/ReflectionModal';
import { Fonts } from '@/constants/fonts';
import { getDayContent, getPhaseLabel } from '@/mocks/content';
import { getDailyEncouragement } from '@/mocks/encouragements';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';
import { WeeklyReflection } from '@/types';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';



function getEncouragingSub(completedDays: number): string {
  if (completedDays === 0) return "You showed up. That's everything.";
  if (completedDays === 1) return 'Day 1 complete. The groove has begun.';
  if (completedDays <= 3) return 'Something real is forming.';
  if (completedDays <= 6) return 'Keep walking in freedom.';
  if (completedDays === 7) return 'One week. You are not the same.';
  if (completedDays <= 13) return 'Your prayer life is becoming real.';
  if (completedDays === 14) return "Halfway. Look how far you've come.";
  if (completedDays <= 20) return "Look at the confidence you're carrying.";
  if (completedDays === 21) return 'Three weeks. Something has changed.';
  if (completedDays <= 29) return "Almost there. You're ready.";
  return "You don't need this app anymore. But you're always welcome.";
}

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
    continueDaily,
    saveReflection,
    setSoundscape,
    isStreakFrozen,
  } = useApp();
  const isLargeFont = state.fontSize === 'large';
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [reflectionVisible, setReflectionVisible] = useState<boolean>(false);
  const reflectionWeek = 1;

  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(30)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(40)).current;
  const glowPulse = useRef(new Animated.Value(0.25)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const encouragement = useMemo(() => getDailyEncouragement(), []);

  const completedDays = useMemo(
    () => state.progress.filter((item) => item.completed).length,
    [state.progress]
  );
  const progressPercent = useMemo(
    () => Math.max(3.3, (completedDays / 30) * 100),
    [completedDays]
  );

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.55,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.25,
          duration: 5000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(translateAnim, {
          toValue: 0,
          tension: 30,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(ctaFade, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.spring(ctaSlide, {
          toValue: 0,
          tension: 35,
          friction: 9,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fadeAnim, translateAnim, ctaFade, ctaSlide, glowPulse]);

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: progressPercent,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressWidth]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#C89A5A" size="large" />
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
                <Check size={28} color="#C89A5A" strokeWidth={2.4} />
              </View>
            </View>
            <Text style={[styles.completionEyebrow, { fontFamily: Fonts.titleMedium }]}>JOURNEY COMPLETE</Text>
            <Text style={[styles.completionTitle, { fontFamily: Fonts.serifLight }]}>30 days of{'\n'}showing up</Text>
            <Text style={[styles.completionMessage, { fontFamily: Fonts.italic }]}>
              You have built a sacred daily rhythm.{'\n'}Stay close and begin again.
            </Text>
            <AnimatedPressable
              style={styles.goldBorderButton}
              onPress={() => {
                continueDaily();
              }}
              scaleValue={0.96}
              testID="continue-daily"
            >
              <RotateCcw size={15} color="#C89A5A" />
              <Text style={[styles.goldBorderButtonText, { fontFamily: Fonts.titleLight }]}>CONTINUE DAILY</Text>
            </AnimatedPressable>
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
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: translateAnim }],
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
                    <AlertTriangle size={13} color={graceUrgent ? '#D4766A' : '#C89A5A'} />
                    <Text style={[styles.streakText, { fontFamily: Fonts.titleMedium, color: graceUrgent ? '#D4766A' : C.streakText }]}>
                      {graceUrgent ? 'Pray today' : 'Grace window'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSettingsVisible(true);
                }}
                style={({ pressed, hovered }: any) => [
                  styles.settingsBtn,
                  (pressed || hovered) && styles.settingsBtnHovered,
                ]}
                testID="open-settings"
              >
                <Settings2 size={17} color={C.settingsIcon} />
              </Pressable>
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

            {state.streakCount > 0 && (
              <View style={[styles.streakCard, isStreakFrozen && styles.streakCardFrozen]}>
                <Text style={styles.streakCardEmoji}>{isStreakFrozen ? '🧊' : '🔥'}</Text>
                <Text style={[styles.streakCardText, { fontFamily: Fonts.titleLight }, isStreakFrozen && { color: 'rgba(128,188,255,0.7)' }]}>
                  <Text style={[styles.streakCardStrong, { fontFamily: Fonts.titleMedium }, isStreakFrozen && { color: 'rgba(128,188,255,0.95)' }]}>
                    {state.streakCount}-day streak
                  </Text>
                  {isStreakFrozen ? ' · Grace day active' : ' · Keep walking in freedom'}
                </Text>
              </View>
            )}
          </Animated.View>

          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: translateAnim }],
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
          </Animated.View>

          {/* Weekly Wrapped Notification */}
          {[8, 15, 22, 31].includes(state.currentDay) && !hasCompletedSessionToday && (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }], marginBottom: 16 }}>
              <Pressable
                style={({ pressed, hovered }: any) => [
                  styles.wrappedBanner,
                  (pressed || hovered) && styles.wrappedBannerHovered,
                ]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/journey');
                }}
              >
                <Text style={styles.wrappedEmoji}>✨</Text>
                <View style={styles.wrappedTextWrap}>
                  <Text style={[styles.wrappedTitle, { fontFamily: Fonts.titleBold }]}>
                    WEEK {state.currentDay === 8 ? 1 : state.currentDay === 15 ? 2 : state.currentDay === 22 ? 3 : 4} WRAPPED
                  </Text>
                  <Text style={[styles.wrappedSub, { fontFamily: Fonts.serifRegular }]}>
                    Your insights are ready. See how you've grown.
                  </Text>
                </View>
                <ChevronRight size={16} color="rgba(200,137,74,0.5)" />
              </Pressable>
            </Animated.View>
          )}

          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: translateAnim }],
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
              hoverStyle={styles.todayCardHovered}
            >
              <LinearGradient
                colors={[C.surfaceElevated, C.cardGradientEnd]}
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
                  colors={['transparent', 'rgba(200,137,74,0.25)', 'transparent']}
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

                <View style={styles.todayCardRule} />


                <View style={styles.triadPills}>
                  {['Thank', 'Repent', 'Invite', 'Ask', 'Declare'].map((pill, i) => (
                    <View key={pill} style={i === 0 ? styles.triadPillActive : styles.triadPill} />
                  ))}
                  <Text style={[styles.triadPillLabel, { fontFamily: Fonts.titleLight }]}>5 prayer phases</Text>
                </View>


                {hasCompletedSessionToday ? (
                  <>
                    <View style={[styles.todayCardCta, { opacity: 0.9 }]}>
                      <View style={[styles.completedBadge, { backgroundColor: 'rgba(200,137,74,0.15)', borderColor: 'rgba(200,137,74,0.3)' }]}>
                        <Check size={11} color={C.accent} strokeWidth={3} />
                      </View>
                      <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>Completed today</Text>
                    </View>
                    {displayDay < 30 && (
                      <View style={{ marginTop: 16, padding: 14, backgroundColor: 'rgba(200,137,74,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(200,137,74,0.15)', alignItems: 'center' as const }}>
                        <Text style={{ fontFamily: Fonts.titleMedium, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase' as const, color: 'rgba(200,137,74,0.6)', marginBottom: 4 }}>
                          Tomorrow • Day {displayDay + 1}
                        </Text>
                        <Text style={{ fontFamily: Fonts.serifLight, fontSize: 16, color: 'rgba(244,237,224,0.8)', textAlign: 'center' as const }}>
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
                    <ChevronRight size={14} color="#C8894A" />
                  </View>
                )}
              </LinearGradient>
            </AnimatedPressable>
          </Animated.View>

          <Animated.View
            style={{
              opacity: ctaFade,
              transform: [{ translateY: ctaSlide }],
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
                  <Pressable
                    key={dayNum}
                    onPress={() => handleReviewDay(dayNum)}
                    style={({ pressed, hovered }: any) => [
                      styles.dayChip,
                      isDone && styles.dayChipDone,
                      isToday && styles.dayChipToday,
                      isLocked && styles.dayChipLocked,
                      pressed && isDone && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                      hovered && !isLocked && styles.dayChipHovered,
                    ]}
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
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View
            style={{
              opacity: ctaFade,
              transform: [{ translateY: ctaSlide }],
              marginTop: 24,
            }}
          >
            <View style={styles.quoteCard}>
              <Sparkles size={12} color="#C89A5A" style={{ marginBottom: 10, opacity: 0.6 }} />
              <Text style={[styles.quoteText, { fontFamily: Fonts.italic }]}>
                &ldquo;{encouragement.text}&rdquo;
              </Text>
              <Text style={[styles.quoteAuthor, { fontFamily: Fonts.titleMedium }]}>
                {encouragement.author}
              </Text>
            </View>

            <Pressable
              style={({ pressed, hovered }: any) => [
                styles.supportRow,
                (pressed || hovered) && styles.supportRowHovered,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/paywall');
              }}
              testID="support-cause-home"
            >
              <View style={styles.supportHeart}>
                <Heart size={12} color="#F5EFE7" fill="#F5EFE7" />
              </View>
              <Text style={[styles.supportLabel, { fontFamily: Fonts.titleMedium }]} numberOfLines={1}>Support This Cause</Text>
              <ChevronRight size={14} color={C.iconMuted} />
            </Pressable>
          </Animated.View>

          {!hasCompletedSessionToday ? (
            <Animated.View
              style={{
                opacity: ctaFade,
                transform: [{ translateY: ctaSlide }],
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
                hoverStyle={styles.goldBorderButtonHovered}
              >
                <Play size={15} color="#C89A5A" fill="#C89A5A" />
                <Text style={[styles.goldBorderButtonText, { fontFamily: Fonts.titleLight }]}>BEGIN TODAY</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : (
            <Animated.View
              style={{
                opacity: ctaFade,
                transform: [{ translateY: ctaSlide }],
                marginTop: 20,
                marginBottom: 12,
                alignItems: 'center',
              }}
            >
              <View style={[styles.completedSessionCTA, { backgroundColor: 'rgba(200,137,74,0.1)', borderColor: 'rgba(200,137,74,0.2)' }]}>
                <Check size={16} color={C.accent} strokeWidth={3} />
                <Text style={[styles.completedSessionCTAText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>DAILY PRACTICE COMPLETE</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

      <SettingsSheet visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <ReflectionModal
        visible={reflectionVisible}
        week={reflectionWeek}
        onSave={(reflection: WeeklyReflection) => {
          saveReflection(reflection);
        }}
        onClose={() => setReflectionVisible(false)}
      />
    </View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
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
    borderColor: 'rgba(212,118,106,0.3)',
    backgroundColor: 'rgba(212,118,106,0.08)',
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
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  settingsBtnHovered: {
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.08)',
    transform: [{ scale: 1.05 }],
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
    marginBottom: 6,
  },
  greetingSection: {
    position: 'relative',
    marginBottom: 24,
  },
  greetingGlow: {
    position: 'absolute',
    top: -88,
    left: -84,
    opacity: 0.72,
  },
  greetingGlowShape: {
    transform: [{ scaleY: 0.62 }, { rotate: '-10deg' }],
  },
  greetingName: {
    fontSize: T.scale(40),
    lineHeight: 44,
    letterSpacing: -0.5,
    color: C.text,
    marginBottom: 6,
  },
  greetingSub: {
    fontSize: T.scale(15.5),
    lineHeight: 24,
    color: C.textSecondary,
    letterSpacing: 0.2,
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
    marginTop: 22,
    marginBottom: 28,
  },
  streakCardFrozen: {
    borderColor: 'rgba(128,188,255,0.2)',
    backgroundColor: 'rgba(128,188,255,0.06)',
  },
  streakCardEmoji: {
    fontSize: T.scale(20),
  },
  streakCardText: {
    flex: 1,
    fontSize: T.scale(12),
    letterSpacing: 0.3,
    color: C.textMuted,
  },
  streakCardStrong: {
    color: '#D4AD6A',
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
    color: C.accent,
  },
  progressDay: {
    fontSize: T.scale(11),
    color: C.textMuted,
  },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(200,137,74,0.12)',
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
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 5,
  },
  sectionEyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    marginBottom: 14,
    color: C.accent,
    opacity: 0.55,
  },
  todayCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 28,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  todayCardHovered: {
    borderColor: 'rgba(200,154,90,0.35)',
    shadowColor: '#C89A5A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  todayCardInner: {
    padding: 28,
    paddingHorizontal: 26,
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
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  triadPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triadPill: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(200,137,74,0.35)',
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
  todayCardCtaText: {
    fontSize: T.scale(12),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  completedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(142,176,132,0.15)',
  },
  dayStrip: {
    marginBottom: 4,
  },
  dayStripContent: {
    gap: 7,
    paddingRight: 8,
  },
  dayChip: {
    width: 42,
    height: 52,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  dayChipDone: {
    borderColor: 'rgba(200,154,90,0.15)',
    backgroundColor: 'rgba(200,154,90,0.06)',
  },
  dayChipToday: {
    borderColor: 'rgba(200,154,90,0.4)',
    backgroundColor: 'rgba(200,154,90,0.1)',
  },
  dayChipLocked: {
    opacity: 0.25,
  },
  dayChipHovered: {
    borderColor: 'rgba(200,154,90,0.3)',
    backgroundColor: 'rgba(200,154,90,0.12)',
    transform: [{ scale: 1.08 }],
  },
  dayChipNum: {
    fontSize: T.scale(13),
    color: C.dayChipText,
  },
  dayChipNumDone: {
    color: '#C89A5A',
  },
  dayChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dayChipDotDone: {
    backgroundColor: '#C89A5A',
  },
  dayChipDotToday: {
    backgroundColor: '#F5EFE7',
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
  supportRow: {
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.1)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    backgroundColor: C.supportRowBg,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  supportRowHovered: {
    borderColor: 'rgba(200,154,90,0.28)',
    backgroundColor: 'rgba(200,154,90,0.09)',
  },
  supportHeart: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C89A5A',
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
    borderColor: 'rgba(200,154,90,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  goldBorderButtonHovered: {
    borderColor: 'rgba(200,154,90,0.7)',
    backgroundColor: 'rgba(200,154,90,0.08)',
    shadowColor: '#C89A5A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  goldBorderButtonText: {
    fontSize: T.scale(13),
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
    color: '#C89A5A',
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
    borderColor: 'rgba(200,154,90,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    backgroundColor: 'rgba(200,154,90,0.05)',
  },
  completionInnerOrb: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,154,90,0.08)',
  },
  completionEyebrow: {
    fontSize: T.scale(11),
    letterSpacing: 2.4,
    marginBottom: 12,
    color: 'rgba(200,154,90,0.5)',
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
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(142,176,132,0.1)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(142,176,132,0.2)',
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
    height: 16,
    marginTop: 6,
  },
  milestoneLabelWrap: {
    position: 'absolute' as const,
    transform: [{ translateX: -8 }],
  },
  milestoneTick_label: {
    fontSize: 8,
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
  soundscapeChipHovered: {
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.15)',
    transform: [{ scale: 1.05 }],
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
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  wrappedEmoji: {
    fontSize: 24,
  },
  wrappedTextWrap: {
    flex: 1,
    gap: 2,
  },
  wrappedTitle: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(200,137,74,0.85)',
  },
  wrappedSub: {
    fontSize: 14,
    color: 'rgba(244,237,224,0.7)',
  },
  wrappedBannerHovered: {
    borderColor: 'rgba(200,137,74,0.28)',
    backgroundColor: 'rgba(200,137,74,0.1)',
    transform: [{ scale: 1.02 }],
  },
});
