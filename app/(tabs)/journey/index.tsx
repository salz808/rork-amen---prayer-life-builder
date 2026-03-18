import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Share2, LogOut } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { DAYS, getDayContent } from '@/mocks/content';
import AnimatedPressable from '@/components/AnimatedPressable';

export default function InsightsScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const { state, signOut } = useApp();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const completedDaysCount = state.progress.filter(p => p.completed).length;
  const silenceMins = useMemo(() => {
    return state.progress
      .filter(p => p.completed)
      .reduce((acc, p) => acc + (DAYS[Math.max(0, p.day - 1)]?.silence ?? 0), 0);
  }, [state.progress]);

  const phaseTimings = state.phaseTimings ?? {};
  const phaseLabels: Record<string, string> = {
    focus: 'Focus', thank: 'Thank', repent: 'Repent',
    invite: 'Invite', ask: 'Ask', declare: 'Declare',
  };
  
  const sorted = useMemo(() =>
    Object.entries(phaseTimings)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]),
    [phaseTimings]
  );
  
  const maxT = sorted[0]?.[1] ?? 1;
  const topPhase = sorted[0] ? (phaseLabels[sorted[0][0]] ?? sorted[0][0]) : '—';

  const reflections = state.reflections ?? [];
  const allText = reflections.map(r => r.q1 + ' ' + r.q2 + ' ' + r.q3).join(' ').toLowerCase();
  const stop = new Set(['the', 'and', 'to', 'a', 'i', 'in', 'of', 'my', 'for', 'is', 'it', 'that', 'this', 'me', 'you', 'with', 'have', 'was', 'on', 'not', 'be', 'we', 'are', 'so', 'but', 'as', 'at', 'by', 'do', 'if', 'or', 'an', 'he', 'she', 'they', 'his', 'her', 'from', 'what', 'when', 'how', 'just', 'more', 'than', 'can', 'get', 'all', 'one', 'would', 'been', 'will', 'had', 'has', 'them', 'then', 'which', 'there', 'their', 'about', 'also', 'into', 'after', 'its', 'our', 'who', 'him', 'did', 'felt', 'feel']);
  const freq: Record<string, number> = {};
  allText.split(/\s+/).forEach(w => {
    const c = w.replace(/[^a-z]/g, '');
    if (c.length > 3 && !stop.has(c)) freq[c] = (freq[c] || 0) + 1;
  });
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);

  const handleReviewDay = (day: number) => {
    const isCompleted = state.progress.some(p => p.day === day && p.completed);
    if (isCompleted) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDay(day);
    }
  };

  const handleShare = async () => {
    if (!selectedDay) return;
    const content = getDayContent(selectedDay);
    
    // Construct the refined share text
    const shareText = `Day ${selectedDay} ${content.title}\n\nTHE TRUTH\n"${content.identity}"\n\nTHE WORD\n${content.verse}\n\nTHE DECLARATION\n${content.declare || ''}`;
    
    try {
      await Share.share({
        message: shareText,
        title: `Day ${selectedDay}: Truth`,
      });
    } catch (error) {
      // Share cancelled or failed
    }
  };

  const selectedContent = selectedDay ? getDayContent(selectedDay) : null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(200,137,74,0.05)', 'transparent']}
        style={styles.ambientTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>SELF-KNOWLEDGE</Text>
                <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
                  Your Prayer{'\n'}
                  <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Insights</Text>
                </Text>
              </View>
              {state.user && (
                <Pressable 
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    signOut();
                  }}
                  style={styles.signOutBtn}
                >
                  <LogOut size={20} color={C.textMuted} />
                </Pressable>
              )}
            </View>
            <View style={styles.rule} />
          </Animated.View>

          <Animated.View style={[styles.grid, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.gridRow}>
              <View style={styles.insCard}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>DAYS COMPLETE</Text>
                <Text style={[styles.insBig, { fontFamily: Fonts.titleLight }]}>{completedDaysCount}</Text>
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic }]}>of 30 days</Text>
              </View>
              <View style={styles.insCard}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>SILENCE THIS MONTH</Text>
                <Text style={[styles.insBig, { fontFamily: Fonts.titleLight }]}>{silenceMins}</Text>
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic }]}>minutes in stillness</Text>
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.insCard}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>THOUGHTS CAPTURED</Text>
                <Text style={[styles.insBig, { fontFamily: Fonts.titleLight }]}>{state.prayerRequests?.length || 0}</Text>
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic }]}>this month</Text>
              </View>
              <View style={styles.insCard}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>PRAYERS ANSWERED</Text>
                <Text style={[styles.insBig, { fontFamily: Fonts.titleLight }]}>{state.answeredPrayers?.length || 0}</Text>
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic }]}>recorded</Text>
              </View>
            </View>

            <View style={styles.insCardWide}>
              <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>WHERE YOU LINGER LONGEST</Text>
              {sorted.length > 0 ? (
                <>
                  {sorted.map(([k, v]) => (
                    <View key={k} style={styles.barRow}>
                      <Text 
                        numberOfLines={1} 
                        style={[styles.barLbl, { fontFamily: Fonts.titleRegular }]}
                      >
                        {phaseLabels[k] ?? k}
                      </Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.round((v / maxT) * 100)}%` }]} />
                      </View>
                      <Text style={[styles.barVal, { fontFamily: Fonts.titleRegular }]}>{Math.round(v / 60)}m</Text>
                    </View>
                  ))}
                  <View style={styles.insightBar}>
                    <Text style={styles.insightIcon}>✨</Text>
                    <Text style={[styles.insightText, { fontFamily: Fonts.italic }]}>
                      You spend the most time in <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{topPhase}</Text> — that&apos;s where your heart is speaking.
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic, paddingTop: 4, fontSize: T.scale(14) }]}>
                  Open phases during prayer to begin tracking.
                </Text>
              )}
            </View>

            <View style={styles.insCardWide}>
              <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>30-DAY JOURNEY (TAP TO REVIEW)</Text>
              <View style={styles.pipWrap}>
                {Array.from({ length: 30 }, (_, i) => {
                  const dayNum = i + 1;
                  const done = state.progress.some(p => p.day === dayNum && p.completed);
                  return (
                    <Pressable 
                      key={i} 
                      onPress={() => handleReviewDay(dayNum)}
                      style={({ pressed }) => [
                        styles.pip, 
                        done && styles.pipDone,
                        pressed && done && { opacity: 0.7, transform: [{ scale: 0.95 }] }
                      ]}
                    >
                      {done && <View style={styles.pipDot} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {topWords.length > 0 && (
              <View style={styles.insCardWide}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>WORDS FROM YOUR REFLECTIONS</Text>
                <View style={styles.wordChips}>
                  {topWords.map(w => (
                    <View key={w} style={styles.wordChip}>
                      <Text style={[styles.wordChipText, { fontFamily: Fonts.italic }]}>{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {reflections.length > 0 && (
              <View style={styles.insCardWide}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>
                  WEEKLY REFLECTIONS · {reflections.length} SAVED
                </Text>
                {reflections.map((r, idx) => (
                  <View key={`ref-${idx}`} style={styles.reflectionItem}>
                    <Text style={[styles.reflectionWeek, { fontFamily: Fonts.titleMedium }]}>
                      Week {r.week} · {r.date}
                    </Text>
                    <Text style={[styles.reflectionAns, { fontFamily: Fonts.italic }]}>
                      {r.q1 || '—'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={!!selectedDay}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedDay(null)} />
          <Animated.View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalDayLabel, { fontFamily: Fonts.titleBold }]}>DAY {selectedDay}</Text>
                <Text style={[styles.modalTitle, { fontFamily: Fonts.serifMedium }]}>
                  {selectedContent?.title}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedDay(null)} style={styles.closeBtn}>
                <X size={20} color={C.textMuted} />
              </Pressable>
            </View>

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.reviewSection}>
                <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>THE TRUTH</Text>
                <Text style={[styles.truthText, { fontFamily: Fonts.italic }]}>
                  "{selectedContent?.identity || selectedContent?.triad.find(t => t.label === 'Declare')?.text}"
                </Text>
              </View>

              <View style={styles.reviewSection}>
                <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>THE WORD</Text>
                <Text style={[styles.verseText, { fontFamily: Fonts.serifRegular }]}>
                  {selectedContent?.verse}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

              <View style={styles.reviewSection}>
                <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>SETTLE</Text>
                <Text style={[styles.fullText, { fontFamily: Fonts.serifRegular }]}>{selectedContent?.settle}</Text>
              </View>

              <View style={styles.reviewSection}>
                <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>FOCUS</Text>
                <Text style={[styles.fullText, { fontFamily: Fonts.serifRegular }]}>{selectedContent?.teach}</Text>
              </View>

              {selectedContent?.triad.map((t, idx) => (
                <View key={idx} style={styles.reviewSection}>
                  <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>{(t.label || 'PROMPT').toUpperCase()}</Text>
                  <Text style={[styles.fullText, { fontFamily: Fonts.serifRegular }]}>{t.text}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <AnimatedPressable 
                onPress={handleShare}
                style={styles.shareBtn}
                scaleValue={0.96}
              >
                <LinearGradient
                  colors={[C.accent, C.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareBtnGradient}
                >
                  <Share2 size={18} color="#FFF" />
                  <Text style={[styles.shareBtnText, { fontFamily: Fonts.titleMedium }]}>SHARE TRUTH</Text>
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
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
  ambientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 0,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 120,
  },
  eyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.scale(36),
    lineHeight: 40,
    color: C.text,
    marginTop: 10,
    marginBottom: 14,
  },
  rule: {
    opacity: 0.55,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  signOutBtn: {
    padding: 8,
    marginTop: 10,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  insCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  insCardWide: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  insLbl: {
    fontSize: T.scale(8),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.6)',
    marginBottom: 10,
  },
  insBig: {
    fontSize: T.scale(46),
    letterSpacing: -1,
    lineHeight: 46,
    color: C.text,
  },
  insUnit: {
    fontSize: T.scale(13),
    color: C.textSecondary,
    marginTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 9,
  },
  barLbl: {
    fontSize: T.scale(9),
    letterSpacing: 0.5,
    color: C.textSecondary,
    width: 60,
  },
  barTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(200,137,74,0.09)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  barVal: {
    fontSize: T.scale(9),
    color: 'rgba(200,137,74,0.7)',
    width: 25,
    textAlign: 'right' as const,
  },
  insightBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  insightIcon: {
    fontSize: T.scale(16),
  },
  insightText: {
    flex: 1,
    fontSize: T.scale(14),
    lineHeight: 22,
    color: C.textSecondary,
  },
  pipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipDone: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  pipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  wordChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 4,
  },
  wordChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    borderRadius: 100,
  },
  wordChipText: {
    fontSize: T.scale(13),
    color: C.accentDark,
  },
  reflectionItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  reflectionWeek: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 6,
  },
  reflectionAns: {
    fontSize: T.scale(15),
    lineHeight: 26,
    color: C.textSecondary,
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
});
