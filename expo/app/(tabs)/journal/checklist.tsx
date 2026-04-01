import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
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
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { CHECKLIST_CATEGORIES, CHECKLIST_INTRO, CHECKLIST_ITEMS, ChecklistCategory, ChecklistItem } from '@/mocks/checklist';
import { useApp } from '@/providers/AppProvider';

export default function FirstStepsChecklistScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, toggleFirstStepCompleted } = useApp();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 46, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

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

  const handleToggle = (id: string) => {
    if (__DEV__) {
      console.log('[ChecklistScreen] Toggling item from screen', { id });
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFirstStepCompleted(id);
  };

  return (
    <View style={styles.root} testID="first-steps-screen">
      <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(200,137,74,0.05)', 'transparent']}
        style={styles.ambientTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="first-steps-scroll">
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Pressable onPress={() => router.back()} style={styles.backButton} testID="first-steps-back-button">
              <ArrowLeft size={18} color={C.textSecondary} />
              <Text style={[styles.backButtonText, { fontFamily: Fonts.titleMedium }]}>Back</Text>
            </Pressable>

            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>FIRST STEPS</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>A quiet record{`\n`}of becoming.</Text>
            <Text style={[styles.progressText, { fontFamily: Fonts.italic }]} testID="first-steps-progress">
              {completedCount} of {CHECKLIST_ITEMS.length} steps taken
            </Text>

            <View style={styles.introCard}>
              <Text style={[styles.introText, { fontFamily: Fonts.italic }]}>{CHECKLIST_INTRO}</Text>
            </View>
          </Animated.View>

          {CHECKLIST_CATEGORIES.map((category) => {
            const items = sections[category];
            const categoryCompleted = items.filter((item) => completedIds.has(item.id)).length;

            return (
              <Animated.View
                key={category}
                style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
                testID={`first-steps-section-${category.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>{category}</Text>
                  <Text style={[styles.sectionCount, { fontFamily: Fonts.titleMedium }]}>
                    {categoryCompleted}/{items.length}
                  </Text>
                </View>

                <View style={styles.sectionList}>
                  {items.map((item) => {
                    const isCompleted = completedIds.has(item.id);

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleToggle(item.id)}
                        style={({ pressed }) => [
                          styles.itemCard,
                          isCompleted && styles.itemCardCompleted,
                          pressed && styles.itemCardPressed,
                        ]}
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
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
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
    paddingTop: 12,
    paddingBottom: 140,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
    alignSelf: 'flex-start',
    paddingVertical: 6,
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
  progressText: {
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textMuted,
    marginBottom: 18,
  },
  introCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 18,
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
    marginBottom: 14,
  },
  sectionTitle: {
    color: C.text,
    fontSize: T.scale(24),
  },
  sectionCount: {
    color: C.textMuted,
    fontSize: T.scale(11),
    letterSpacing: 1.2,
  },
  sectionList: {
    gap: 12,
    marginBottom: 28,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  itemCardCompleted: {
    opacity: 0.72,
    backgroundColor: C.surfaceAlt,
    borderColor: 'rgba(200,137,74,0.22)',
  },
  itemCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  itemCheckWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
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
    borderRadius: 999,
    backgroundColor: C.textMuted,
    opacity: 0.45,
  },
  itemText: {
    flex: 1,
    color: C.textSecondary,
    fontSize: T.scale(16),
    lineHeight: 25,
  },
  itemTextCompleted: {
    color: C.textMuted,
  },
});
