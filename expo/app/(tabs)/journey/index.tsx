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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Share2, LogOut, Bell, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { DAYS, getDayContent } from '@/mocks/content';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import StreakHeatMapCard from '@/components/StreakHeatMapCard';
import { getFeatureRequirement } from '@/services/entitlements';

const getDateString = (date: Date = new Date()): string => {
  return date.toISOString().split('T')[0];
};

function getDayDifference(fromDateString: string, toDateString: string): number {
  const from = new Date(fromDateString + 'T00:00:00').getTime();
  const to = new Date(toDateString + 'T00:00:00').getTime();
  const diff = to - from;
  return Math.floor(diff / 86400000);
}

export default function InsightsScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const { state, signOut, hasFeature, scheduleNeglectedPhaseReminder } = useApp();
  const [reminderScheduled, setReminderScheduled] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  
  const [lockVisible, setLockVisible] = useState(false);
  const [lockFeature, setLockFeature] = useState({ name: '', req: '' });
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
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

  const phaseLabels: Record<string, string> = {
    settle: 'Settle',
    focus: 'Focus',
    thank: 'Thank',
    repent: 'Repent',
    invite: 'Invite',
    ask: 'Ask',
    declare: 'Declare',
    selah: 'Selah',
    act: 'Live It',
    verse: 'Verse',
  };

  // TRIAD phases in fixed order so the bars literally spell T-R-I-A-D
  const TRIAD_ORDER: { key: string; letter: string; label: string; sub: string }[] = [
    { key: 'thank', letter: 'T', label: 'Thank', sub: 'gratitude' },
    { key: 'repent', letter: 'R', label: 'Repent', sub: 'honesty' },
    { key: 'invite', letter: 'I', label: 'Invite', sub: 'presence' },
    { key: 'ask', letter: 'A', label: 'Ask', sub: 'requests' },
    { key: 'declare', letter: 'D', label: 'Declare', sub: 'identity' },
  ];

  const triadTimings = useMemo(() => {
    const t = state.phaseTimings ?? {};
    return TRIAD_ORDER.map(p => ({ ...p, seconds: Math.max(0, t[p.key] ?? 0) }));
  }, [state.phaseTimings]);

  const triadTotal = triadTimings.reduce((a, b) => a + b.seconds, 0);
  const triadMax = Math.max(1, ...triadTimings.map(t => t.seconds));
  const sortedTriad = [...triadTimings].sort((a, b) => b.seconds - a.seconds);
  const topTriad = sortedTriad[0];
  const leastTriad = [...triadTimings].filter(t => t.seconds < topTriad.seconds).sort((a, b) => a.seconds - b.seconds)[0] ?? sortedTriad[sortedTriad.length - 1];
  const phasesPracticed = triadTimings.filter(t => t.seconds > 0).length;

  // Per-phase weekly heatmap: last 7 days x 5 TRIAD phases.
  const weekHeatmap = useMemo(() => {
    const today = new Date();
    const days: { date: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const date = d.toISOString().split('T')[0];
      const label = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
      days.push({ date, label });
    }
    const log = state.phaseLog ?? [];
    const cells: Record<string, Record<string, number>> = {};
    for (const e of log) {
      if (!cells[e.phase]) cells[e.phase] = {};
      cells[e.phase][e.date] = (cells[e.phase][e.date] ?? 0) + e.seconds;
    }
    let maxCell = 1;
    for (const p of TRIAD_ORDER) {
      for (const d of days) {
        const v = cells[p.key]?.[d.date] ?? 0;
        if (v > maxCell) maxCell = v;
      }
    }
    return { days, cells, maxCell };
  }, [state.phaseLog]);

  // Detect a neglected TRIAD phase based on the last 14 days of phaseLog.
  // A phase counts as neglected when it has the lowest seconds AND the user has
  // practiced at least one phase. If everything is zero, hide the card.
  const neglected = useMemo(() => {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const recent = (state.phaseLog ?? []).filter(e => e.date >= cutoff);
    if (recent.length === 0) return null;
    const totals: Record<string, number> = {};
    for (const p of TRIAD_ORDER) totals[p.key] = 0;
    for (const e of recent) {
      if (totals[e.phase] !== undefined) totals[e.phase] += e.seconds;
    }
    const sorted = TRIAD_ORDER
      .map(p => ({ ...p, seconds: totals[p.key] }))
      .sort((a, b) => a.seconds - b.seconds);
    const least = sorted[0];
    const top = sorted[sorted.length - 1];
    if (top.seconds === 0) return null;
    // Only flag if there's a meaningful gap (least is < 25% of the top phase).
    if (least.seconds >= top.seconds * 0.25 && least.seconds > 0) return null;
    return least;
  }, []);

  const handleScheduleNeglectedReminder = async () => {
    if (!neglected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await scheduleNeglectedPhaseReminder(neglected.label);
    if (ok) {
      setReminderScheduled(neglected.key);
    }
  };

  // Balance score: how evenly distributed time is across all 5 phases (0–100)
  const balanceScore = useMemo(() => {
    if (triadTotal === 0) return 0;
    const ideal = triadTotal / 5;
    const totalDeviation = triadTimings.reduce((acc, t) => acc + Math.abs(t.seconds - ideal), 0);
    // Max possible deviation is ~ 2 * triadTotal * (4/5) when all time is in one phase
    const maxDeviation = 2 * triadTotal * 0.8;
    const score = 100 - Math.round((totalDeviation / maxDeviation) * 100);
    return Math.max(0, Math.min(100, score));
  }, [triadTimings, triadTotal]);

  const balanceLabel = balanceScore >= 75 ? 'Well-rounded' : balanceScore >= 50 ? 'Finding rhythm' : balanceScore >= 25 ? 'Lopsided' : 'Just starting';

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
    const progressItem = state.progress.find(p => p.day === day && p.completed);
    if (progressItem) {
      // History gating
      if (progressItem.completedAt) {
        const diff = getDayDifference(progressItem.completedAt, getDateString());
        const maxDays = hasFeature('SESSION_HISTORY') as number;
        
        if (diff > maxDays) {
          setLockFeature({ 
            name: `Reviewing Day ${day}`, 
            req: getFeatureRequirement('SESSION_HISTORY' as any) 
          });
          setLockVisible(true);
          return;
        }
      }
      
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDay(day);
    }
  };

  const handleShare = async () => {
    if (!selectedDay) return;
    const content = getDayContent(selectedDay);

    const shareText = `Day ${selectedDay} ${content.title}\n\nTHE TRUTH\n"${content.identity}"\n\nTHE WORD\n${content.verse}\n\nTHE DECLARATION\n${content.declare || 'I am a beloved child of God.'}\n\n— TRIAD Prayer`;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Web: use Web Share API if available, else clipboard fallback
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: `Day ${selectedDay}: Truth`, text: shareText });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(shareText);
          Alert.alert('Copied', "The Truth has been copied to your clipboard.");
          return;
        }
        Alert.alert('Sharing unavailable', 'Your browser does not support sharing. Please try on the mobile app.');
      } catch (error) {
        if (__DEV__) console.log('[Share] web error:', error);
      }
      return;
    }

    // Native text share
    try {
      await Share.share({
        message: shareText,
        title: `Day ${selectedDay}: Truth`,
      });
    } catch (error) {
      if (__DEV__) console.log('[Share] text share error:', error);
      Alert.alert('Sharing failed', 'We could not open the share sheet. Please try again.');
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
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
                    void signOut();
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
              <View style={styles.triadHeaderRow}>
                <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold, marginBottom: 0 }]}>YOUR TRIAD BALANCE</Text>
                {triadTotal > 0 && (
                  <View style={styles.balancePill}>
                    <Text style={[styles.balancePillText, { fontFamily: Fonts.titleSemiBold }]}>{balanceScore}</Text>
                    <Text style={[styles.balancePillUnit, { fontFamily: Fonts.titleRegular }]}>/100</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.triadCaption, { fontFamily: Fonts.italic }]}>
                Where your prayer time lives across the five phases.
              </Text>

              {triadTimings.map((p) => {
                const pct = triadTotal > 0 ? Math.round((p.seconds / triadMax) * 100) : 0;
                const mins = Math.floor(p.seconds / 60);
                const secs = Math.round(p.seconds % 60);
                const isEmpty = p.seconds === 0;
                return (
                  <View key={p.key} style={styles.triadRow}>
                    <View style={[styles.triadLetter, isEmpty && styles.triadLetterEmpty]}>
                      <Text style={[styles.triadLetterText, { fontFamily: Fonts.titleBold }, isEmpty && styles.triadLetterTextEmpty]}>{p.letter}</Text>
                    </View>
                    <View style={styles.triadMid}>
                      <View style={styles.triadLabelRow}>
                        <Text style={[styles.triadName, { fontFamily: Fonts.titleSemiBold }, isEmpty && { color: C.textMuted }]}>{p.label}</Text>
                        <Text style={[styles.triadSub, { fontFamily: Fonts.italic }]}>· {p.sub}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%` }, isEmpty && { backgroundColor: 'rgba(200,137,74,0.15)' }]} />
                      </View>
                    </View>
                    <Text style={[styles.triadVal, { fontFamily: Fonts.titleRegular }, isEmpty && { color: C.textMuted }]}>
                      {mins > 0 ? `${mins}m` : p.seconds > 0 ? `${secs}s` : '—'}
                    </Text>
                  </View>
                );
              })}

              {triadTotal > 0 ? (
                <View style={styles.insightBar}>
                  <Text style={styles.insightIcon}>✨</Text>
                  <Text style={[styles.insightText, { fontFamily: Fonts.italic }]}>
                    {phasesPracticed < 5 ? (
                      <>
                        You&apos;ve leaned into <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{topTriad.label}</Text>. Try lingering in <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{leastTriad.label}</Text> next — that&apos;s where the framework opens up.
                      </>
                    ) : (
                      <>
                        <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{balanceLabel}</Text> — strongest in <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{topTriad.label}</Text>, lightest in <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{leastTriad.label}</Text>.
                      </>
                    )}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.insUnit, { fontFamily: Fonts.italic, paddingTop: 8, fontSize: T.scale(14) }]}>
                  Open the TRIAD phases during prayer to begin tracking your balance.
                </Text>
              )}
            </View>

            {/* Per-phase weekly heatmap, anchored to TRIAD letters */}
            <View style={styles.insCardWide}>
              <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold }]}>TRIAD HEATMAP · LAST 7 DAYS</Text>
              <Text style={[styles.triadCaption, { fontFamily: Fonts.italic }]}>
                Where each phase shows up, day by day.
              </Text>
              <View style={styles.heatHeaderRow}>
                <View style={styles.heatLetterCol} />
                {weekHeatmap.days.map((d, i) => (
                  <Text key={`hd-${i}`} style={[styles.heatColLabel, { fontFamily: Fonts.titleMedium }]}>{d.label}</Text>
                ))}
              </View>
              {TRIAD_ORDER.map((p) => (
                <View key={`hr-${p.key}`} style={styles.heatRow}>
                  <View style={styles.heatLetterCol}>
                    <View style={styles.heatLetter}>
                      <Text style={[styles.heatLetterText, { fontFamily: Fonts.titleBold }]}>{p.letter}</Text>
                    </View>
                  </View>
                  {weekHeatmap.days.map((d) => {
                    const v = weekHeatmap.cells[p.key]?.[d.date] ?? 0;
                    const intensity = v === 0 ? 0 : Math.max(0.18, Math.min(1, v / weekHeatmap.maxCell));
                    return (
                      <View
                        key={`hc-${p.key}-${d.date}`}
                        style={[
                          styles.heatCell,
                          v === 0
                            ? { backgroundColor: 'rgba(200,137,74,0.06)', borderColor: C.borderLight }
                            : { backgroundColor: `rgba(200,137,74,${intensity})`, borderColor: 'transparent' },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
              <View style={styles.heatLegend}>
                <Text style={[styles.heatLegendText, { fontFamily: Fonts.italic }]}>less</Text>
                {[0.18, 0.4, 0.65, 0.9].map((a, i) => (
                  <View key={`lg-${i}`} style={[styles.heatLegendDot, { backgroundColor: `rgba(200,137,74,${a})` }]} />
                ))}
                <Text style={[styles.heatLegendText, { fontFamily: Fonts.italic }]}>more</Text>
              </View>
            </View>

            {/* Neglected phase reminder — TRIAD-anchored nudge */}
            {neglected && (
              <View style={styles.insCardWide}>
                <View style={styles.neglectedHeaderRow}>
                  <View style={[styles.triadLetter, { width: 32, height: 32, borderRadius: 10 }]}>
                    <Text style={[styles.triadLetterText, { fontFamily: Fonts.titleBold, fontSize: T.scale(15) }]}>{neglected.letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.insLbl, { fontFamily: Fonts.titleSemiBold, marginBottom: 2 }]}>NEGLECTED PHASE</Text>
                    <Text style={[styles.neglectedTitle, { fontFamily: Fonts.serifMedium }]}>
                      {neglected.label}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.neglectedBody, { fontFamily: Fonts.italic }]}>
                  You’ve been light on <Text style={{ color: C.accentDark, fontFamily: Fonts.serifSemiBold }}>{neglected.label}</Text> over the last two weeks. The framework opens up when every letter is practiced — even briefly.
                </Text>
                <AnimatedPressable
                  onPress={handleScheduleNeglectedReminder}
                  style={[styles.neglectedBtn, reminderScheduled === neglected.key && styles.neglectedBtnDone]}
                  scaleValue={0.97}
                  disabled={reminderScheduled === neglected.key}
                >
                  {reminderScheduled === neglected.key ? (
                    <>
                      <Check size={16} color={C.accentDark} />
                      <Text style={[styles.neglectedBtnText, { fontFamily: Fonts.titleMedium, color: C.accentDark }]}>
                        REMINDER SET FOR TOMORROW
                      </Text>
                    </>
                  ) : (
                    <>
                      <Bell size={16} color={C.accentDark} />
                      <Text style={[styles.neglectedBtnText, { fontFamily: Fonts.titleMedium, color: C.accentDark }]}>
                        REMIND ME TO LINGER IN {neglected.label.toUpperCase()}
                      </Text>
                    </>
                  )}
                </AnimatedPressable>
              </View>
            )}

            <StreakHeatMapCard />

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
                  &quot;{selectedContent?.identity || selectedContent?.triad.find(t => t.label === 'Declare')?.text}&quot;
                </Text>
              </View>

              <View style={styles.reviewSection}>
                <Text style={[styles.sectionLbl, { fontFamily: Fonts.titleSemiBold }]}>THE WORD</Text>
                <Text style={[styles.verseText, { fontFamily: Fonts.italic }]}>
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
                  <Text style={[styles.fullText, { fontFamily: Fonts.italic }]}>{t.text}</Text>
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

      <FeatureLockSheet
        visible={lockVisible}
        onClose={() => setLockVisible(false)}
        featureName={lockFeature.name}
        requirement={lockFeature.req}
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
    fontSize: T.scale(11),
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
    fontSize: T.scale(10),
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.6)',
    marginBottom: 10,
  },
  insBig: {
    fontSize: T.scale(42),
    letterSpacing: -1,
    lineHeight: T.scale(54),
    color: C.text,
    includeFontPadding: false as const,
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
    fontSize: T.scale(11),
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
    fontSize: T.scale(11),
    color: 'rgba(200,137,74,0.7)',
    width: 25,
    textAlign: 'right' as const,
  },
  triadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  triadCaption: {
    fontSize: T.scale(13),
    color: C.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.25)',
  },
  balancePillText: {
    fontSize: T.scale(13),
    color: C.accentDark,
    letterSpacing: 0.3,
  },
  balancePillUnit: {
    fontSize: T.scale(10),
    color: C.accent,
    opacity: 0.7,
    marginLeft: 1,
  },
  triadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  triadLetter: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
  },
  triadLetterEmpty: {
    backgroundColor: 'transparent',
    borderColor: C.borderLight,
  },
  triadLetterText: {
    fontSize: T.scale(13),
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  triadLetterTextEmpty: {
    color: C.textMuted,
  },
  triadMid: {
    flex: 1,
    gap: 5,
  },
  triadLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  triadName: {
    fontSize: T.scale(13),
    color: C.text,
    letterSpacing: 0.3,
  },
  triadSub: {
    fontSize: T.scale(11),
    color: C.textMuted,
  },
  triadVal: {
    fontSize: T.scale(12),
    color: C.accentDark,
    width: 36,
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
    fontSize: T.scale(11),
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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
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
    fontSize: T.scale(11),
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
    fontSize: T.scale(11),
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
  heatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 4,
  },
  heatLetterCol: {
    width: 32,
    alignItems: 'center',
  },
  heatColLabel: {
    flex: 1,
    textAlign: 'center' as const,
    fontSize: T.scale(10),
    letterSpacing: 1,
    color: C.textMuted,
  },
  heatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  heatLetter: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
  },
  heatLetterText: {
    fontSize: T.scale(11),
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  heatCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 28,
    marginHorizontal: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
  },
  heatLegendText: {
    fontSize: T.scale(11),
    color: C.textMuted,
    marginHorizontal: 2,
  },
  heatLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  neglectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  neglectedTitle: {
    fontSize: T.scale(20),
    color: C.text,
  },
  neglectedBody: {
    fontSize: T.scale(14),
    lineHeight: 22,
    color: C.textSecondary,
    marginBottom: 14,
  },
  neglectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
  },
  neglectedBtnDone: {
    opacity: 0.85,
  },
  neglectedBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 1.2,
  },
});
