import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedPressable from '@/components/AnimatedPressable';
import GlowButton from '@/components/GlowButton';
import RadialGlow from '@/components/RadialGlow';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { scheduleReminderNotification, useApp } from '@/providers/AppProvider';
import { UserProfile } from '@/types';

type Step = 'splash' | 'name' | 'blocker' | 'truth' | 'promise' | 'framework' | 'reminder';

type ThemeColors = ReturnType<typeof useColors>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_STAGGER_LIMIT = 5;
const CARD_STAGGER_STEP_MS = 40;

const BLOCKER_OPTIONS = [
  "I don't know the right words to pray",
  'It feels one-sided. Like talking to a wall.',
  "I can't stay consistent. I keep forgetting.",
  'I feel too broken or far from God to start',
  'Other',
] as const;

const TRIAD_ITEMS = [
  { emoji: '🙏', name: 'Thank & Praise', desc: "Start with what's true about who God is" },
  { emoji: '🤍', name: 'Repent & Forgive', desc: 'Honesty that brings freedom, not shame' },
  { emoji: '🕊️', name: 'Invite Holy Spirit', desc: 'Welcome His presence into your whole day' },
  { emoji: '🙌', name: 'Ask & Receive', desc: 'Bring your real needs to a loving Father' },
  { emoji: '✨', name: 'Declare', desc: 'Speak your identity in Christ out loud' },
] as const;

const BLOCKER_TRUTHS: Record<string, { lie: string; truth: string }> = {
  "I don't know the right words to pray": {
    lie: 'I have to sound perfectly put together for God to hear me.',
    truth:
      "God delights in the honest, messy cries of His children. The Holy Spirit intercedes for us when we don't have the words.",
  },
  'It feels one-sided. Like talking to a wall.': {
    lie: "God isn't listening or doesn't care enough to answer.",
    truth:
      'God is always present and always listening. Sometimes His voice is a quiet whisper, a shifted perspective, or peace in the waiting.',
  },
  "I can't stay consistent. I keep forgetting.": {
    lie: 'My inconsistency disqualifies me from relationship.',
    truth:
      "God's love is not based on your performance. His mercies are new every morning, waiting for you whenever you turn to Him.",
  },
  'I feel too broken or far from God to start': {
    lie: 'I have to clean up my act before I can approach God.',
    truth:
      'Jesus came for the sick, not the healthy. He runs to meet you exactly where you are, in the middle of your mess.',
  },
  Other: {
    lie: 'My specific struggle is too unique or difficult for prayer to help.',
    truth:
      'Nothing is hidden from God, and nothing is too difficult for Him. He holds your specific burdens with perfect understanding and care.',
  },
};

const BLOCKER_TO_PRAYER: Record<string, UserProfile['prayerLife']> = {
  "I don't know the right words to pray": 'new',
  'It feels one-sided. Like talking to a wall.': 'inconsistent',
  "I can't stay consistent. I keep forgetting.": 'inconsistent',
  'I feel too broken or far from God to start': 'new',
  Other: 'new',
};

function createCardAnimValues(count: number) {
  return Array.from({ length: count }, () => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(16),
  }));
}

function animateCardSet(
  values: { opacity: Animated.Value; translateY: Animated.Value }[],
  activeCount: number,
) {
  values.forEach((item, index) => {
    const shouldAnimate = index < activeCount && index < CARD_STAGGER_LIMIT;
    if (!shouldAnimate) {
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
      emphasis: "That's exactly why we wrote every word for you.",
      tail: "For the next seven days, you won't need to find a single phrase on your own.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[1]) {
    return {
      lead: 'You said prayer feels one-sided, like talking to a wall.',
      emphasis: 'We hear that. Most people start exactly here.',
      tail: "Today we're not asking you to feel anything. Just to show up and say the words.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[2]) {
    return {
      lead: 'You said consistency is the struggle.',
      emphasis: "That's why we built reminders, streaks, and a grace day.",
      tail: "The whole system was designed for people who keep forgetting, because that's all of us.",
    };
  }

  if (selectedBlocker === BLOCKER_OPTIONS[3]) {
    return {
      lead: 'You said you feel too broken or too far from God to start.',
      emphasis: 'Then this is the most important thing you could do today.',
      tail: 'The distance you feel is not the truth about where God is.',
    };
  }

  return {
    lead: 'You brought a struggle.',
    emphasis: 'This is your promise that every struggle is a doorway,',
    tail: 'and He meets you here.',
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => createStyles(C), [C]);
  const { completeOnboarding } = useApp();

  const [step, setStep] = useState<Step>('splash');
  const [firstName, setFirstName] = useState<string>('');
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null);
  const [otherBlocker, setOtherBlocker] = useState<string>('');
  const [reminderHour, setReminderHour] = useState<number>(8);
  const [reminderMin, setReminderMin] = useState<number>(0);
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>('AM');

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef<boolean>(false);

  const splashFade = useRef(new Animated.Value(0)).current;
  const splashSlide = useRef(new Animated.Value(24)).current;
  const splashRuleFade = useRef(new Animated.Value(0)).current;
  const splashRuleWidth = useRef(new Animated.Value(0)).current;
  const splashButtonFade = useRef(new Animated.Value(0)).current;
  const splashButtonSlide = useRef(new Animated.Value(24)).current;
  const orbPulse = useRef(new Animated.Value(0.55)).current;
  const wordmarkScale = useRef(new Animated.Value(0.93)).current;

  const blockerCardAnims = useRef(createCardAnimValues(BLOCKER_OPTIONS.length)).current;
  const triadCardAnims = useRef(createCardAnimValues(TRIAD_ITEMS.length)).current;
  const timeControlAnims = useRef(createCardAnimValues(4)).current;

  useEffect(() => {
    if (step !== 'splash') {
      return;
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbPulse, {
          toValue: 0.55,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(splashFade, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashSlide, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(wordmarkScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(splashRuleFade, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashRuleWidth, {
          toValue: 200,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      Animated.parallel([
        Animated.timing(splashButtonFade, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashButtonSlide, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [orbPulse, splashButtonFade, splashButtonSlide, splashFade, splashRuleFade, splashRuleWidth, splashSlide, step, wordmarkScale]);

  useEffect(() => {
    if (step === 'blocker') {
      animateCardSet(blockerCardAnims, BLOCKER_OPTIONS.length);
    }

    if (step === 'framework') {
      animateCardSet(triadCardAnims, TRIAD_ITEMS.length);
    }

    if (step === 'reminder') {
      animateCardSet(timeControlAnims, 4);
    }
  }, [blockerCardAnims, step, timeControlAnims, triadCardAnims]);

  const transitionTo = useCallback((nextStep: Step) => {
    if (isTransitioning.current) {
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
  }, [contentOpacity, contentTranslateX, contentTranslateY]);

  const handleNext = useCallback(() => {
    if (isTransitioning.current) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (step === 'splash') {
      transitionTo('name');
      return;
    }

    if (step === 'name' && firstName.trim()) {
      transitionTo('blocker');
      return;
    }

    if (step === 'blocker' && selectedBlocker) {
      if (selectedBlocker === 'Other' && !otherBlocker.trim()) {
        return;
      }
      transitionTo('truth');
      return;
    }

    if (step === 'truth') {
      transitionTo('promise');
      return;
    }

    if (step === 'promise') {
      transitionTo('framework');
      return;
    }

    if (step === 'framework') {
      transitionTo('reminder');
      return;
    }

    if (step === 'reminder') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const prayerLife = BLOCKER_TO_PRAYER[selectedBlocker ?? ''] ?? 'new';
      const blockerIdx = selectedBlocker ? BLOCKER_OPTIONS.indexOf(selectedBlocker as (typeof BLOCKER_OPTIONS)[number]) : -1;
      const formattedTime = `${reminderHour}:${reminderMin.toString().padStart(2, '0')} ${reminderAmPm}`;

      completeOnboarding({
        firstName: firstName.trim(),
        prayerLife,
        reminderTime: formattedTime,
        onboardingComplete: true,
        blocker: blockerIdx,
      });

      void scheduleReminderNotification(formattedTime, 1);
      router.replace('/');
    }
  }, [completeOnboarding, firstName, otherBlocker, reminderAmPm, reminderHour, reminderMin, router, selectedBlocker, step, transitionTo]);

  const handleSkipReminder = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prayerLife = BLOCKER_TO_PRAYER[selectedBlocker ?? ''] ?? 'new';
    const blockerIdx = selectedBlocker ? BLOCKER_OPTIONS.indexOf(selectedBlocker as (typeof BLOCKER_OPTIONS)[number]) : -1;

    completeOnboarding({
      firstName: firstName.trim(),
      prayerLife,
      reminderTime: '',
      onboardingComplete: true,
      blocker: blockerIdx,
    });

    router.replace('/');
  }, [completeOnboarding, firstName, router, selectedBlocker]);

  const canProceed = useMemo(() => {
    if (step === 'splash') {
      return true;
    }

    if (step === 'name') {
      return firstName.trim().length > 0;
    }

    if (step === 'blocker') {
      if (selectedBlocker === 'Other') {
        return otherBlocker.trim().length > 0;
      }
      return selectedBlocker !== null;
    }

    return true;
  }, [firstName, otherBlocker, selectedBlocker, step]);

  const displayName = firstName.trim() || 'Friend';
  const promiseReflection = getPromiseReflection(selectedBlocker);
  const stepMap: Record<Step, number> = {
    splash: -1,
    name: 0,
    blocker: 1,
    truth: 2,
    promise: 3,
    framework: 4,
    reminder: 5,
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
      return "THAT'S ME  →";
    }
    if (step === 'blocker') {
      return 'CONTINUE  →';
    }
    if (step === 'truth') {
      return "I'M READY  →";
    }
    if (step === 'promise') {
      return "I'M READY  →";
    }
    return 'CONTINUE  →';
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
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
            {step === 'splash' ? (
              <View style={styles.splashContainer}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.spGlowBottomWrap, { opacity: orbPulse }]}
                >
                  <RadialGlow size={384} maxOpacity={0.22} />
                </Animated.View>
                <View pointerEvents="none" style={styles.spGlowCenterWrap}>
                  <RadialGlow size={256} maxOpacity={0.08} />
                </View>
                <View pointerEvents="none" style={styles.spGlowTopWrap}>
                  <RadialGlow size={288} maxOpacity={0.08} />
                </View>

                <Animated.View
                  style={[
                    styles.splashBrand,
                    {
                      opacity: splashFade,
                      transform: [{ translateY: splashSlide }, { scale: wordmarkScale }],
                    },
                  ]}
                >
                  <Image
                    source={require('../assets/images/triad-prayer-logo.png')}
                    style={styles.splashLogo}
                    resizeMode="contain"
                    accessibilityLabel="TRIAD Prayer"
                  />
                </Animated.View>

                <Animated.View style={[styles.splashRuleWrap, { opacity: splashRuleFade }]}>
                  <Animated.View style={{ width: splashRuleWidth, height: 1, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={[C.transparent, C.accent, C.transparent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.splashRuleGradient}
                    />
                  </Animated.View>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.splashTagWrap,
                    { opacity: splashRuleFade, transform: [{ translateY: splashSlide }] },
                  ]}
                >
                  <Text style={styles.splashTag}>
                    God is <Text style={styles.accentItalic}>much closer</Text> than you think.
                  </Text>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.splashActions,
                    { opacity: splashButtonFade, transform: [{ translateY: splashButtonSlide }] },
                  ]}
                >
                  <GlowButton
                    label="BEGIN YOUR 30 DAYS"
                    onPress={handleNext}
                    variant="ghost"
                    textStyle={styles.primaryButtonText}
                    style={styles.fullWidth}
                  />
                  <Text style={styles.splashSub}>
                    No experience needed. No perfect words required.
                  </Text>
                </Animated.View>
              </View>
            ) : (
              <>
                <ScrollView
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
                          God has known your name since before the foundations of the earth. He calls you beloved. We just want to say it back.
                        </Text>
                        <View style={styles.nameInputWrap}>
                          <TextInput
                            autoCapitalize="words"
                            autoFocus={true}
                            onChangeText={setFirstName}
                            onSubmitEditing={handleNext}
                            placeholder="Your first name"
                            placeholderTextColor={C.iconMuted}
                            returnKeyType="next"
                            style={styles.nameInput}
                            testID="onboarding-name-input"
                            value={firstName}
                          />
                          <Text style={styles.nameHelp}>
                            This is just between you and God, and us.
                          </Text>
                        </View>
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
                                </AnimatedPressable>
                              </Animated.View>
                            );
                          })}
                        </View>

                        {selectedBlocker === 'Other' && (
                          <View style={styles.otherInputWrap}>
                            <TextInput
                              autoFocus={true}
                              onChangeText={setOtherBlocker}
                              onSubmitEditing={handleNext}
                              placeholder="Tell us what holds you back..."
                              placeholderTextColor={C.iconMuted}
                              returnKeyType="next"
                              style={styles.otherInput}
                              testID="onboarding-other-blocker-input"
                              value={otherBlocker}
                            />
                          </View>
                        )}
                      </View>
                    )}

                    {step === 'truth' && selectedBlocker && (
                      <View>
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

                        <View style={styles.cardsStack}>
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
                          Thirty days from now, you will pray without a script. You&apos;ll know your voice with God, and His voice in return.{`\n\n`}
                          You weren&apos;t meant to live stuck in prayerless silence. <Text style={styles.emphasisBody}>Freedom is possible. A deeper relationship with God is possible.</Text>
                          {`\n\n`}You are not too far gone. Not too ordinary. Not starting too late. <Text style={styles.accentItalicSoft}>You are exactly the kind of person this was made for.</Text>
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

                    {step === 'framework' && (
                      <View>
                        <Text style={styles.eyebrow}>YOUR DAILY GUIDE</Text>
                        <Text style={styles.screenTitle}>
                          The TRIAD{`\n`}<Text style={styles.accentItalic}>framework</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={[C.accent, C.transparent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGradient}
                          />
                        </View>
                        <Text style={styles.screenBodyTight}>
                          Five anchors covering the full range of authentic prayer: spirit, soul, and body. You learn them by doing, not by studying.
                        </Text>
                        <View style={styles.cardsStack}>
                          {TRIAD_ITEMS.map((item, index) => {
                            const anim = triadCardAnims[index];
                            return (
                              <Animated.View
                                key={item.name}
                                style={{
                                  opacity: anim.opacity,
                                  transform: [{ translateY: anim.translateY }],
                                }}
                              >
                                <View style={styles.triadItem}>
                                  <View style={styles.triadIconWrap}>
                                    <Text style={styles.triadEmoji}>{item.emoji}</Text>
                                  </View>
                                  <View style={styles.triadTextWrap}>
                                    <Text style={styles.triadName}>{item.name.toUpperCase()}</Text>
                                    <Text style={styles.triadDesc}>{item.desc}</Text>
                                  </View>
                                </View>
                              </Animated.View>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {step === 'reminder' && (
                      <View>
                        <Text style={styles.eyebrow}>NEVER MISS A DAY</Text>
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
                          A gentle nudge at the right moment is the difference between a habit and a wish.
                        </Text>

                        <Animated.View
                          style={{
                            opacity: timeControlAnims[0].opacity,
                            transform: [{ translateY: timeControlAnims[0].translateY }],
                          }}
                        >
                          <View style={styles.timeCard}>
                            <Text style={styles.timeDisplay}>
                              {reminderHour}:{reminderMin.toString().padStart(2, '0')}
                            </Text>
                            <Animated.View
                              style={{
                                opacity: timeControlAnims[1].opacity,
                                transform: [{ translateY: timeControlAnims[1].translateY }],
                              }}
                            >
                              <View style={styles.timeAmPmRow}>
                                <AnimatedPressable
                                  onPress={() => setReminderAmPm('AM')}
                                  scaleValue={0.97}
                                  style={[styles.amPmButton, reminderAmPm === 'AM' && styles.amPmButtonActive]}
                                  testID="onboarding-am-button"
                                >
                                  <Text style={[styles.amPmButtonText, reminderAmPm === 'AM' && styles.amPmButtonTextActive]}>AM</Text>
                                </AnimatedPressable>
                                <AnimatedPressable
                                  onPress={() => setReminderAmPm('PM')}
                                  scaleValue={0.97}
                                  style={[styles.amPmButton, reminderAmPm === 'PM' && styles.amPmButtonActive]}
                                  testID="onboarding-pm-button"
                                >
                                  <Text style={[styles.amPmButtonText, reminderAmPm === 'PM' && styles.amPmButtonTextActive]}>PM</Text>
                                </AnimatedPressable>
                              </View>
                            </Animated.View>

                            <Animated.View
                              style={{
                                opacity: timeControlAnims[2].opacity,
                                transform: [{ translateY: timeControlAnims[2].translateY }],
                              }}
                            >
                              <View style={styles.timeAdjustRow}>
                                <AnimatedPressable
                                  onPress={() => setReminderHour((current) => (current <= 1 ? 12 : current - 1))}
                                  scaleValue={0.97}
                                  style={styles.timeAdjustButton}
                                  testID="onboarding-hour-decrement"
                                >
                                  <Text style={styles.timeAdjustButtonText}>−</Text>
                                </AnimatedPressable>
                                <Text style={styles.timeAdjustLabel}>HOUR</Text>
                                <AnimatedPressable
                                  onPress={() => setReminderHour((current) => (current >= 12 ? 1 : current + 1))}
                                  scaleValue={0.97}
                                  style={styles.timeAdjustButton}
                                  testID="onboarding-hour-increment"
                                >
                                  <Text style={styles.timeAdjustButtonText}>+</Text>
                                </AnimatedPressable>
                              </View>
                            </Animated.View>

                            <Animated.View
                              style={{
                                opacity: timeControlAnims[3].opacity,
                                transform: [{ translateY: timeControlAnims[3].translateY }],
                              }}
                            >
                              <View style={styles.timeAdjustRow}>
                                <AnimatedPressable
                                  onPress={() => setReminderMin((current) => (current <= 0 ? 55 : current - 5))}
                                  scaleValue={0.97}
                                  style={styles.timeAdjustButton}
                                  testID="onboarding-minute-decrement"
                                >
                                  <Text style={styles.timeAdjustButtonText}>−</Text>
                                </AnimatedPressable>
                                <Text style={styles.timeAdjustLabel}>MIN</Text>
                                <AnimatedPressable
                                  onPress={() => setReminderMin((current) => (current >= 55 ? 0 : current + 5))}
                                  scaleValue={0.97}
                                  style={styles.timeAdjustButton}
                                  testID="onboarding-minute-increment"
                                >
                                  <Text style={styles.timeAdjustButtonText}>+</Text>
                                </AnimatedPressable>
                              </View>
                            </Animated.View>

                            <Text style={styles.timeHelper}>
                              &quot;Day 1 is waiting for you, <Text style={styles.accentItalic}>friend</Text>.&quot;{`\n`}
                              Every morning at this time until you open the app.
                            </Text>
                          </View>
                        </Animated.View>

                        <View style={styles.graceBadge}>
                          <Text style={styles.graceEmoji}>🛡️</Text>
                          <Text style={styles.graceBadgeText}>Grace day: one miss forgiven per week</Text>
                        </View>
                      </View>
                    )}

                    {renderProgressDots()}
                  </Animated.View>
                </ScrollView>

                <View style={styles.footer}>
                  {step === 'framework' ? (
                    <GlowButton
                      label="STEP INTO DAY 1"
                      onPress={handleNext}
                      variant="amber"
                      textStyle={styles.secondaryButtonText}
                      style={styles.fullWidth}
                    />
                  ) : step === 'reminder' ? (
                    <View style={styles.reminderActions}>
                      <GlowButton
                        label="SET MY REMINDER"
                        onPress={handleNext}
                        variant="amber"
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
                  ) : (
                    <GlowButton
                      label={getButtonLabel()}
                      onPress={handleNext}
                      variant="ghost"
                      disabled={!canProceed}
                      textStyle={styles.primaryButtonText}
                      style={styles.fullWidth}
                    />
                  )}
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </>
  );
}

function createStyles(C: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
    },
    ambientVeilTop: {
      ...StyleSheet.absoluteFillObject,
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
    spGlowBottomWrap: {
      position: 'absolute',
      bottom: -80,
      left: Math.round(SCREEN_WIDTH / 2) - 192,
    },
    spGlowCenterWrap: {
      position: 'absolute',
      top: Math.round(SCREEN_HEIGHT * 0.36) - 128,
      left: Math.round(SCREEN_WIDTH / 2) - 128,
    },
    spGlowTopWrap: {
      position: 'absolute',
      top: -96,
      left: Math.round(SCREEN_WIDTH / 2) - 144,
    },
    obGlowTopWrap: {
      position: 'absolute',
      top: -64,
      alignSelf: 'center',
      marginLeft: -144,
    },
    splashContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splashBrand: {
      alignItems: 'center',
      marginBottom: 24,
    },
    splashLogo: {
      width: Math.min(SCREEN_WIDTH - 56, 320),
      height: 136,
    },
    splashRuleWrap: {
      marginBottom: 24,
      alignItems: 'center',
    },
    splashRuleGradient: {
      width: 200,
      height: 1,
    },
    splashTagWrap: {
      marginBottom: 64,
      paddingHorizontal: 32,
    },
    splashTag: {
      fontFamily: Fonts.italic,
      fontSize: 20,
      lineHeight: 28,
      textAlign: 'center',
      color: C.textSecondary,
    },
    accentItalic: {
      fontFamily: Fonts.italicSemiBold,
      color: C.accentDark,
    },
    accentItalicSoft: {
      fontFamily: Fonts.italicMedium,
      color: C.accentDark,
    },
    splashActions: {
      position: 'absolute',
      left: 32,
      right: 32,
      bottom: 64,
      gap: 16,
      alignItems: 'center',
    },
    splashSub: {
      fontFamily: Fonts.italic,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: C.iconMuted,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 20,
      paddingBottom: 128,
    },
    content: {
      flex: 1,
    },
    eyebrow: {
      marginTop: 28,
      marginBottom: 12,
      fontFamily: Fonts.titleMedium,
      fontSize: 12,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: C.accent,
    },
    screenTitle: {
      marginBottom: 16,
      fontFamily: Fonts.serifLight,
      fontSize: 48,
      lineHeight: 48,
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
      fontSize: 20,
      lineHeight: 32,
      color: C.textSecondary,
    },
    screenBodyTight: {
      marginBottom: 24,
      fontFamily: Fonts.serifRegular,
      fontSize: 20,
      lineHeight: 32,
      color: C.textSecondary,
    },
    emphasisBody: {
      fontFamily: Fonts.serifSemiBold,
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
      fontSize: 36,
    },
    nameHelp: {
      marginTop: 12,
      fontFamily: Fonts.italic,
      fontSize: 16,
      lineHeight: 24,
      color: C.accentDark,
    },
    cardsStack: {
      marginTop: 32,
      gap: 12,
    },
    choiceCard: {
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 16,
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
    },
    choiceCardText: {
      fontFamily: Fonts.serifRegular,
      fontSize: 20,
      lineHeight: 28,
      color: C.textSecondary,
    },
    choiceCardTextActive: {
      color: C.text,
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
      fontSize: 20,
    },
    infoCardMuted: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.phaseCardBg,
    },
    infoCardAccent: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      backgroundColor: C.chipActiveBg,
    },
    cardLabelMuted: {
      marginBottom: 8,
      fontFamily: Fonts.titleMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: C.iconMuted,
    },
    cardLabelAccent: {
      marginBottom: 8,
      fontFamily: Fonts.titleMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: C.accentDark,
    },
    struckBodyText: {
      fontFamily: Fonts.serifRegular,
      fontSize: 20,
      lineHeight: 32,
      textDecorationLine: 'line-through',
      color: C.iconMuted,
    },
    truthBodyText: {
      fontFamily: Fonts.serifSemiBold,
      fontSize: 24,
      lineHeight: 36,
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
      fontFamily: Fonts.italic,
      fontSize: 18,
      lineHeight: 28,
      color: C.accentDark,
    },
    promiseEmphasis: {
      fontFamily: Fonts.italicSemiBold,
      color: C.text,
    },
    triadItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: C.phaseCardBg,
      borderColor: C.border,
    },
    triadIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.chipActiveBg,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
    },
    triadEmoji: {
      fontSize: 20,
      textAlign: 'center',
    },
    triadTextWrap: {
      flex: 1,
    },
    triadName: {
      marginBottom: 4,
      fontFamily: Fonts.titleSemiBold,
      fontSize: 12,
      letterSpacing: 2,
      color: C.accent,
    },
    triadDesc: {
      fontFamily: Fonts.serifRegular,
      fontSize: 16,
      lineHeight: 24,
      color: C.textSecondary,
    },
    timeCard: {
      marginTop: 32,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.phaseCardBg,
      alignItems: 'center',
      gap: 16,
    },
    timeDisplay: {
      fontFamily: Fonts.titleThin,
      fontSize: 72,
      lineHeight: 72,
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
      fontSize: 12,
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
      fontSize: 24,
      lineHeight: 24,
      color: C.text,
    },
    timeAdjustLabel: {
      minWidth: 40,
      fontFamily: Fonts.titleMedium,
      fontSize: 12,
      letterSpacing: 2,
      textAlign: 'center',
      textTransform: 'uppercase',
      color: C.accentDark,
    },
    timeHelper: {
      fontFamily: Fonts.italic,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: C.textSecondary,
    },
    graceBadge: {
      marginTop: 20,
      alignSelf: 'flex-start',
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
    graceEmoji: {
      fontSize: 16,
    },
    graceBadgeText: {
      fontFamily: Fonts.titleMedium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: C.accentDark,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 32,
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
      backgroundColor: C.transparent,
    },
    primaryButtonText: {
      fontFamily: Fonts.titleLight,
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
      fontSize: 16,
      lineHeight: 20,
      color: C.iconMuted,
    },
  });
}
