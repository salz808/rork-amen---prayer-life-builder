import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import BackgroundGradient from '@/components/BackgroundGradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { CHECKLIST_CATEGORIES, CHECKLIST_INTRO, CHECKLIST_ITEMS, FIRST_STEPS_SELah_NOTE, FIRST_STEPS_TRIAD_ANCHORS, ChecklistCategory, ChecklistItem } from '@/mocks/checklist';
import { useApp } from '@/providers/AppProvider';

function StaggerItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useState(() => new Animated.Value(index > 4 ? 1 : 0))[0]
  const translateY = useState(() => new Animated.Value(index > 4 ? 0 : 16))[0]

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
  const headerFadeAnim = useState(() => new Animated.Value(0))[0]
  const headerSlideAnim = useState(() => new Animated.Value(12))[0]
  const introFadeAnim = useState(() => new Animated.Value(0))[0]
  const introSlideAnim = useState(() => new Animated.Value(16))[0]

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
      <BackgroundGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
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
            <Text style={[styles.title, { fontFamily: Fonts.serifMedium }]}>A quiet record{`\n`}of becoming.</Text>
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
            <View style={styles.autoCard}>
              <View style={styles.autoIconWrap}>
                <Sparkles size={14} color={C.accentDark} />
              </View>
              <Text style={[styles.autoText, { fontFamily: Fonts.titleRegular }]}>
                Some steps mark themselves as you live them. You finish the journey. You sit in silence. You name a request. You save a declaration. The rest are yours to mark, as they happen in your life.
              </Text>
            </View>
            {/* GPT-6 item 10: the how-it-works explainer moved out of
                onboarding — it lives here now, after the first prayer,
                not before it. */}
            <View style={styles.guideCard} testID="first-steps-guide">
              <Text style={[styles.guideEyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR DAILY GUIDE</Text>
              <Text style={[styles.guideTitle, { fontFamily: Fonts.serifMedium }]}>How a prayer works</Text>
              <Text style={[styles.guideBody, { fontFamily: Fonts.serifRegular }]}>
                Five anchors for the full range of real prayer: your spirit (how you connect with God), your soul (mind, feelings, and choices), and your body (how you live it out). You learn them by doing, not by studying.
              </Text>
              {FIRST_STEPS_TRIAD_ANCHORS.map((anchor) => (
                <View key={anchor.name} style={styles.guideRow}>
                  <Text style={[styles.guideName, { fontFamily: Fonts.titleSemiBold }]}>{anchor.name.toUpperCase()}</Text>
                  <Text style={[styles.guideDesc, { fontFamily: Fonts.serifRegular }]}>{anchor.desc}</Text>
                </View>
              ))}
              <View style={styles.guideDivider} />
              <Text style={[styles.guideBody, { fontFamily: Fonts.serifRegular }]}>
                {FIRST_STEPS_SELah_NOTE}
              </Text>
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
                          <View style={styles.itemTextWrap}>
                            <Text
                              style={[
                                styles.itemText,
                                { fontFamily: Fonts.serifRegular },
                                isCompleted && styles.itemTextCompleted,
                              ]}
                            >
                              {item.text}
                            </Text>
                            {item.autoTracked ? (
                              <View style={styles.autoBadge}>
                                <Sparkles size={10} color={C.accentDark} />
                                <Text style={[styles.autoBadgeText, { fontFamily: Fonts.titleBold }]}>AUTO</Text>
                              </View>
                            ) : null}
                          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    color: C.textSecondary,
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 0.4,
  },
  eyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: C.text,
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
  },
  sectionCount: {
    color: C.accentDark,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
  itemTextWrap: {
    flex: 1,
    gap: 6,
  },
  itemText: {
    color: C.textSecondary,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
  },
  autoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
  },
  autoBadgeText: {
    color: C.accentDark,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.2,
  },
  autoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.accentBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 28,
  },
  autoIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    marginTop: 2,
  },
  autoText: {
    flex: 1,
    color: C.textSecondary,
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
  },
  // GPT-6 item 10: the moved how-it-works explainer. Same card language
  // as introCard, with the anchor rows from the old onboarding framework
  // step (name + one line each).
  guideCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 28,
  },
  guideEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    marginBottom: 8,
  },
  guideBody: {
    color: C.textSecondary,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    marginBottom: 16,
  },
  guideRow: {
    marginBottom: 12,
  },
  guideName: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 2,
  },
  guideDesc: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  guideDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 4,
    marginBottom: 16,
  },
  itemTextCompleted: {
    color: C.text,
  },
});
