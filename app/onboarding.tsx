import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { UserProfile, PrayerLifeOption } from '@/types';
import { Fonts } from '@/constants/fonts';

const PRAYER_OPTIONS: PrayerLifeOption[] = [
  { value: 'new', label: 'New to prayer', description: 'Just beginning to explore' },
  { value: 'inconsistent', label: 'Inconsistent', description: 'I want a regular practice' },
  { value: 'growing', label: 'Growing', description: 'Ready to go deeper' },
];

type Step = 'name' | 'prayer';

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useApp();

  const [step, setStep] = useState<Step>('name');
  const [firstName, setFirstName] = useState('');
  const [prayerLife, setPrayerLife] = useState<UserProfile['prayerLife']>('inconsistent');
  const [nameError, setNameError] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionTo = (nextStep: Step) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNameNext = () => {
    const trimmed = firstName.trim();
    if (!trimmed) {
      setNameError('Please enter your first name');
      return;
    }
    setNameError('');
    transitionTo('prayer');
  };

  const handleComplete = () => {
    const user: UserProfile = {
      firstName: firstName.trim(),
      prayerLife,
      onboardingComplete: true,
    };
    completeOnboarding(user);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0A0603', '#120A05', '#0A0603']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoWrap}>
              <Text style={styles.wordmark}>Amen</Text>
              <Text style={styles.tagline}>30 days of prayer</Text>
            </View>

            <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
              {step === 'name' && (
                <>
                  <Text style={styles.stepLabel}>STEP 1 OF 2</Text>
                  <Text style={styles.heading}>What should we call you?</Text>
                  <Text style={styles.sub}>
                    We'll use your name to make this feel personal.
                  </Text>
                  <TextInput
                    style={[styles.input, nameError ? styles.inputError : null]}
                    placeholder="Your first name"
                    placeholderTextColor="rgba(244,237,224,0.25)"
                    value={firstName}
                    onChangeText={(t) => {
                      setFirstName(t);
                      if (nameError) setNameError('');
                    }}
                    autoCapitalize="words"
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={handleNameNext}
                  />
                  {nameError ? (
                    <Text style={styles.errorText}>{nameError}</Text>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.primaryBtnPressed,
                    ]}
                    onPress={handleNameNext}
                  >
                    <Text style={styles.primaryBtnText}>CONTINUE</Text>
                    <ChevronRight size={16} color="#C89A5A" />
                  </Pressable>
                </>
              )}

              {step === 'prayer' && (
                <>
                  <Text style={styles.stepLabel}>STEP 2 OF 2</Text>
                  <Text style={styles.heading}>
                    Where are you with prayer?
                  </Text>
                  <Text style={styles.sub}>
                    This helps us meet you where you are.
                  </Text>
                  <View style={styles.optionList}>
                    {PRAYER_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={({ pressed }) => [
                          styles.optionCard,
                          prayerLife === opt.value && styles.optionCardActive,
                          pressed && styles.optionCardPressed,
                        ]}
                        onPress={() => setPrayerLife(opt.value)}
                      >
                        <View
                          style={[
                            styles.optionRadio,
                            prayerLife === opt.value && styles.optionRadioActive,
                          ]}
                        />
                        <View style={styles.optionTextWrap}>
                          <Text
                            style={[
                              styles.optionLabel,
                              prayerLife === opt.value && styles.optionLabelActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={styles.optionDesc}>{opt.description}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.primaryBtnPressed,
                    ]}
                    onPress={handleComplete}
                  >
                    <Text style={styles.primaryBtnText}>BEGIN MY JOURNEY</Text>
                    <ChevronRight size={16} color="#C89A5A" />
                  </Pressable>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0603',
  },
  safe: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  glowTop: {
    position: 'absolute',
    top: -120,
    left: '50%',
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(200,137,74,0.1)',
    transform: [{ scaleY: 0.55 }],
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(200,137,74,0.06)',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  wordmark: {
    fontFamily: Fonts.serifLight,
    fontSize: 52,
    color: '#F4EDE0',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: Fonts.titleLight,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: 'rgba(200,137,74,0.7)',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.12)',
    padding: 28,
  },
  stepLabel: {
    fontFamily: Fonts.titleMedium,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: 'rgba(200,137,74,0.5)',
    marginBottom: 14,
  },
  heading: {
    fontFamily: Fonts.serifLight,
    fontSize: 28,
    lineHeight: 36,
    color: '#F4EDE0',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: Fonts.titleLight,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(244,237,224,0.5)',
    marginBottom: 28,
  },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.25)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#F4EDE0',
    fontFamily: Fonts.titleLight,
    marginBottom: 8,
  },
  inputError: {
    borderColor: 'rgba(212,118,106,0.5)',
  },
  errorText: {
    fontFamily: Fonts.titleLight,
    fontSize: 12,
    color: 'rgba(212,118,106,0.9)',
    marginBottom: 16,
    marginLeft: 4,
  },
  optionList: {
    gap: 10,
    marginBottom: 28,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    backgroundColor: 'rgba(200,137,74,0.03)',
  },
  optionCardActive: {
    borderColor: 'rgba(200,137,74,0.45)',
    backgroundColor: 'rgba(200,137,74,0.08)',
  },
  optionCardPressed: {
    opacity: 0.8,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(200,137,74,0.3)',
  },
  optionRadioActive: {
    borderColor: '#C89A5A',
    backgroundColor: '#C89A5A',
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontFamily: Fonts.titleMedium,
    fontSize: 14,
    color: 'rgba(244,237,224,0.7)',
    letterSpacing: 0.2,
  },
  optionLabelActive: {
    color: '#F4EDE0',
  },
  optionDesc: {
    fontFamily: Fonts.titleLight,
    fontSize: 12,
    color: 'rgba(244,237,224,0.38)',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.5)',
    backgroundColor: 'transparent',
    marginTop: 8,
  },
  primaryBtnPressed: {
    backgroundColor: 'rgba(200,154,90,0.08)',
  },
  primaryBtnText: {
    fontFamily: Fonts.titleMedium,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#C89A5A',
  },
});
