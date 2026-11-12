import React, { useEffect, useMemo, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { X, Share2, ChevronDown, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useApp } from '@/providers/AppProvider';
import { prayerDayKey } from '@/lib/prayerDay';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';

import { Fonts } from '@/constants/fonts';
import { getDayContent, getDeclarationText } from '@/mocks/content';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { getFeatureRequirement } from '@/services/entitlements';

// TRIAD phases in fixed order so the bars literally spell T-R-I-A-D.
// Module scope, not component scope: it never changes, and a per-render
// array would defeat the memo deps that reference it.
const TRIAD_ORDER: { key: string; letter: string; label: string; sub: string }[] = [
  { key: 'thank', letter: 'T', label: 'Thank', sub: 'gratitude' },
  { key: 'repent', letter: 'R', label: 'Repent', sub: 'honesty' },
  { key: 'invite', letter: 'I', label: 'Invite', sub: 'presence' },
  { key: 'ask', letter: 'A', label: 'Ask', sub: 'requests' },
  { key: 'declare', letter: 'D', label: 'Declare', sub: 'identity' },
];

const getDateString = (date: Date = new Date()): string => {
  return prayerDayKey(date);
};

function getDayDifference(fromDateString: string, toDateString: string): number {
  // completedAt is stored as a full ISO timestamp ("2026-10-24T15:30:00.000Z").
  // Appending 'T00:00:00' to that produced an Invalid Date, diff NaN, and
  // `NaN > maxDays` always false — so the free-tier history gate never
  // fired. Normalize to the calendar-date part first; date-only strings
  // pass through unchanged.
  const normalize = (s: string): string => (s.includes('T') ? s.split('T')[0] : s);
  const from = new Date(normalize(fromDateString) + 'T00:00:00').getTime();
  const to = new Date(normalize(toDateString) + 'T00:00:00').getTime();
  const diff = to - from;
  return Math.floor(diff / 86400000);
}

/**
 * Your Journey (findings 64b / 73) — the old Insights tab, cut down from
 * 11 sections to 4 and moved inside Profile. In order: 30-Day Journey,
 * Remember His Faithfulness, Your Prayer Rhythm, A Moment to Reflect.
 *
 * Theological core: prayer is not a productivity metric. No score pill,
 * no judgment labels, no streak grid, no "even phases = healthy" grading,
 * no analytics to fill empty space. Cut outright: Silence Planned, the
 * 7-day heatmap, the neglected-phase reminder, the 10-week streak grid.
 * "Connection with God" lives here no longer (a Journal reflection
 * prompt for it follows separately and is NOT built here).
 *
 * This view renders content only — the host screen (Profile) owns the
 * scroll and the "Your Journey" section header.
 *
 * Type rule (findings 10 / 65 / 68): sans caps for labels/buttons, serif
 * for body/titles, sans for numbers. One voice per sentence (finding 66):
 * accent words are distinguished by weight and color only, never by
 * family.
 */
export default function InsightsView() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const { state, hasFeature } = useApp();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [lockVisible, setLockVisible] = useState(false);
  const [lockFeature, setLockFeature] = useState({ name: '', req: '' });
  const [rhythmOpen, setRhythmOpen] = useState(false);

  const fadeAnim = useState(() => new Animated.Value(0))[0]
  const slideAnim = useState(() => new Animated.Value(20))[0]

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const completedDaysCount = state.progress.filter(p => p.completed).length;

  const triadTimings = useMemo(() => {
    const t = state.phaseTimings ?? {};
    return TRIAD_ORDER.map(p => ({ ...p, seconds: Math.max(0, t[p.key] ?? 0) }));
  }, [state.phaseTimings]);

  const triadTotal = triadTimings.reduce((a, b) => a + b.seconds, 0);
  const triadMax = Math.max(1, ...triadTimings.map(t => t.seconds));
  const sortedTriad = [...triadTimings].sort((a, b) => b.seconds - a.seconds);
  const topTriad = sortedTriad[0];
  const leastTriad = [...triadTimings].filter(t => t.seconds < topTriad.seconds).sort((a, b) => a.seconds - b.seconds)[0] ?? sortedTriad[sortedTriad.length - 1];

  const answeredCount = state.answeredPrayers?.length ?? 0;
  const openRequests = (state.prayerRequests ?? []).filter(r => !r.isAnswered);

  // One observation, one voice (finding 66): a single serif sentence,
  // accent words in serif semibold + accent color — weight and color
  // only, never a family switch. An observation, not a grade: nothing
  // here says a phase is neglected, deficient, or owed equal time.
  const rhythmObservation: React.ReactNode = triadTotal === 0 ? (
    <>Pray through a day and your rhythm will take shape here.</>
  ) : triadTimings.filter(t => t.seconds > 0).length === 1 ? (
    <>
      So far your prayer has lived in <Text style={styles.rhythmAccent}>{topTriad.label}</Text>. The other phases are here whenever you want them.
    </>
  ) : topTriad.seconds === leastTriad.seconds ? (
    <>Your time has been shared across the phases so far.</>
  ) : (
    <>
      Your time so far has leaned toward <Text style={styles.rhythmAccent}>{topTriad.label}</Text>, with the least time in <Text style={styles.rhythmAccent}>{leastTriad.label}</Text>.
    </>
  );

  // PL-H4 (round-3 A-M3): the detail display is a disclosure surface
  // too — render the day-verse through the same marking as the share
  // path (REF (excerpt) — TEXT; shapeless lines stay unmarked).
  const formatVerseForDisplay = (verse: string | undefined): string => {
    if (!verse) return '';
    const idx = verse.indexOf(' — ');
    if (idx <= 0) return verse;
    return `${verse.slice(0, idx)} (excerpt) — ${verse.slice(idx + 3)}`;
  };

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

    // PL-H4 ruling (Kai, 2026-10-25, settled): day-verse lines are
    // paraphrase/fragments WITH DISCLOSURE — not WEB-aligned, no verse
    // rewording, no audio re-bake. Shared text carries the same
    // "(excerpt)" marker the session screen renders after the citation
    // ref (REF (excerpt) — TEXT); lines without the 'REF — TEXT' shape
    // stay unmarked, exactly as in-session. Citations unchanged.
    const formatVerseForShare = (verse: string | undefined): string => {
      if (!verse) return '';
      const idx = verse.indexOf(' — ');
      if (idx <= 0) return verse;
      return `${verse.slice(0, idx)} (excerpt) — ${verse.slice(idx + 3)}`;
    };
    const shareText = `Day ${selectedDay} ${content.title}\n\nTHE TRUTH\n"${content.identity}"\n\nTHE WORD\n${formatVerseForShare(content.verse)}\n\nTHE DECLARATION\n${getDeclarationText(content)}\n\nShared from TRIAD Prayer\nGet the app: https://apps.apple.com/app/id6767898619`;

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

  const openJournal = (tab: 'answered' | 'reflect') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/journal', params: { tab } });
  };

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]} testID="your-journey">
      {/* (1) 30-Day Journey — Days Complete merged with the tappable pips.
          Finding 70: "30-Day Journey" title with "Tap to review" as a
          sub, not a shouting caps label. Streak is one gentle line at
          most — no grid, no longest streak, no competition. */}
      <View style={styles.section} testID="journey-days">
        <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>30-Day Journey</Text>
        <Text style={[styles.journeyCount, { fontFamily: Fonts.titleMedium }]}>
          <Text style={{ fontFamily: Fonts.titleBold }}>{completedDaysCount}</Text> of 30 days
        </Text>
        {completedDaysCount > 0 && (
          <Text style={[styles.sectionSub, { fontFamily: Fonts.titleRegular }]}>
            You&apos;ve made time for prayer on {completedDaysCount} {completedDaysCount === 1 ? 'day' : 'days'}.
          </Text>
        )}
        <View style={styles.pipWrap}>
          {Array.from({ length: 30 }, (_, i) => {
            const dayNum = i + 1;
            const done = state.progress.some(p => p.day === dayNum && p.completed);
            return (
              <Pressable
                key={i}
                onPress={() => handleReviewDay(dayNum)}
                hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                accessibilityLabel={done ? `Day ${dayNum}, completed. Tap to review` : `Day ${dayNum}`}
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
        {completedDaysCount > 0 && (
          <Text style={[styles.sectionSub, { fontFamily: Fonts.titleRegular }]}>Tap a finished day to revisit it.</Text>
        )}
      </View>

      {/* (2) Remember His Faithfulness — Prayers Answered (tappable to
          testimonies) + the requests still being carried, count secondary. */}
      <View style={styles.section} testID="journey-faithfulness">
        <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Remember His Faithfulness</Text>
        <Pressable
          onPress={() => openJournal('answered')}
          style={styles.faithRow}
          testID="journey-answered-link"
        >
          <View style={styles.faithCopy}>
            <Text style={[styles.faithTitle, { fontFamily: Fonts.serifMedium }]}>Prayers answered</Text>
            <Text style={[styles.faithSub, { fontFamily: Fonts.titleRegular }]}>
              {answeredCount === 0
                ? 'Nothing recorded yet. Tap to see your testimonies.'
                : 'Tap to revisit your testimonies.'}
            </Text>
          </View>
          <Text style={[styles.faithNumber, { fontFamily: Fonts.titleSemiBold }]}>{answeredCount}</Text>
          <ChevronRight size={16} color={C.chevronMuted} />
        </Pressable>
        <Pressable
          onPress={() => openJournal('answered')}
          style={styles.faithRow}
          testID="journey-requests-link"
        >
          <View style={styles.faithCopy}>
            <Text style={[styles.faithTitle, { fontFamily: Fonts.serifMedium }]}>Your prayer requests</Text>
            <Text style={[styles.faithSub, { fontFamily: Fonts.titleRegular }]}>
              {openRequests.length === 0
                ? 'Nothing you are still carrying. Tap to add one.'
                : `${openRequests.length} ${openRequests.length === 1 ? 'request' : 'requests'} still being carried. Tap to see them.`}
            </Text>
          </View>
          <ChevronRight size={16} color={C.chevronMuted} />
        </Pressable>
      </View>

      {/* (3) Your Prayer Rhythm — ONE observation + an optional expandable
          phase breakdown. No score pill, no judgment labels. */}
      <View style={styles.section} testID="journey-rhythm">
        <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Your Prayer Rhythm</Text>
        <Text style={[styles.rhythmText, { fontFamily: Fonts.serifRegular }]}>
          {rhythmObservation}
        </Text>
        {triadTotal > 0 && (
          <>
            <Pressable
              onPress={() => setRhythmOpen(v => !v)}
              style={styles.rhythmToggle}
              testID="journey-rhythm-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: rhythmOpen }}
            >
              <Text style={[styles.rhythmToggleText, { fontFamily: Fonts.titleSemiBold }]}>
                {rhythmOpen ? 'HIDE THE BREAKDOWN' : 'SEE THE PHASE BREAKDOWN'}
              </Text>
              <ChevronDown
                size={16}
                color={C.accentDark}
                style={{ transform: [{ rotate: rhythmOpen ? '180deg' : '0deg' }] }}
              />
            </Pressable>
            {rhythmOpen && (
              <View style={styles.triadBreakdown}>
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
                          <Text style={[styles.triadName, { fontFamily: Fonts.titleSemiBold }, isEmpty && { color: C.textSecondary }]}>{p.label}</Text>
                          <Text style={[styles.triadSub, { fontFamily: Fonts.titleRegular }]}>· {p.sub}</Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${pct}%` }, isEmpty && { backgroundColor: 'rgba(200,137,74,0.15)' }]} />
                        </View>
                      </View>
                      <Text style={[styles.triadVal, { fontFamily: Fonts.titleRegular }, isEmpty && { color: C.textSecondary }]}>
                        {mins > 0 ? `${mins}m` : p.seconds > 0 ? `${secs}s` : '0m'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>

      {/* (4) A Moment to Reflect — a journal prompt, nothing more. */}
      <View style={styles.section} testID="journey-reflect">
        <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>A Moment to Reflect</Text>
        <Text style={[styles.reflectPrompt, { fontFamily: Fonts.serifRegular }]}>
          What has God been showing you in prayer lately?
        </Text>
        <Pressable
          onPress={() => openJournal('reflect')}
          style={styles.reflectBtn}
          testID="journey-reflect-link"
        >
          <Text style={[styles.reflectBtnText, { fontFamily: Fonts.titleSemiBold }]}>WRITE A REFLECTION</Text>
        </Pressable>
      </View>

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
                  {formatVerseForDisplay(selectedContent?.verse)}
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
    </Animated.View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  root: {
    gap: 28,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  sectionSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  journeyCount: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
  faithRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    backgroundColor: C.surface,
  },
  faithCopy: {
    flex: 1,
    gap: 4,
  },
  faithTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  faithSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  faithNumber: {
    fontSize: T.size.number,
    lineHeight: T.leading.number,
    color: C.accentDark,
  },
  rhythmText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
  },
  rhythmAccent: {
    fontFamily: Fonts.serifSemiBold,
    color: C.accentDark,
  },
  rhythmToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  rhythmToggleText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.2,
    color: C.accentDark,
  },
  triadBreakdown: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    backgroundColor: C.surface,
    gap: 4,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  triadLetterTextEmpty: {
    color: C.textSecondary,
  },
  triadMid: {
    flex: 1,
    gap: 4,
  },
  triadLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  triadName: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    letterSpacing: 0.3,
  },
  triadSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
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
  triadVal: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    width: 36,
    textAlign: 'right' as const,
  },
  reflectPrompt: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
  },
  reflectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  reflectBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.2,
    color: C.accentDark,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.textSecondary,
  },
  truthText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    textAlign: 'left',
  },
  verseText: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  shareBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: '#FFF',
    letterSpacing: 1.2,
  },
  fullText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
});
