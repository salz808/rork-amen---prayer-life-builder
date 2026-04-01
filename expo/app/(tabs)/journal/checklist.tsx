import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { CHECKLIST_CATEGORIES, CHECKLIST_INTRO, CHECKLIST_ITEMS, ChecklistCategory, ChecklistItem } from '@/mocks/checklist';
import { useApp } from '@/providers/AppProvider';

function StaggerItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useRef(new Animated.Value(index > 4 ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(index > 4 ? 0 : 16)).current;

  useEffect(() => {
    if (index > 4) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(16);

    const delay = index * 40;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export default function FirstStepsChecklistScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, toggleFirstStepCompleted } = useApp();
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const introFadeAnim = useRef(new Animated.Value(0)).current;
  const introSlideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(headerFadeAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(introFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(introSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [headerFadeAnim, headerSlideAnim, introFadeAnim, introSlideAnim]);

  const completedIds = useMemo<Set<string>>(() => new Set(state.firstStepsCompletedIds ?? []), [state.firstStepsCompletedIds]);
  const completedCount = completedIds.size;

  const sections = useMemo<Record<ChecklistCategory, ChecklistItem[]>>(() => {
    return CHECKLIST_CATEGORIES.reduce<Record<ChecklistCategory, ChecklistItem[]>>((acc, category) => {
      acc[category] = CHECKLIST_ITEMS.filter((item) => item.category === category);
      return acc;
    }, {
      Prayer: [],
      Scripture: [],
      'Faith Steps': [],
      'Inner Life': [],
      Relationships: [],
      Generosity: [],
    });
  }, []);

  const handleToggle = useCallback((id: string) => {
    if (__DEV__) {
      console.log('[ChecklistScreen] Toggling item from screen', { id });
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFirstStepCompleted(id);
  }, [toggleFirstStepCompleted]);

  return (
    <View style={styles.root} testID="first-steps-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.transparent]}
        style={styles.ambientTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="first-steps-scroll">
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <AnimatedPressable onPress={() => router.back()} style={styles.backButton} scaleValue={0.97} testID="first-steps-back-button">
              <ArrowLeft size={18} color={C.textSecondary} />
              <Text style={[styles.backButtonText, { fontFamily: Fonts.titleMedium }]}>Back</Text>
            </AnimatedPressable>

            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>FIRST STEPS</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>A quiet record{`\n`}of becoming.</Text>
            <View style={styles.progressPill}>
              <Text style={[styles.progressText, { fontFamily: Fonts.titleMedium }]} testID="first-steps-progress">
                {completedCount} of {CHECKLIST_ITEMS.length} steps taken
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: introFadeAnim, transform: [{ translateY: introSlideAnim }] }}>
            <View style={styles.introCard}>
              <Text style={[styles.introText, { fontFamily: Fonts.italic }]}>{CHECKLIST_INTRO}</Text>
            </View>
          </Animated.View>

          {CHECKLIST_CATEGORIES.map((category, categoryIndex) => {
            const items = sections[category];
            const categoryCompleted = items.filter((item) => completedIds.has(item.id)).length;

            return (
              <StaggerItem
                key={category}
                index={categoryIndex}
              >
                <View
                  testID={`first-steps-section-${category.toLowerCase().replace(/\s+/g, '-')}`}
                >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>{category}</Text>
                  <Text style={[styles.sectionCount, { fontFamily: Fonts.titleMedium }]}>
                    {categoryCompleted}/{items.length}
                  </Text>
                </View>

                <View style={styles.sectionList}>
                  {items.map((item, itemIndex) => {
                    const isCompleted = completedIds.has(item.id);

                    return (
                      <StaggerItem key={item.id} index={itemIndex}>
                        <AnimatedPressable
                          onPress={() => handleToggle(item.id)}
                          style={[
                            styles.itemCard,
                            isCompleted && styles.itemCardCompleted,
                          ]}
                          scaleValue={0.97}
                          testID={`first-step-item-${item.id}`}
                        >
                          <View style={[styles.itemCheckWrap, isCompleted && styles.itemCheckWrapCompleted]}>
                            {isCompleted ? <Check size={16} color={C.background} /> : <View style={styles.itemCheckDot} />}
                          </View>
                          <Text
                            style={[
                              styles.itemText,
                              { fontFamily: Fonts.serifRegular },
                              isCompleted && styles.itemTextCompleted,
                            ]}
                          >
                            {item.text}
                          </Text>
                        </AnimatedPressable>
                      </StaggerItem>
                    );
                  })}
                </View>
                </View>
              </StaggerItem>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (C: ReturnType<typeof useColors>, T: ReturnType<typeof useTypography>) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safeArea: {
    flex: 1,
  },
  ambientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 140,
  },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  backButtonText: {
    color: C.textSecondary,
    fontSize: T.scale(12),
    letterSpacing: 0.4,
  },
  eyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.scale(34),
    lineHeight: 40,
    color: C.text,
    marginBottom: 12,
  },
  progressPill: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    marginBottom: 20,
  },
  progressText: {
    fontSize: T.scale(11),
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  introCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 28,
  },
  introText: {
    color: C.textSecondary,
    fontSize: T.scale(16),
    lineHeight: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: C.text,
    fontSize: T.scale(24),
  },
  sectionCount: {
    color: C.accentDark,
    fontSize: T.scale(11),
    letterSpacing: 1.2,
  },
  sectionList: {
    gap: 12,
    marginBottom: 28,
  },
  itemCard: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  itemCardCompleted: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.dayChipTodayBorder,
  },
  itemCheckWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    marginTop: 2,
  },
  itemCheckWrapCompleted: {
    backgroundColor: C.accentDark,
    borderColor: C.accentDark,
  },
  itemCheckDot: {
    width: 8,
    height: 8,
    borderRadius: 12,
    backgroundColor: C.iconMuted,
  },
  itemText: {
    flex: 1,
    color: C.textSecondary,
    fontSize: T.scale(16),
    lineHeight: 25,
  },
  itemTextCompleted: {
    color: C.text,
  },
});
