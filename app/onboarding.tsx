import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { useApp, scheduleReminderNotification } from '@/providers/AppProvider';
import { UserProfile } from '@/types';
import { Fonts } from '@/constants/fonts';
import RadialGlow from '@/components/RadialGlow';
import GlowButton from '@/components/GlowButton';

type Step = 'splash' | 'name' | 'blocker' | 'truth' | 'promise' | 'framework' | 'reminder';

const BLOCKER_OPTIONS = [
  "I don't know the right words to pray",
  'It feels one-sided. Like talking to a wall.',
  "I can't stay consistent. I keep forgetting.",
  'I feel too broken or far from God to start',
  'Other',
];

const TRIAD_ITEMS = [
  { emoji: '🙏', name: 'Thank & Praise', desc: "Start with what's true about who God is" },
  { emoji: '🤍', name: 'Repent & Forgive', desc: 'Honesty that brings freedom, not shame' },
  { emoji: '🕊️', name: 'Invite Holy Spirit', desc: 'Welcome His presence into your whole day' },
  { emoji: '🙌', name: 'Ask & Receive', desc: 'Bring your real needs to a loving Father' },
  { emoji: '✨', name: 'Declare', desc: 'Speak your identity in Christ out loud' },
];

const BLOCKER_TRUTHS: Record<string, { lie: string, truth: string }> = {
  "I don't know the right words to pray": {
    lie: "I have to sound perfectly put together for God to hear me.",
    truth: "God delights in the honest, messy cries of His children. The Holy Spirit intercedes for us when we don't have the words."
  },
  'It feels one-sided. Like talking to a wall.': {
    lie: "God isn't listening or doesn't care enough to answer.",
    truth: "God is always present and always listening. Sometimes His voice is a quiet whisper, a shifted perspective, or peace in the waiting."
  },
  "I can't stay consistent. I keep forgetting.": {
    lie: "My inconsistency disqualifies me from relationship.",
    truth: "God's love is not based on your performance. His mercies are new every morning, waiting for you whenever you turn to Him."
  },
  'I feel too broken or far from God to start': {
    lie: "I have to clean up my act before I can approach God.",
    truth: "Jesus came for the sick, not the healthy. He runs to meet you exactly where you are, in the middle of your mess."
  },
  'Other': {
    lie: "My specific struggle is too unique or difficult for prayer to help.",
    truth: "Nothing is hidden from God, and nothing is too difficult for Him. He holds your specific burdens with perfect understanding and care."
  }
};

const BLOCKER_TO_PRAYER: Record<string, UserProfile['prayerLife']> = {
  "I don't know the right words to pray": 'new',
  'It feels one-sided. Like talking to a wall.': 'inconsistent',
  "I can't stay consistent. I keep forgetting.": 'inconsistent',
  'I feel too broken or far from God to start': 'new',
  'Other': 'new',
};

export default function OnboardingScreen() {
  const router = useRouter();

  const { completeOnboarding } = useApp();
  const [step, setStep] = useState<Step>('splash');
  const [firstName, setFirstName] = useState('');
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null);
  const [otherBlocker, setOtherBlocker] = useState('');
  const [reminderHour, setReminderHour] = useState<number>(8);
  const [reminderMin, setReminderMin] = useState<number>(0);
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>('AM');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const splashFade = useRef(new Animated.Value(0)).current;
  const splashSlide = useRef(new Animated.Value(24)).current;
  const splashRuleFade = useRef(new Animated.Value(0)).current;
  const splashRuleWidth = useRef(new Animated.Value(0)).current;
  const splashBtnFade = useRef(new Animated.Value(0)).current;
  const splashBtnSlide = useRef(new Animated.Value(24)).current;

  const orbPulse = useRef(new Animated.Value(0.55)).current;
  const wordmarkScale = useRef(new Animated.Value(0.93)).current;

  useEffect(() => {
    if (step !== 'splash') return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 0.55, duration: 4000, useNativeDriver: true }),
      ])
    ).start();

    Animated.stagger(300, [
      Animated.parallel([
        Animated.timing(splashFade, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.spring(splashSlide, { toValue: 0, tension: 40, friction: 10, useNativeDriver: true }),
        Animated.spring(wordmarkScale, { toValue: 1, tension: 40, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(splashRuleFade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(splashRuleWidth, { toValue: 200, duration: 900, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(splashBtnFade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(splashBtnSlide, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, [step, orbPulse, splashFade, splashSlide, splashRuleFade, splashRuleWidth, splashBtnFade, splashBtnSlide, wordmarkScale]);

  const transitionTo = (nextStep: Step) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -40, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setStep(nextStep);
      slideAnim.setValue(48);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleNext = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'splash') {
      transitionTo('name');
    } else if (step === 'name' && firstName.trim()) {
      transitionTo('blocker');
    } else if (step === 'blocker' && selectedBlocker) {
      if (selectedBlocker === 'Other' && !otherBlocker.trim()) return;
      transitionTo('truth');
    } else if (step === 'truth') {
      transitionTo('promise');
    } else if (step === 'promise') {
      transitionTo('framework');
    } else if (step === 'framework') {
      transitionTo('reminder');
    } else if (step === 'reminder') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const prayerLife = BLOCKER_TO_PRAYER[selectedBlocker ?? ''] ?? 'new';
      const blockerIdx = selectedBlocker ? BLOCKER_OPTIONS.indexOf(selectedBlocker) : -1;
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
  };

  const canProceed = () => {
    if (step === 'splash') return true;
    if (step === 'name') return firstName.trim().length > 0;
    if (step === 'blocker') {
      if (selectedBlocker === 'Other') return otherBlocker.trim().length > 0;
      return selectedBlocker !== null;
    }
    if (step === 'truth') return true;
    if (step === 'promise') return true;
    if (step === 'framework') return true;
    return true;
  };

  const displayName = firstName.trim() || 'Friend';

  const stepMap: Record<Step, number> = { splash: -1, name: 0, blocker: 1, truth: 2, promise: 3, framework: 4, reminder: 5 };
  const stepIndex = stepMap[step];
  const totalDots = 6;

  const renderDots = () => {
    if (step === 'splash') return null;
    return (
      <View style={styles.dotsRow}>
        {Array.from({ length: totalDots }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === stepIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    );
  };

  const getButtonLabel = () => {
    if (step === 'name') return "THAT'S ME  →";
    if (step === 'blocker') return 'CONTINUE  →';
    if (step === 'truth') return "I'M READY  →";
    if (step === 'promise') return "I'M READY  →";
    return 'CONTINUE  →';
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
          colors={['#0D0804', '#1A1006', '#0D0804']}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {step === 'splash' ? (
              <View style={styles.splashContainer}>
                <Animated.View
                  style={[styles.spGlowBottomWrap, { opacity: orbPulse }]}
                  pointerEvents="none"
                >
                  <RadialGlow size={380} maxOpacity={0.22} />
                </Animated.View>

                <View style={styles.spGlowCenterWrap} pointerEvents="none">
                  <RadialGlow size={260} maxOpacity={0.065} />
                </View>

                <View style={styles.spGlowTopWrap} pointerEvents="none">
                  <RadialGlow size={280} maxOpacity={0.07} />
                </View>

                <Animated.View
                  style={[
                    styles.splashBrand,
                    {
                      opacity: splashFade,
                      transform: [
                        { translateY: splashSlide },
                        { scale: wordmarkScale },
                      ],
                    },
                  ]}
                >
                  <Text style={[styles.splashWordmark, { fontFamily: Fonts.titleExtraLight }]}>Amen</Text>
                </Animated.View>

                <Animated.View style={[styles.splashRuleWrap, { opacity: splashRuleFade }]}>
                  <Animated.View style={{ width: splashRuleWidth, height: 1, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={['transparent', '#C8894A', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ width: 200, height: 1 }}
                    />
                  </Animated.View>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.splashTagWrap,
                    { opacity: splashRuleFade, transform: [{ translateY: splashSlide }] },
                  ]}
                >
                  <Text style={[styles.splashTag, { fontFamily: Fonts.italic }]}>
                    God is <Text style={[styles.splashTagEm, { fontFamily: Fonts.italicMedium }]}>much closer</Text> than you think.
                  </Text>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.splashActions,
                    { opacity: splashBtnFade, transform: [{ translateY: splashBtnSlide }] },
                  ]}
                >
                  <GlowButton
                    label="BEGIN YOUR 30 DAYS"
                    onPress={handleNext}
                    variant="ghost"
                    textStyle={{ fontFamily: Fonts.titleLight }}
                    style={{ width: '100%' }}
                  />
                  <Text style={[styles.splashSub, { fontFamily: Fonts.italic }]}>
                    No experience needed. No perfect words required.
                  </Text>
                </Animated.View>
              </View>
            ) : (
              <>
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.obGlowTopWrap} pointerEvents="none">
                    <RadialGlow size={280} maxOpacity={0.09} />
                  </View>
                  <Animated.View
                    style={[
                      styles.content,
                      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                  >
                    {step === 'name' && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>A NEW BEGINNING</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          What do people{'\n'}call <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>you?</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={['#C8894A', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGrad}
                          />
                        </View>
                        <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular }]}>
                          God has known your name since before the foundations of the earth. He calls you beloved. We just want to say it back.
                        </Text>
                        <View style={styles.nameInputWrap}>
                          <TextInput
                            style={[styles.nameInput, { fontFamily: Fonts.italic }]}
                            value={firstName}
                            onChangeText={setFirstName}
                            placeholder="Your first name"
                            placeholderTextColor="rgba(244,237,224,0.22)"
                            autoFocus
                            autoCapitalize="words"
                            returnKeyType="next"
                            onSubmitEditing={handleNext}
                            testID="onboarding-name-input"
                          />
                          <Text style={[styles.nameHelp, { fontFamily: Fonts.italic }]}>
                            This is just between you and God, and us.
                          </Text>
                        </View>
                      </View>
                    )}

                    {step === 'blocker' && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>BE HONEST WITH US</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          What usually{'\n'}holds back your{'\n'}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>prayer life, {displayName}?</Text>
                        </Text>
                        <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular }]}>
                          No wrong answers here.{' '}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicMedium }}>Every struggle is a doorway</Text>.
                          {' '}Freedom is on the other side of this one.
                        </Text>
                        <View style={styles.choices}>
                          {BLOCKER_OPTIONS.map((option) => {
                            const isSelected = selectedBlocker === option;
                            return (
                              <Pressable
                                key={option}
                                style={({ pressed, hovered }: any) => [
                                  styles.choiceBtn,
                                  isSelected && styles.choiceBtnSelected,
                                  (pressed || hovered) && !isSelected && styles.choiceBtnHovered,
                                ]}
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setSelectedBlocker(option);
                                }}
                                testID={`blocker-option-${BLOCKER_OPTIONS.indexOf(option)}`}
                              >
                                <Text
                                  style={[
                                    styles.choiceBtnText,
                                    { fontFamily: Fonts.serifRegular },
                                    isSelected && styles.choiceBtnTextSelected,
                                  ]}
                                >
                                  {option}
                                </Text>
                              </Pressable>
                            );
                          })}
                          {selectedBlocker === 'Other' && (
                            <TextInput
                              style={[styles.nameInput, { fontFamily: Fonts.italic, marginTop: 10, fontSize: 20.7, borderBottomColor: 'rgba(200,137,74,0.32)' }]}
                              value={otherBlocker}
                              onChangeText={setOtherBlocker}
                              placeholder="Tell us what holds you back..."
                              placeholderTextColor="rgba(244,237,224,0.22)"
                              autoFocus
                              returnKeyType="next"
                              onSubmitEditing={handleNext}
                            />
                          )}
                        </View>
                      </View>
                    )}

                    {step === 'truth' && selectedBlocker && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>THE LIE VS THE TRUTH</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          Freeing your{'\n'}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>perspective</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={['#C8894A', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGrad}
                          />
                        </View>
                        <View style={{ marginBottom: 32 }}>
                          <Text style={[styles.eyebrow, { color: 'rgba(244,237,224,0.4)', marginBottom: 8 }]}>The Lie</Text>
                          <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular, textDecorationLine: 'line-through', color: 'rgba(244,237,224,0.3)' }]}>
                            {BLOCKER_TRUTHS[selectedBlocker]?.lie}
                          </Text>
                        </View>
                        <View>
                          <Text style={[styles.eyebrow, { color: '#E0A868', marginBottom: 8 }]}>God&apos;s Truth</Text>
                          <Text style={[styles.screenBody, { fontFamily: Fonts.serifSemiBold, color: '#F4EDE0', fontSize: 23, lineHeight: 34 }]}>
                            {BLOCKER_TRUTHS[selectedBlocker]?.truth}
                          </Text>
                        </View>
                      </View>
                    )}

                    {step === 'promise' && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR INHERITANCE</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          Not a program.{'\n'}A <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>journey into wholeness.</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={['#C8894A', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGrad}
                          />
                        </View>
                        <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular }]}>
                          Thirty days from now, you will pray without a script. You&apos;ll know your voice with God, and His voice in return.{'\n\n'}You weren&apos;t meant to live stuck in prayerless silence.{' '}
                          <Text style={{ color: '#F4EDE0', fontFamily: Fonts.serifSemiBold }}>
                            Freedom is possible. A deeper relationship with God is possible.
                          </Text>
                          {'\n\n'}You are not too far gone. Not too ordinary. Not starting too late.{' '}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicMedium }}>
                            You are exactly the kind of person this was made for.
                          </Text>
                        </Text>
                        
                        {selectedBlocker !== null && (
                          <View style={{ marginTop: 24, padding: 16, backgroundColor: 'rgba(200,137,74,0.06)', borderLeftWidth: 3, borderLeftColor: 'rgba(200,137,74,0.35)', borderRadius: 14, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                            <Text style={[styles.screenBody, { fontFamily: Fonts.italic, fontSize: 18.4, color: 'rgba(200,137,74,0.8)' }]}>
                              {selectedBlocker === BLOCKER_OPTIONS[0] ? (
                                <Text>You said you don&apos;t know the right words to pray. <Text style={{ fontFamily: Fonts.italicSemiBold, color: '#F4EDE0' }}>That&apos;s exactly why we wrote every word for you.</Text> For the next seven days, you won&apos;t need to find a single phrase on your own.</Text>
                              ) : selectedBlocker === BLOCKER_OPTIONS[1] ? (
                                <Text>You said prayer feels one-sided, like talking to a wall. <Text style={{ fontFamily: Fonts.italicSemiBold, color: '#F4EDE0' }}>We hear that. Most people start exactly here.</Text> Today we&apos;re not asking you to feel anything. Just to show up and say the words.</Text>
                              ) : selectedBlocker === BLOCKER_OPTIONS[2] ? (
                                <Text>You said consistency is the struggle. <Text style={{ fontFamily: Fonts.italicSemiBold, color: '#F4EDE0' }}>That&apos;s why we built reminders, streaks, and a grace day.</Text> The whole system was designed for people who keep forgetting, because that&apos;s all of us.</Text>
                              ) : selectedBlocker === BLOCKER_OPTIONS[3] ? (
                                <Text>You said you feel too broken or too far from God to start. <Text style={{ fontFamily: Fonts.italicSemiBold, color: '#F4EDE0' }}>Then this is the most important thing you could do today.</Text> The distance you feel is not the truth about where God is.</Text>
                              ) : (
                                <Text>You brought a struggle. <Text style={{ fontFamily: Fonts.italicSemiBold, color: '#F4EDE0' }}>This is your promise that every struggle is a doorway,</Text> and He meets you here.</Text>
                              )}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {step === 'framework' && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR DAILY GUIDE</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          The TRIAD{'\n'}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>framework</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={['#C8894A', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGrad}
                          />
                        </View>
                        <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular, marginBottom: 22 }]}>
                          Five anchors covering the full range of authentic prayer: spirit, soul, and body. You learn them by doing, not by studying.
                        </Text>
                        <View style={styles.triadList}>
                          {TRIAD_ITEMS.map((item, _idx) => (
                            <Animated.View
                              key={item.name}
                              style={[
                                styles.triadItem,
                                {
                                  opacity: fadeAnim,
                                  transform: [{
                                    translateY: slideAnim.interpolate({
                                      inputRange: [-100, 0],
                                      outputRange: [100, 0],
                                      extrapolate: 'clamp',
                                    }),
                                  }],
                                },
                              ]}
                            >
                              <View style={styles.triadIconWrap}>
                                <Text style={styles.triadEmoji}>{item.emoji}</Text>
                              </View>
                              <View style={styles.triadTextWrap}>
                                <Text style={[styles.triadName, { fontFamily: Fonts.titleSemiBold }]}>{item.name.toUpperCase()}</Text>
                                <Text style={[styles.triadDesc, { fontFamily: Fonts.serifRegular }]}>{item.desc}</Text>
                              </View>
                            </Animated.View>
                          ))}
                        </View>
                      </View>
                    )}

                    {step === 'reminder' && (
                      <View>
                        <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>NEVER MISS A DAY</Text>
                        <Text style={[styles.screenTitle, { fontFamily: Fonts.serifLight }]}>
                          When should we{'\n'}remind{' '}
                          <Text style={{ color: '#E0A868', fontFamily: Fonts.italicSemiBold }}>you?</Text>
                        </Text>
                        <View style={styles.screenRuleWrap}>
                          <LinearGradient
                            colors={['#C8894A', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.screenRuleGrad}
                          />
                        </View>
                        <Text style={[styles.screenBody, { fontFamily: Fonts.serifRegular }]}>
                          A gentle nudge at the right moment is the difference between a habit and a wish.
                        </Text>
                        <View style={styles.timePickerWrap}>
                          <Text style={[styles.timeDisplay, { fontFamily: Fonts.titleThin }]}>
                            {reminderHour}:{reminderMin.toString().padStart(2, '0')}
                          </Text>
                          <View style={styles.timeAmPmRow}>
                            <Pressable
                              style={({ pressed, hovered }: any) => [
                                styles.amPmBtn,
                                reminderAmPm === 'AM' && styles.amPmBtnActive,
                                (pressed || hovered) && reminderAmPm !== 'AM' && styles.amPmBtnHover,
                              ]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderAmPm('AM'); }}
                            >
                              <Text style={[styles.amPmBtnText, { fontFamily: Fonts.titleRegular }, reminderAmPm === 'AM' && styles.amPmBtnTextActive]}>AM</Text>
                            </Pressable>
                            <Pressable
                              style={({ pressed, hovered }: any) => [
                                styles.amPmBtn,
                                reminderAmPm === 'PM' && styles.amPmBtnActive,
                                (pressed || hovered) && reminderAmPm !== 'PM' && styles.amPmBtnHover,
                              ]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderAmPm('PM'); }}
                            >
                              <Text style={[styles.amPmBtnText, { fontFamily: Fonts.titleRegular }, reminderAmPm === 'PM' && styles.amPmBtnTextActive]}>PM</Text>
                            </Pressable>
                          </View>
                          <View style={styles.timeAdjRow}>
                            <Pressable
                              style={({ pressed, hovered }: any) => [styles.timeAdjBtn, (pressed || hovered) && styles.timeAdjBtnHover]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderHour(h => h <= 1 ? 12 : h - 1); }}
                            >
                              <Text style={styles.timeAdjBtnText}>−</Text>
                            </Pressable>
                            <Text style={[styles.timeAdjLabel, { fontFamily: Fonts.titleMedium }]}>HOUR</Text>
                            <Pressable
                              style={({ pressed, hovered }: any) => [styles.timeAdjBtn, (pressed || hovered) && styles.timeAdjBtnHover]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderHour(h => h >= 12 ? 1 : h + 1); }}
                            >
                              <Text style={styles.timeAdjBtnText}>+</Text>
                            </Pressable>
                          </View>
                          <View style={styles.timeAdjRow}>
                            <Pressable
                              style={({ pressed, hovered }: any) => [styles.timeAdjBtn, (pressed || hovered) && styles.timeAdjBtnHover]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderMin(m => m <= 0 ? 55 : m - 5); }}
                            >
                              <Text style={styles.timeAdjBtnText}>−</Text>
                            </Pressable>
                            <Text style={[styles.timeAdjLabel, { fontFamily: Fonts.titleMedium }]}>MIN</Text>
                            <Pressable
                              style={({ pressed, hovered }: any) => [styles.timeAdjBtn, (pressed || hovered) && styles.timeAdjBtnHover]}
                              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderMin(m => m >= 55 ? 0 : m + 5); }}
                            >
                              <Text style={styles.timeAdjBtnText}>+</Text>
                            </Pressable>
                          </View>
                          <Text style={[styles.timeHelper, { fontFamily: Fonts.italic }]}>
                            &quot;Day 1 is waiting for you, <Text style={{ color: '#E0A868', fontFamily: Fonts.italic }}>friend</Text>.&quot;{'\n'}
                            Every morning at this time until you open the app.
                          </Text>
                        </View>
                        <View style={styles.graceBadge}>
                          <Text style={styles.graceEmoji}>🛡️</Text>
                          <Text style={[styles.graceBadgeText, { fontFamily: Fonts.titleMedium }]}>
                            Grace day: one miss forgiven per week
                          </Text>
                        </View>
                      </View>
                    )}

                    {renderDots()}
                  </Animated.View>
                </ScrollView>

                <View style={styles.footer}>
                  {step === 'framework' ? (
                    <GlowButton
                      label="STEP INTO DAY 1"
                      onPress={handleNext}
                      variant="amber"
                      textStyle={{ fontFamily: Fonts.titleMedium }}
                      style={{ width: '100%' }}
                    />
                  ) : step === 'reminder' ? (
                    <View style={styles.reminderActions}>
                      <GlowButton
                        label="SET MY REMINDER"
                        onPress={handleNext}
                        variant="amber"
                        textStyle={{ fontFamily: Fonts.titleMedium }}
                        style={{ width: '100%' }}
                      />
                      <Pressable
                        style={({ pressed, hovered }: any) => [
                          styles.skipBtn,
                          (pressed || hovered) && styles.skipBtnHover,
                        ]}
                        onPress={handleNext}
                      >
                        <Text style={[styles.skipBtnText, { fontFamily: Fonts.titleRegular }]}>Skip for now</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <GlowButton
                      label={getButtonLabel()}
                      onPress={handleNext}
                      variant="ghost"
                      disabled={!canProceed()}
                      textStyle={{ fontFamily: Fonts.titleLight }}
                      style={{ width: '100%' }}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1006',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  spGlowBottomWrap: {
    position: 'absolute',
    bottom: -80,
    left: Math.round(Dimensions.get('window').width / 2) - 190,
  },
  spGlowCenterWrap: {
    position: 'absolute',
    top: Math.round(Dimensions.get('window').height * 0.36) - 130,
    left: Math.round(Dimensions.get('window').width / 2) - 130,
  },
  spGlowTopWrap: {
    position: 'absolute',
    top: -100,
    left: Math.round(Dimensions.get('window').width / 2) - 140,
  },
  obGlowTopWrap: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    marginLeft: -140,
  },
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: {
    alignItems: 'center',
    marginBottom: 22,
  },
  splashWordmark: {
    fontSize: 87.4,
    letterSpacing: 11,
    lineHeight: 84,
    color: '#F4EDE0',
  },
  splashRuleWrap: {
    marginBottom: 22,
    alignItems: 'center',
  },
  splashTagWrap: {
    marginBottom: 60,
  },
  splashTag: {
    fontSize: 19,
    textAlign: 'center',
    lineHeight: 28,
    color: 'rgba(244,237,224,0.55)',
  },
  splashTagEm: {
    color: '#E0A868',
  },
  splashActions: {
    position: 'absolute',
    bottom: 60,
    left: 32,
    right: 32,
    alignItems: 'center',
    gap: 16,
  },
  splashSub: {
    fontSize: 15,
    textAlign: 'center',
    color: 'rgba(244,237,224,0.28)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 100,
  },
  content: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10.4,
    letterSpacing: 3.5,
    textTransform: 'uppercase' as const,
    color: '#C8894A',
    marginTop: 28,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 48.3,
    lineHeight: 46,
    letterSpacing: -0.3,
    color: '#F4EDE0',
    marginBottom: 14,
  },
  screenRuleWrap: {
    width: 44,
    height: 1.5,
    marginBottom: 18,
    opacity: 0.55,
    overflow: 'hidden',
  },
  screenRuleGrad: {
    width: '100%',
    height: '100%',
  },
  screenBody: {
    fontSize: 20.7,
    lineHeight: 32,
    color: 'rgba(244,237,224,0.55)',
  },
  nameInputWrap: {
    marginTop: 40,
  },
  nameInput: {
    fontSize: 34.5,
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,137,74,0.32)',
    color: '#F4EDE0',
  },
  nameHelp: {
    fontSize: 15,
    marginTop: 10,
    color: 'rgba(200,137,74,0.48)',
  },
  choices: {
    gap: 10,
    marginTop: 30,
  },
  choiceBtn: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(34,20,8,0.55)',
    borderColor: 'rgba(200,137,74,0.13)',
  },
  choiceBtnHovered: {
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderColor: 'rgba(200,137,74,0.24)',
  },
  choiceBtnSelected: {
    backgroundColor: 'rgba(200,137,74,0.09)',
    borderColor: 'rgba(200,137,74,0.38)',
  },
  choiceBtnText: {
    fontSize: 20.7,
    lineHeight: 26,
    color: 'rgba(244,237,224,0.55)',
  },
  choiceBtnTextSelected: {
    color: '#F4EDE0',
  },
  triadList: {
    gap: 8,
  },
  triadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: 'rgba(200,137,74,0.045)',
    borderColor: 'rgba(200,137,74,0.13)',
  },
  triadIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
  },
  triadEmoji: {
    fontSize: 20.7,
    textAlign: 'center',
  },
  triadTextWrap: {
    flex: 1,
  },
  triadName: {
    fontSize: 10.4,
    letterSpacing: 2,
    marginBottom: 3,
    color: '#C8894A',
  },
  triadDesc: {
    fontSize: 16.1,
    lineHeight: 22,
    color: 'rgba(244,237,224,0.55)',
  },
  timePickerWrap: {
    marginTop: 28,
    backgroundColor: 'rgba(200,137,74,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.13)',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center' as const,
    gap: 16,
  },
  timeDisplay: {
    fontSize: 71.3,
    letterSpacing: 2,
    color: '#F4EDE0',
    lineHeight: 68,
  },
  timeAmPmRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  amPmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.13)',
    backgroundColor: 'transparent',
  },
  amPmBtnHover: {
    borderColor: 'rgba(200,137,74,0.28)',
    backgroundColor: 'rgba(200,137,74,0.06)',
  },
  amPmBtnActive: {
    backgroundColor: 'rgba(200,137,74,0.12)',
    borderColor: 'rgba(200,137,74,0.4)',
  },
  amPmBtnText: {
    fontSize: 12.6,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: 'rgba(244,237,224,0.55)',
  },
  amPmBtnTextActive: {
    color: '#F4EDE0',
  },
  timeAdjRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
  },
  timeAdjBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.13)',
    backgroundColor: 'rgba(200,137,74,0.06)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  timeAdjBtnHover: {
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.14)',
  },
  timeAdjBtnText: {
    fontSize: 25.3,
    color: '#F4EDE0',
    lineHeight: 26,
  },
  timeAdjLabel: {
    fontSize: 10.4,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.55)',
    minWidth: 36,
    textAlign: 'center' as const,
  },
  timeHelper: {
    fontSize: 16.1,
    color: 'rgba(244,237,224,0.55)',
    textAlign: 'center' as const,
    lineHeight: 24,
    paddingHorizontal: 6,
  },
  graceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    marginTop: 18,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,137,74,0.07)',
    borderColor: 'rgba(200,137,74,0.2)',
  },
  graceEmoji: {
    fontSize: 16.1,
  },
  graceBadgeText: {
    fontSize: 10.4,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.7)',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 28,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(200,137,74,0.18)',
  },
  dotActive: {
    width: 22,
    borderRadius: 3,
    backgroundColor: '#C8894A',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    paddingTop: 8,
  },
  ghostBtn: {
    width: '100%',
    paddingVertical: 17,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ghostBtnHovered: {
    borderColor: 'rgba(200,137,74,0.65)',
    backgroundColor: 'rgba(200,137,74,0.07)',
  },
  ghostBtnPressed: {
    borderColor: 'rgba(200,137,74,0.55)',
    backgroundColor: 'rgba(200,137,74,0.09)',
  },
  ghostBtnPressedOverlay: {
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 100,
  },
  ghostBtnText: {
    fontSize: 14.4,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#F4EDE0',
  },
  amberBtn: {
    borderRadius: 100,
    overflow: 'hidden',
    shadowColor: '#C89A5A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 8,
  },
  amberBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  amberBtnInner: {
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  amberBtnText: {
    fontSize: 14.4,
    letterSpacing: 2,
    color: '#1A120B',
  },
  btnDisabled: {
    opacity: 0.3,
  },
  reminderActions: {
    gap: 12,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  skipBtnHover: {
    opacity: 0.6,
  },
  skipBtnText: {
    fontSize: 15,
    color: 'rgba(244,237,224,0.28)',
  },
});
