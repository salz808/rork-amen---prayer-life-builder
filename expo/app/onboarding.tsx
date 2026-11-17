import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import BackgroundGradient from '@/components/BackgroundGradient';
import { screenPadding } from '@/constants/theme';
import { ArrowLeft, BookOpen, Check, ChevronRight, Heart, Home, Moon, Shield, Users } from 'lucide-react-native';

import AnimatedPressable from '@/components/AnimatedPressable';
import GlowButton from '@/components/GlowButton';
import RadialGlow from '@/components/RadialGlow';
import SplashMotion from '@/components/SplashMotion';
import SplashBackdrop from '@/components/SplashBackdrop';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useTypography } from '@/hooks/useTypography';
import { useApp } from '@/providers/AppProvider';
import { CHECKLIST_ITEMS } from '@/mocks/checklist';
import { UserProfile } from '@/types';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { useFontGateOpen } from '@/lib/fontGate';
import { getLaunchSplashSession } from '@/lib/splashMotion';

type Step = 'splash' | 'name' | 'blocker' | 'truth' | 'promise' | 'reminder' | 'finale';

type ThemeColors = ReturnType<typeof useColors>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_STAGGER_LIMIT = 5;
const CARD_STAGGER_STEP_MS = 40;

const BLOCKER_OPTIONS = [
  "I don't know the right words to pray",
  'It feels one-sided. Like talking to a wall.',
  "I can't stay consistent. I keep forgetting.",
  'I feel too broken or far from God to start',
  'Other',
] as const;

const BLOCKER_TRUTHS: Record<string, { lie: string; truth: string }> = {
  "I don't know the right words to pray": {
    lie: 'I have to sound perfectly put together for God to hear me.',
    truth:
      "God delights in the honest, messy cries of His children. When we have no words, the Holy Spirit prays for us.",
  },
  'It feels one-sided. Like talking to a wall.': {
    lie: "God isn't listening or doesn't care enough to answer.",
    truth:
      'God is always here. He is always listening. Sometimes He answers with a quiet whisper, a new way to see things, or peace while you wait.',
  },
  "I can't stay consistent. I keep forgetting.": {
    lie: 'My inconsistency disqualifies me from relationship.',
    truth:
      "God's love does not rest on how well you do. His mercies are new every morning. He is waiting whenever you turn to Him.",
  },
  'I feel too broken or far from God to start': {
    lie: 'I have to clean up my act before I can approach God.',
    truth:
      'Jesus came for the sick, not the healthy. He runs to meet you right where you are, right in your mess.',
  },
  Other: {
    lie: 'My specific struggle is too unique or difficult for prayer to help.',
    truth:
      'Nothing is hidden from God. Nothing is too hard for Him. He knows your burden, and He holds it with care.',
  },
};

const BLOCKER_TO_PRAYER: Record<string, UserProfile['prayerLife']> = {
  "I don't know the right words to pray": 'new',
  'It feels one-sided. Like talking to a wall.': 'inconsistent',
  "I can't stay consistent. I keep forgetting.": 'inconsistent',
  'I feel too broken or far from God to start': 'new',
  Other: 'new',
};

// Round-5 lane 3, L3 + H1: zero-width/format characters are invisible but
// survive trim(), and the DB caps first_name at 40 characters. Strip the
// format characters at input; the 40 cap lives on the TextInput itself.
// Round-6 lane B: also strip U+2060 (word joiner) and bidi controls
// (U+202A-U+202E, U+2066-U+2069) — an invisible-only name must fail the
// non-empty gate. U+200E/U+200F, U+061C, U+2061-U+2064 deliberately kept:
// they have plausible mixed-direction use.
const stripFormatChars = (value: string): string =>
  value.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2060\u2066-\u2069]/g, '');

function createCardAnimValues(count: number) {
  return Array.from({ length: count }, () => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(16),
  }));
}

function animateCardSet(
  values: { opacity: Animated.Value; translateY: Animated.Value }[],
  activeCount: number,
  reduceMotion: boolean,
) {
  values.forEach((item, index) => {
    const shouldAnimate = index < activeCount && index < CARD_STAGGER_LIMIT;
    // Reduce Motion: no stagger — cards render at rest immediately.
    if (reduceMotion || !shouldAnimate) {
      item.opacity.setValue(1);
      item.translateY.setValue(0);
      return;
    }

    item.opacity.setValue(0);
    item.translateY.setValue(16);

    Animated.parallel([
      Animated.timing(item.opacity, {
        toValue: 1,
        duration: 260,
        delay: index * CARD_STAGGER_STEP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(item.translateY, {
        toValue: 0,
        duration: 260,
        delay: index * CARD_STAGGER_STEP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  });
}

function getPromiseReflection(selectedBlocker: string | null) {
  if (selectedBlocker === BLOCKER_OPTIONS[0]) {
    return {
      lead: "You said you don't know the right words to pray.",
      emphasis: "That is why we wrote every word for you.",
      tail: "For the next seven days, you will not need to find one phrase alone.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[1]) {
    return {
      lead: 'You said prayer feels one-sided, like talking to a wall.',
      emphasis: 'We hear you. Most of us start right here.',
      tail: "Today, we are not asking you to feel anything. Just come, and say the words.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[2]) {
    return {
      lead: 'You said consistency is the struggle.',
      // Round-5 lane 1, M2: the old copy advertised a monthly grace day to
      // spend, but no UI ever spends one — the streak simply holds when a
      // day or two is missed. Say the actual behavior.
      emphasis: "That's why we built reminders, and a streak that holds when life gets in the way.",
      tail: "We made this for people who keep forgetting. That is all of us.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[3]) {
    return {
      lead: 'You said you feel too broken or too far from God to start.',
      emphasis: 'Beloved, this is a good place to begin today.',
      tail: 'The distance you feel is not the truth about where God is.',
    };
  }

  return {
    lead: 'You brought a struggle.',
    emphasis: 'This is our promise: every struggle is a doorway,',
    tail: 'and He meets you here.',
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const reduceMotion = useReduceMotion();
  // Font gate (2026-11-17, Worker B): the onboarding splash step
  // passes this to SplashMotion so its text beats wait for real
  // fonts, exactly like the launch splash — the gate may still be
  // shut when this screen mounts (fonts timed out), and the hook
  // re-renders the splash when it opens. Before this the splash
  // relied on the fontsReady=true prop default, so a return visit
  // could render the tagline in the fallback sans.
  const fontGateOpen = useFontGateOpen();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, completeOnboarding } = useApp();
  // Audit round 3, J-B2: a veteran who briefly lands here (fresh sign-in
  // defaults onboardingComplete to false until the cloud profile reload
  // lands) is bounced home as soon as the flag becomes true — unless this
  // screen itself just finished onboarding, in which case finishOnboarding
  // owns the navigation (home or checklist).
  const finishingRef = useRef(false);
  useEffect(() => {
    if (state.user?.onboardingComplete && !finishingRef.current) {
      router.replace('/');
    }
  }, [state.user?.onboardingComplete, router]);

  const [step, setStep] = useState<Step>('splash');
  const [firstName, setFirstName] = useState<string>('');
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null);
  // Round-5 lane 3, M4: the old "Other" free-text input was required to
  // proceed but never stored, synced, or used — asking for text the app
  // throws away. The prompt is removed; the "Other" choice alone is the
  // answer, and the generic truth/promise copy covers it without guessing
  // a specific struggle.
  // The reminder time lives as one Date (native iOS time picker); the
  // 12-hour string is derived only when the choice is committed.
  const [reminderDate, setReminderDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d;
  });
  // The reminder choice is held here and only committed on the finale
  // screen ("Where things live"), which now ends onboarding.
  const [pendingReminderTime, setPendingReminderTime] = useState<string>('');
  // Inline validation messages: the footer CTA is always tappable, and a
  // blocked step explains itself instead of showing a dead button.
  const [nameError, setNameError] = useState(false);

  const contentOpacity = useState(() => new Animated.Value(1))[0]
  const contentTranslateX = useState(() => new Animated.Value(0))[0]
  const contentTranslateY = useState(() => new Animated.Value(0))[0]
  const isTransitioning = useRef<boolean>(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Splash motion one-time rule (components/SplashMotion.tsx): the
  // bloom + entrance play ONCE per session. The session is SHARED
  // with the launch splash (app/_layout.tsx, variant="launch") via
  // the module singleton getLaunchSplashSession(): the launch
  // entrance marks it played, so a first-run user who just saw the
  // launch motion gets this splash at rest with LET'S BEGIN live at
  // once. A fresh cold launch re-evaluates modules, so the singleton
  // is fresh; background/foreground does not replay it. Held in
  // state (not a ref) so the render reads it without a
  // ref-during-render violation — the only re-read that matters is
  // the next splash mount, which always follows a step change (a
  // re-render) anyway.
  const [splashSession] = useState(() => getLaunchSplashSession());
  const handleSplashPlayed = useCallback(() => {
    splashSession.markPlayed();
  }, [splashSession]);

  const [blockerCardAnims] = useState(() => createCardAnimValues(BLOCKER_OPTIONS.length));
  const [timeControlAnims] = useState(() => createCardAnimValues(2));

  // Splash motion lives in components/SplashMotion.tsx (Reanimated):
  // the old RN Animated entrance + orb pulse loop are gone — the pulse
  // loop was invisible (effective swing ~0.10–0.12) and is removed
  // entirely, not replaced. SplashMotion owns its own effect and
  // cancels its drift loop on unmount / leaving the step.

  useEffect(() => {
    if (step === 'blocker') {
      animateCardSet(blockerCardAnims, BLOCKER_OPTIONS.length, reduceMotion);
    }

    if (step === 'reminder') {
      animateCardSet(timeControlAnims, 2, reduceMotion);
    }
  }, [blockerCardAnims, reduceMotion, step, timeControlAnims]);

  const transitionTo = useCallback((nextStep: Step) => {
    if (isTransitioning.current) {
      return;
    }

    // Reduce Motion: no slide/fade — the next step renders at rest.
    if (reduceMotion) {
      setStep(nextStep);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    isTransitioning.current = true;

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateX, {
        toValue: -12,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 6,
        duration: 220,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(nextStep);
      contentOpacity.setValue(0);
      contentTranslateX.setValue(SCREEN_WIDTH * 0.12);
      contentTranslateY.setValue(0);
      scrollRef.current?.scrollTo({ y: 0, animated: false });

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        isTransitioning.current = false;
      });
    });
  }, [contentOpacity, contentTranslateX, contentTranslateY, reduceMotion]);

  /** Commit onboarding (from the finale screen) and land on Home — or on
   *  the First Steps checklist when the user taps that door. */
  const finishOnboarding = useCallback(
    (reminderTime: string, navigateToChecklist: boolean = false) => {
      finishingRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const prayerLife = BLOCKER_TO_PRAYER[selectedBlocker ?? ''] ?? 'new';
      const blockerIdx = selectedBlocker ? BLOCKER_OPTIONS.indexOf(selectedBlocker as (typeof BLOCKER_OPTIONS)[number]) : -1;

      completeOnboarding({
        // Round-5 lane 3, L3: strip zero-width/format characters — trim()
        // does not remove them, so a ZWSP-only "name" used to pass.
        firstName: stripFormatChars(firstName).trim(),
        prayerLife,
        reminderTime,
        onboardingComplete: true,
        blocker: blockerIdx,
      });

      // Audit round 3, J-S14: completeOnboarding already schedules the
      // daily reminder — the second schedule here used to double-book
      // it (a cancel-then-schedule each, so the user got one reminder,
      // but the duplicate write raced the first on slow devices).
      router.replace(navigateToChecklist ? '/journal/checklist' : '/');
    },
    [completeOnboarding, firstName, router, selectedBlocker],
  );

  const handleNext = useCallback(() => {
    if (isTransitioning.current) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (step === 'splash') {
      transitionTo('name');
      return;
    }

    if (step === 'name') {
      if (!stripFormatChars(firstName).trim()) {
        setNameError(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      transitionTo('blocker');
      return;
    }

    if (step === 'blocker') {
      // GPT-6 item 10: the blocker step no longer gates on a selection —
      // continuing without one keeps the defaults (prayerLife 'new',
      // the generic promise copy). With no struggle named there is no
      // lie/truth pair to show, so skip the truth step.
      transitionTo(selectedBlocker ? 'truth' : 'promise');
      return;
    }

    if (step === 'truth') {
      transitionTo('promise');
      return;
    }

    if (step === 'promise') {
      transitionTo('reminder');
      return;
    }

    if (step === 'reminder') {
      // Hold the choice — the finale screen ("Where things live") commits it.
      const h = reminderDate.getHours();
      const m = reminderDate.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const formattedTime = `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
      setPendingReminderTime(formattedTime);
      transitionTo('finale');
      return;
    }

    if (step === 'finale') {
      finishOnboarding(pendingReminderTime);
    }
  }, [finishOnboarding, firstName, pendingReminderTime, reminderDate, selectedBlocker, step, transitionTo]);

  const handleBack = useCallback(() => {
    if (isTransitioning.current) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const order: Step[] = ['splash', 'name', 'blocker', 'truth', 'promise', 'reminder', 'finale'];
    const currentIndex = order.indexOf(step);
    if (currentIndex <= 1) {
      transitionTo('splash');
      return;
    }
    let prev = order[currentIndex - 1] as Step;
    // The truth step only renders when a blocker was named — going back
    // past it with no selection lands on the blocker step instead of an
    // empty screen.
    if (prev === 'truth' && !selectedBlocker) {
      prev = 'blocker';
    }
    transitionTo(prev);
  }, [selectedBlocker, step, transitionTo]);

  const handleSkipName = useCallback(() => {
    if (isTransitioning.current) {
      return;
    }
    // GPT-6 item 10: the name is optional — skipping keeps firstName
    // empty and every greeting falls back to "Friend" (displayName
    // above, Home's greetingName, and the session welcome guard).
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    transitionTo('blocker');
  }, [transitionTo]);

  const handleSkipReminder = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Skipping the reminder still lands on the finale, which commits with
    // an empty reminder time.
    setPendingReminderTime('');
    transitionTo('finale');
  }, [transitionTo]);

  const displayName = stripFormatChars(firstName).trim() || 'Friend';
  const promiseReflection = getPromiseReflection(selectedBlocker);
  const stepMap: Record<Step, number> = {
    splash: -1,
    name: 0,
    blocker: 1,
    truth: 2,
    promise: 3,
    reminder: 4,
    finale: 5,
  };
  const stepIndex = stepMap[step];

  const renderProgressDots = () => {
    if (step === 'splash') {
      return null;
    }

    return (
      <View style={styles.dotsRow} testID="onboarding-progress-dots">
        {Array.from({ length: 6 }, (_, index) => {
          const active = index === stepIndex;
          return <View key={`dot-${index}`} style={[styles.dot, active && styles.dotActive]} />;
        })}
      </View>
    );
  };

  const getButtonLabel = () => {
    if (step === 'name') {
      return 'CONTINUE  →';
    }
    if (step === 'blocker') {
      return 'CONTINUE  →';
    }
    if (step === 'truth') {
      return 'CONTINUE  →';
    }
    if (step === 'promise') {
      return 'CONTINUE  →';
    }
    return 'CONTINUE  →';
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        {step === 'splash' ? (
          // Splash step — full-screen, OUTSIDE SafeAreaView /
          // KeyboardAvoidingView (2026-11-17, Worker B, layout parity):
          // the launch splash centres in the full screen, while the
          // safe-area insets would shift this splash's centred content
          // up on a notched iPhone. Same shared backdrop as the launch
          // overlay (components/SplashBackdrop), so the background
          // matches too; the themed gradient + veils below serve only
          // the non-splash steps.
          <View style={StyleSheet.absoluteFill}>
            <SplashBackdrop />
            <SplashMotion
              reduceMotion={reduceMotion}
              alreadyPlayed={splashSession.hasPlayed()}
              onEntrancePlayed={handleSplashPlayed}
              onBegin={handleNext}
              fontsReady={fontGateOpen}
            />
          </View>
        ) : (
          <>
            <BackgroundGradient
              colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.ambientVeilTop} />
            <View pointerEvents="none" style={styles.ambientVeilBottom} />
            <SafeAreaView style={styles.safeArea}>
              <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <>
                <View style={styles.topBar}>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={handleBack}
                    scaleValue={0.94}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.backButton}
                    testID="onboarding-back-button"
                  >
                    <ArrowLeft size={22} color={C.textSecondary} />
                  </AnimatedPressable>
                </View>
                <ScrollView
                  ref={scrollRef}
                  bounces={true}
                  decelerationRate="fast"
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  testID="onboarding-scroll"
                >
                  <View pointerEvents="none" style={styles.obGlowTopWrap}>
                    <RadialGlow size={288} maxOpacity={0.1} />
                  </View>

                  <Animated.View
                    style={[
                      styles.content,
                      {
                        opacity: contentOpacity,
                        transform: [
                          { translateX: contentTranslateX },
                          { translateY: contentTranslateY },
                        ],
                      },
                    ]}
                  >
                    {step === 'name' && (
                      <View>
                        <Text style={styles.eyebrow}>A NEW BEGINNING</Text>
                        <Text style={styles.screenTitle}>
                          What do people{`\n`}call <Text style={styles.accentItalic}>you?</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>
                        <Text style={styles.screenBody}>
                          God knew your name before He made the earth. He calls you beloved. We just want to say it back.
                        </Text>
                        <View style={styles.nameInputWrap}>
                          <TextInput
                            autoCapitalize="words"
                            autoFocus={true}
                            // Round-5 lane 3, H1 + L3: cap at the DB's 40 and
                            // strip zero-width/format characters on input.
                            maxLength={40}
                            onChangeText={(text) => {
                              setFirstName(stripFormatChars(text));
                              if (nameError) {
                                setNameError(false);
                              }
                            }}
                            onSubmitEditing={handleNext}
                            placeholder="Your first name"
                            placeholderTextColor={C.textMuted}
                            returnKeyType="next"
                            style={styles.nameInput}
                            testID="onboarding-name-input"
                            value={firstName}
                          />
                          {nameError && (
                            <Text style={styles.nameErrorText}>
                              Your first name helps us greet you. Type it above.
                            </Text>
                          )}
                          <Text style={styles.nameHelp}>
                            {/* Round-5 lane 2, L-5: testimonies the user later
                                chooses to share do carry a first name. */}
                            This is just between you and God, and us, except answered prayers you choose to share, which show your first name only.
                          </Text>
                        </View>
                        <AnimatedPressable
                          onPress={handleSkipName}
                          scaleValue={0.97}
                          style={styles.skipButton}
                          testID="onboarding-skip-name"
                        >
                          <Text style={styles.skipButtonText}>Skip for now</Text>
                        </AnimatedPressable>
                      </View>
                    )}

                    {step === 'blocker' && (
                      <View>
                        <Text style={styles.eyebrow}>BE HONEST WITH US</Text>
                        <Text style={styles.screenTitle}>
                          What usually{`\n`}holds back your{`\n`}
                          <Text style={styles.accentItalic}>prayer life, {displayName}?</Text>
                        </Text>
                        <Text style={styles.screenBody}>
                          No wrong answers here. <Text style={styles.accentItalicSoft}>Every struggle is a doorway</Text>. Freedom is on the other side of this one.
                        </Text>

                        <View style={styles.cardsStack}>
                          {BLOCKER_OPTIONS.map((option, index) => {
                            const isSelected = selectedBlocker === option;
                            const anim = blockerCardAnims[index];
                            return (
                              <Animated.View
                                key={option}
                                style={{
                                  opacity: anim.opacity,
                                  transform: [{ translateY: anim.translateY }],
                                }}
                              >
                                <AnimatedPressable
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isSelected }}
                                  hoverStyle={styles.choiceCardHover}
                                  onPress={() => {
                                    setSelectedBlocker(option);
                                  }}
                                  scaleValue={0.97}
                                  style={[
                                    styles.choiceCard,
                                    isSelected && styles.choiceCardActive,
                                  ]}
                                  testID={`blocker-option-${index}`}
                                >
                                  <Text style={[styles.choiceCardText, isSelected && styles.choiceCardTextActive]}>
                                    {option}
                                  </Text>
                                  {isSelected && (
                                    <View style={styles.choiceCheck}>
                                      <Check size={14} color={C.accentDark} strokeWidth={3} />
                                    </View>
                                  )}
                                </AnimatedPressable>
                              </Animated.View>
                            );
                          })}
                        </View>

                      </View>
                    )}

                    {step === 'truth' && selectedBlocker && (
                      <View style={styles.truthStep}>
                        <Text style={styles.eyebrow}>THE LIE VS THE TRUTH</Text>
                        <Text style={styles.screenTitle}>
                          Freeing your{`\n`}<Text style={styles.accentItalic}>perspective</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>

                        <View style={[styles.cardsStack, styles.truthCards]}>
                          <View style={styles.infoCardMuted}>
                            <Text style={styles.cardLabelMuted}>The Lie</Text>
                            <Text style={styles.struckBodyText}>
                              {BLOCKER_TRUTHS[selectedBlocker]?.lie}
                            </Text>
                          </View>
                          <View style={styles.infoCardAccent}>
                            <Text style={styles.cardLabelAccent}>God&apos;s Truth</Text>
                            <Text style={styles.truthBodyText}>
                              {BLOCKER_TRUTHS[selectedBlocker]?.truth}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {step === 'promise' && (
                      <View>
                        <Text style={styles.eyebrow}>YOUR INHERITANCE</Text>
                        <Text style={styles.screenTitle}>
                          Not a program.{`\n`}A <Text style={styles.accentItalic}>journey into wholeness.</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>
                        <Text style={styles.screenBody}>
                          Inheritance means what is yours as God&apos;s child, received, not earned.{`\n\n`}
                          In thirty days, you may pray without a script. You will know your voice with God, and His voice too. <Text style={styles.emphasisBody}>Freedom is possible. A deeper relationship with God is possible.</Text>
                        </Text>

                        <Text style={styles.promiseQuote}>
                          You are exactly the kind of person this was made for.
                        </Text>

                        {selectedBlocker !== null && (
                          <View style={styles.promiseCard}>
                            <Text style={styles.promiseText}>
                              {promiseReflection.lead} <Text style={styles.promiseEmphasis}>{promiseReflection.emphasis}</Text> {promiseReflection.tail}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {step === 'reminder' && (
                      <View>
                        <Text style={styles.eyebrow}>A GENTLE DAILY REMINDER</Text>
                        <Text style={styles.screenTitle}>
                          When should we{`\n`}remind <Text style={styles.accentItalic}>you?</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>
                        <Text style={styles.screenBody}>
                          A gentle nudge at the right time can help a new habit grow strong.
                        </Text>

                        <Animated.View
                          style={{
                            opacity: timeControlAnims[0].opacity,
                            transform: [{ translateY: timeControlAnims[0].translateY }],
                          }}
                        >
                          <View style={styles.timeCard}>
                            <DateTimePicker
                              value={reminderDate}
                              mode="time"
                              display="spinner"
                              onChange={(_event, date) => {
                                if (date) {
                                  setReminderDate(date);
                                }
                              }}
                              textColor={C.text}
                              themeVariant="dark"
                              testID="onboarding-time-picker"
                            />
                            <Animated.View
                              style={{
                                opacity: timeControlAnims[1].opacity,
                                transform: [{ translateY: timeControlAnims[1].translateY }],
                              }}
                            >
                              <Text style={styles.timeHelper}>
                                &quot;Day 1 is waiting for you, <Text style={styles.accentItalic}>{displayName}</Text>.&quot;{`\n`}
                                A gentle daily reminder at this time.
                              </Text>
                            </Animated.View>
                          </View>
                        </Animated.View>

                        <View style={styles.graceBadge}>
                          <Shield size={17} color={C.accentDark} />
                          {/* Round-5 lane 1, M2 + lane 2, L-3: no monthly
                              grace day exists to spend — say what actually
                              happens when a day is missed. */}
                          <Text style={styles.graceBadgeText}>Miss a day or two? Your streak holds.</Text>
                        </View>
                      </View>
                    )}

                    {step === 'finale' && (
                      <View>
                        <Text style={styles.eyebrow}>ONE LAST THING</Text>
                        {/* Finding 03a: the old explicit break left "live"
                            orphaned alone on line 2 — one line now, at a
                            slightly smaller size so it fits. */}
                        <Text style={styles.finaleTitle}>
                          Where things <Text style={styles.accentItalic}>live</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>
                        <Text style={styles.screenBody}>
                          Six places. That is the whole map. You will not have to hunt.
                        </Text>

                        <View style={styles.mapCard}>
                          {[
                            { Icon: Home, name: 'Home', desc: "Today's prayer and your journey. Start here each day." },
                            { Icon: Users, name: 'Community', desc: 'People to pray with, and people praying for you.' },
                            { Icon: Shield, name: 'Declare', desc: 'Declarations to stand on. Feeling heavy? Start there.' },
                            { Icon: Moon, name: 'Sleep Prayer', desc: "End the day in His presence. Rest with a quiet timer, a soundbed, and the day's truth." },
                            { Icon: BookOpen, name: 'Journal', desc: 'Your story: answered prayers, insights, your profile.' },
                            { Icon: Heart, name: 'Give', desc: 'Partner with the mission, whenever you\'re ready.' },
                          ].map((row, i, arr) => (
                            <View key={row.name}>
                              <View style={styles.mapRow}>
                                <View style={styles.mapIcon}>
                                  <row.Icon size={20} color={C.accentDark} />
                                </View>
                                <View style={styles.mapCopy}>
                                  <Text style={styles.mapName}>{row.name}</Text>
                                  <Text style={styles.mapDesc}>{row.desc}</Text>
                                </View>
                              </View>
                              {i < arr.length - 1 && <View style={styles.mapDivider} />}
                            </View>
                          ))}
                        </View>

                        {/* Round-5 lane 2, M-8: pre-empt the account surprise
                            — a guest's first wall-composer wall comes later,
                            unexplained, without this line. */}
                        <Text style={[styles.mapDesc, { marginTop: 14 }]}>
                          No account needed to pray. Sign in anytime (Apple or Google) to save your journey and share on the wall.
                        </Text>

                        <AnimatedPressable
                          onPress={() => finishOnboarding(pendingReminderTime, true)}
                          scaleValue={0.98}
                          // Finding 04a: AnimatedPressable auto-glows any
                          // pressable with a backgroundColor — the 10pt blur
                          // bled past the card's top edge and read as a dark
                          // band / upward shadow. This card takes no glow.
                          disableGlow
                          style={styles.firstStepsRow}
                          testID="onboarding-first-steps"
                        >
                          <View style={styles.mapCopy}>
                            <Text style={styles.mapName}>First Steps</Text>
                            <Text style={styles.mapDesc}>
                              {CHECKLIST_ITEMS.length} small steps to start strong. Open it whenever you&apos;re ready.
                            </Text>
                          </View>
                          <ChevronRight size={16} color={C.textMuted} />
                        </AnimatedPressable>
                      </View>
                    )}

                  </Animated.View>
                </ScrollView>

                <View style={styles.footer}>
                  {renderProgressDots()}
                  {step === 'reminder' ? (
                    <View style={styles.reminderActions}>
                      <GlowButton
                        label="SET MY REMINDER"
                        onPress={handleNext}
                        variant="primary"
                        textStyle={styles.secondaryButtonText}
                        style={styles.fullWidth}
                      />
                      <AnimatedPressable
                        onPress={handleSkipReminder}
                        scaleValue={0.97}
                        style={styles.skipButton}
                        testID="onboarding-skip-reminder"
                      >
                        <Text style={styles.skipButtonText}>Skip for now</Text>
                      </AnimatedPressable>
                    </View>
                  ) : step === 'finale' ? (
                    <GlowButton
                      label="GO TO HOME"
                      onPress={handleNext}
                      variant="primary"
                      textStyle={styles.secondaryButtonText}
                      style={styles.fullWidth}
                    />
                  ) : (
                    <GlowButton
                      label={getButtonLabel()}
                      onPress={handleNext}
                      // GPT-6 item 10: no step gates on a selection any
                      // more — the name step has Skip, the blocker step
                      // continues on the defaults. The CTA is always live.
                      // Finding 02: every CONTINUE reads as dimmed/
                      // disabled under the ghost treatment (tinted bg +
                      // thin titleLight type), so all steps get the solid
                      // amber CTA — not just the name step.
                      variant="primary"
                      textStyle={styles.secondaryButtonText}
                      style={styles.fullWidth}
                    />
                  )}
                </View>
                </>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </>
        )}
      </View>
    </>
  );
}

function createStyles(C: ThemeColors, T: ReturnType<typeof useTypography>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
    },
    ambientVeilTop: {
      ...absoluteFillObject,
      backgroundColor: C.ambientVeil2,
    },
    ambientVeilBottom: {
      position: 'absolute',
      right: -64,
      bottom: -80,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: C.ambientVeil1,
    },
    safeArea: {
      flex: 1,
    },
    flex: {
      flex: 1,
    },
    fullWidth: {
      width: '100%',
    },
    obGlowTopWrap: {
      position: 'absolute',
      top: -64,
      alignSelf: 'center',
      marginLeft: -144,
    },
    accentItalic: {
      fontFamily: Fonts.italic,
      color: C.accentDark,
    },
    accentItalicSoft: {
      fontFamily: Fonts.italic,
      color: C.accentDark,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: screenPadding,
      // Findings 03c/04b: at rest the first content (eyebrow) sat half-clipped
      // at the top edge — give it real clearance above the first row.
      paddingTop: 20,
      // Footer-overlap math (wave-1 fix): the fixed footer must be shorter
      // than this padding or the last content stays hidden behind it at
      // max scroll. Footer = padTop 8 + dots 8 + dots margin 12 + CTA
      // (GlowButton minHeight 54; 58 in Larger Text: 32 padding + 26
      // leading) + padBottom 32 iOS / 24 Android. Tallest footer is the
      // reminder step in Larger Text on iOS: 8 + 20 + 58 + gap 12 + skip
      // (24 padding + 26 leading = 50) + 32 = 180. 192 covers it + 12.
      // Single-CTA steps are 114 iOS / 106 Android at default size.
      // 2026-11-17 visual pass: 192 → 216. The reminder step's quote was
      // cut at the card edge on device and the footer math above is an
      // estimate, so keep 36pt of clearance past the tallest footer
      // instead of 12 — the full time card + grace badge must be able to
      // scroll clear of the docked footer.
      paddingBottom: 216,
    },
    topBar: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      // Arena (e): plain chevron, no filled disc — the 44pt hit area
      // carries the tap target (was the circular accentBg button).
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
    },
    eyebrow: {
      marginTop: 28,
      marginBottom: 12,
      fontFamily: Fonts.titleSemiBold,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: C.accent,
    },
    screenTitle: {
      marginBottom: 16,
      fontFamily: Fonts.serifMedium,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
      letterSpacing: 0,
      color: C.text,
    },
    // Finding 03a: finale title one step smaller than screenTitle (32 -> 30)
    // so "Where things live" fits on a single line.
    finaleTitle: {
      marginBottom: 16,
      fontFamily: Fonts.serifMedium,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: 0,
      color: C.text,
    },
    screenRuleWrap: {
      width: 48,
      height: 1,
      marginBottom: 20,
      overflow: 'hidden',
      opacity: 0.55,
    },
    screenRuleGradient: {
      width: '100%',
      height: '100%',
    },
    screenBody: {
      fontFamily: Fonts.serifRegular,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.textSecondary,
    },
    screenBodyTight: {
      marginBottom: 24,
      fontFamily: Fonts.serifRegular,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.textSecondary,
    },
    emphasisBody: {
      fontFamily: Fonts.titleSemiBold,
      color: C.text,
    },
    nameInputWrap: {
      marginTop: 40,
    },
    nameInput: {
      minHeight: 52,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.dayChipTodayBorder,
      color: C.text,
      fontFamily: Fonts.italic,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
    },
    nameHelp: {
      marginTop: 12,
      // Arena audit B2/B3: body-length helper copy in the token body
      // face (Montserrat), not italic serif.
      fontFamily: Fonts.titleMedium,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.accentDark,
    },
    nameErrorText: {
      marginTop: 12,
      fontFamily: Fonts.italic,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.accentDark,
    },
    cardsStack: {
      marginTop: 24,
      gap: 10,
    },
    choiceCard: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: C.phaseCardBg,
      borderColor: C.border,
      justifyContent: 'center',
    },
    choiceCardHover: {
      backgroundColor: C.phaseCardHoverBg,
      borderColor: C.phaseCardOpenBorder,
    },
    choiceCardActive: {
      backgroundColor: C.chipActiveBg,
      borderColor: C.dayChipTodayBorder,
      borderWidth: 2,
    },
    choiceCardText: {
      flex: 1,
      fontFamily: Fonts.serifMedium,
      fontSize: T.size.scripture,
      lineHeight: T.leading.scripture,
      color: C.textSecondary,
    },
    choiceCardTextActive: {
      color: C.text,
    },
    choiceCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otherInputWrap: {
      marginTop: 16,
    },
    otherInput: {
      minHeight: 52,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.dayChipTodayBorder,
      color: C.text,
      fontFamily: Fonts.italic,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    infoCardMuted: {
      // Arena audit C2: lie card padding 12 → 20, matching the truth card.
      padding: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.phaseCardBg,
    },
    infoCardAccent: {
      padding: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.chipActiveBg,
    },
    cardLabelMuted: {
      marginBottom: 8,
      fontFamily: Fonts.titleSemiBold,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: C.textSecondary,
    },
    cardLabelAccent: {
      marginBottom: 8,
      fontFamily: Fonts.titleSemiBold,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: C.accentDark,
    },
    struckBodyText: {
      fontFamily: Fonts.serifRegular,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      textDecorationLine: 'line-through',
      // 4x pass: the lie was punished twice (strike + dim + small) and became
      // the hardest text in the app to read. Strike alone demotes it; keep it
      // legible at body size in the secondary text color.
      color: C.textSecondary,
    },
    truthBodyText: {
      fontFamily: Fonts.serifMedium,
      fontSize: T.size.devotionalProse,
      lineHeight: T.leading.devotionalProse,
      color: C.text,
    },
    promiseCard: {
      marginTop: 24,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
    },
    promiseText: {
      fontFamily: Fonts.serifRegular,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.accentDark,
    },
    promiseEmphasis: {
      fontFamily: Fonts.titleSemiBold,
      color: C.text,
    },
    promiseQuote: {
      marginTop: 28,
      fontFamily: Fonts.italic,
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
      color: C.accentDark,
    },
    timeCard: {
      marginTop: 32,
      padding: 16,
      // 2026-11-17 visual pass: the quote at the bottom of this card was
      // cut at the card edge on device — give the helper room below so it
      // can never sit against the border.
      paddingBottom: 28,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.phaseCardBg,
      alignItems: 'center',
      gap: 16,
    },
    timeDisplay: {
      fontFamily: Fonts.titleLight,
      fontSize: T.size.display,
      lineHeight: T.leading.display,
      letterSpacing: 2,
      color: C.text,
    },
    timeAmPmRow: {
      flexDirection: 'row',
      gap: 8,
    },
    amPmButton: {
      minWidth: 76,
      minHeight: 44,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.transparent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    amPmButtonActive: {
      backgroundColor: C.chipActiveBg,
      borderColor: C.dayChipTodayBorder,
    },
    amPmButtonText: {
      fontFamily: Fonts.titleRegular,
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: C.textSecondary,
    },
    amPmButtonTextActive: {
      color: C.text,
    },
    timeAdjustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    timeAdjustButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeAdjustButtonText: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      color: C.text,
    },
    timeAdjustLabel: {
      minWidth: 40,
      fontFamily: Fonts.titleSemiBold,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
      textAlign: 'center',
      textTransform: 'uppercase',
      color: C.accentDark,
    },
    timeHelper: {
      fontFamily: Fonts.italic,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      textAlign: 'center',
      color: C.textSecondary,
    },
    graceBadge: {
      marginTop: 20,
      alignSelf: 'flex-start',
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.accentBg,
    },
    mapCard: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.phaseCardBg,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    mapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    mapIcon: {
      width: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapCopy: {
      flex: 1,
    },
    mapName: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      fontFamily: Fonts.titleSemiBold,
      color: C.text,
      marginBottom: 2,
    },
    mapDesc: {
      // Phase 2b sweep 1: subtext converges on the footnote token (14/20)
      // instead of a one-off 14/19.
      fontSize: T.size.footnote,
      lineHeight: T.leading.footnote,
      fontFamily: Fonts.titleRegular,
      color: C.textSecondary,
    },
    mapDivider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 38,
    },
    firstStepsRow: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      borderRadius: 12,
      backgroundColor: C.accentBg,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    graceBadgeText: {
      fontFamily: Fonts.titleSemiBold,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: C.accentDark,
      // The badge sizes to its content; without shrink the long uppercase
      // label runs off the right edge of the reminder screen.
      flex: 1,
    },
    // 4x pass: the dots live in the fixed footer now (always visible), not
    // at the end of the scroll content where long steps buried them.
    truthStep: {
      flex: 1,
    },
    truthCards: {
      flex: 1,
      justifyContent: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 0,
      marginBottom: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.pillBorder,
    },
    dotActive: {
      width: 24,
      backgroundColor: C.accent,
    },
    footer: {
      paddingHorizontal: 32,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 32 : 24,
      // Solid: scrolled content must never show through or overlap the CTA.
      backgroundColor: C.background,
    },
    secondaryButtonText: {
      fontFamily: Fonts.titleMedium,
    },
    reminderActions: {
      gap: 12,
    },
    skipButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
    },
    skipButtonText: {
      fontFamily: Fonts.titleRegular,
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      color: C.iconMuted,
    },
  });
}
