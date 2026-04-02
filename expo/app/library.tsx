import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Lock, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import RadialGlow from '@/components/RadialGlow';
import { Fonts } from '@/constants/fonts';
import { getDayContent } from '@/mocks/content';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useApp } from '@/providers/AppProvider';

const LIBRARY_DAYS = Array.from({ length: 30 }, (_, index) => index + 1);

function getPhaseTags(day: number): string[] {
  if (day <= 10) {
    return ['Spirit', 'Soul', 'Body'];
  }
  if (day <= 20) {
    return ['Soul', 'Spirit', 'Body'];
  }
  return ['Body', 'Soul', 'Spirit'];
}

export default function LibraryScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, hasFeature } = useApp();
  const [lockVisible, setLockVisible] = useState<boolean>(false);

  const hasFullLibraryAccess = Boolean(hasFeature('BROWSE_LIBRARY'));

  const handleOpenDay = (day: number) => {
    const isUnlocked = hasFullLibraryAccess || day <= state.currentDay;

    if (__DEV__) {
      console.log('[Library] Opening day selection', {
        day,
        hasFullLibraryAccess,
        currentDay: state.currentDay,
        isUnlocked,
      });
    }

    if (!isUnlocked) {
      setLockVisible(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/session?day=${day}`);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientGlow} pointerEvents="none">
        <RadialGlow size={420} maxOpacity={0.12} />
      </View>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} testID="library-scroll">
          <View style={styles.headerRow}>
            <AnimatedPressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={styles.backButton}
              scaleValue={0.96}
              testID="library-back"
            >
              <ArrowLeft size={18} color={C.text} />
            </AnimatedPressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>PARTNER LIBRARY</Text>
              <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>Browse every day.</Text>
              <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>
                Partner members can jump anywhere. Everyone else can preview the full path and unlock cards as they go.
              </Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Sparkles size={14} color={C.accent} />
                <Text style={[styles.heroBadgeText, { fontFamily: Fonts.titleMedium }]}>30 guided sessions</Text>
              </View>
              <View style={[styles.heroBadge, !hasFullLibraryAccess && styles.heroBadgeMuted]}>
                <Text style={[styles.heroBadgeText, { fontFamily: Fonts.titleMedium }]}>
                  {hasFullLibraryAccess ? 'Partner unlocked' : `Unlocked through Day ${state.currentDay}`}
                </Text>
              </View>
            </View>
            <Text style={[styles.heroBody, { fontFamily: Fonts.italic }]}>Every card opens the full session flow with the same atmosphere you already know from Home.</Text>
          </View>

          <View style={styles.grid}>
            {LIBRARY_DAYS.map((day) => {
              const dayContent = getDayContent(day);
              const tags = getPhaseTags(day);
              const isCompleted = state.progress.some((item) => item.day === day && item.completed);
              const isLocked = !hasFullLibraryAccess && day > state.currentDay;

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
                          <Text style={[styles.lockTitle, { fontFamily: Fonts.titleSemiBold }]}>Partner</Text>
                          <Text style={[styles.lockSub, { fontFamily: Fonts.titleLight }]}>See Support Options</Text>
                        </View>
                      </View>
                    ) : null}
                  </LinearGradient>
                </AnimatedPressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      <FeatureLockSheet
        visible={lockVisible}
        onClose={() => setLockVisible(false)}
        featureName="Full Library Access"
        requirement="Partner Level"
      />
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
  ambientGlow: {
    position: 'absolute',
    top: -120,
    left: -40,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.overlayLight,
    borderWidth: 1,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: T.scale(10),
    letterSpacing: 2.6,
    color: C.accent,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  title: {
    fontSize: T.scale(36),
    lineHeight: T.scale(40),
    color: C.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: T.scale(16),
    lineHeight: T.scale(24),
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
    fontSize: T.scale(11),
    letterSpacing: 1,
    color: C.text,
    textTransform: 'uppercase' as const,
  },
  heroBody: {
    fontSize: T.scale(15),
    lineHeight: T.scale(22),
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
    fontSize: T.scale(10),
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: T.scale(23),
    lineHeight: T.scale(28),
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
    fontSize: T.scale(10),
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
  },
  cardPhase: {
    fontSize: T.scale(14),
    lineHeight: T.scale(21),
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
    fontSize: T.scale(10),
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCurtain: {
    ...StyleSheet.absoluteFillObject,
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
    fontSize: T.scale(12),
    letterSpacing: 1.4,
    color: C.text,
    textTransform: 'uppercase' as const,
  },
  lockSub: {
    fontSize: T.scale(11),
    color: C.textMuted,
  },
});