import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Plus, Share2, ChevronRight } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import { DatabaseService } from '@/lib/database';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import CelebrationParticles from '@/components/CelebrationParticles';
import GlowButton from '@/components/GlowButton';
import WordCloud from '@/components/WordCloud';
import AnimatedPressable from '@/components/AnimatedPressable';
import { CHECKLIST_ITEMS } from '@/mocks/checklist';
import AnsweredPrayerShareModal from '@/components/AnsweredPrayerShareModal';
import WallGuidelinesSheet from '@/components/WallGuidelinesSheet';
import { getSafeSession } from '@/lib/supabase';
import type { AnsweredPrayer } from '@/types';

type JournalTab = 'reflect' | 'answered';

/**
 * Journal tab — strictly private. Reflect (weekly reflections) and
 * Answered (stones of remembrance). The old Insights tab is gone
 * (findings 64/64b, 73): Your Journey lives inside Profile now.
 * Community content lives in the Community tab.
 */
// Audit round 3, J-S23: local entries carry a locale date string while
// synced entries carry raw ISO created_at, so one screen showed two date
// formats. Normalize at render: ISO parses to the locale date, anything
// else passes through untouched.
function formatJournalDate(raw: string): string {
  if (!raw) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString();
}

export default function JournalScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: JournalTab =
    params.tab === 'answered' ? params.tab : 'reflect';
  const [activeTab, setActiveTab] = useState<JournalTab>(initialTab);

  // Deep links (e.g. Home recap cards) can land on a specific sub-tab.
  useEffect(() => {
    if (params.tab === 'answered') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  const { state, isLoading, addPrayerRequest, markPrayerAnswered, deletePrayerRequest, retryTestimonyShare, stateLoadError, syncFailed, reloadState } = useApp();
  const [sharingPrayer, setSharingPrayer] = useState<AnsweredPrayer | null>(null);
  const [newPrayer, setNewPrayer] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [shareTestimony, setShareTestimony] = useState(false);
  // Fix-everything G1: journal testimony share is a wall-write
  // path too, so it gets the same quiet guidelines link as the
  // community composer (shown only once sharing is toggled on).
  const [guidelinesVisible, setGuidelinesVisible] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCloud, setShowCloud] = useState(false);

  const headerFadeAnim = useState(() => new Animated.Value(0))[0]
  const headerSlideAnim = useState(() => new Animated.Value(12))[0]
  const tabFadeAnim = useState(() => new Animated.Value(0))[0]
  const tabSlideAnim = useState(() => new Animated.Value(16))[0]
  const contentFadeAnim = useState(() => new Animated.Value(0))[0]
  const contentSlideAnim = useState(() => new Animated.Value(16))[0]

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
        Animated.timing(tabFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(tabSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [contentFadeAnim, contentSlideAnim, headerFadeAnim, headerSlideAnim, tabFadeAnim, tabSlideAnim]);

  const reflections = state.reflections ?? [];
  const prayerRequests = state.prayerRequests?.filter(r => !r.isAnswered) ?? [];
  const answeredPrayers = state.answeredPrayers ?? [];
  const checklistCompletedCount = state.firstStepsCompletedIds?.length ?? 0;

  const handleAddPrayer = () => {
    if (!newPrayer.trim()) return;
    addPrayerRequest(newPrayer.trim());
    setNewPrayer('');
    setIsAdding(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMarkAnswered = async () => {
    if (!answeringId || !answerText.trim()) return;

    // Guest sessions stay local-only — a testimony needs a verified identity.
    // Be honest about it instead of silently dropping the share.
    if (shareTestimony) {
      const session = await getSafeSession();
      if (!session?.user || session.user.is_anonymous === true) {
        Alert.alert(
          'Sign in to share',
          'Your answered prayer is saved here. Make a free account to share your story on the wall.',
          [
            { text: 'Save privately', style: 'cancel', onPress: () => finishMarkAnswered() },
            { text: 'Sign In', onPress: () => router.push('/auth') },
          ],
        );
        return;
      }
      // Audit round 4, AUTH-1: the journal share path used to check only
      // non-anonymous and skip the wall-write age gate entirely. It now
      // goes through the same gate the community screen uses (modal
      // confirm records the attestation BEFORE running the pending
      // share — H22 — so the server INSERT policy sees it first try;
      // the non-anonymous session guard above guarantees a session
      // exists for the record call).
      if (!(await requestJournalAttestation(() => finishMarkAnswered()))) return;
      finishMarkAnswered();
      // Audit fix F7: consume a pending pre-session attestation once
      // it has authorized this share (stamped under the minted id when
      // one exists, otherwise dropped) — never a standing pass for a
      // later account. Private saves below do not pass the gate and
      // must not consume it, hence the early return here.
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
      return;
    }

    finishMarkAnswered();
  };

  // Audit round 4, AUTH-1: wall-write gate for journal testimony shares,
  // mirroring the community screen's gate (requestWallAttestation /
  // confirmWallAgeGate). The bypass ref exists so the modal-confirmed
  // retry passes its own gate check; it is always cleared after the
  // retried share, so it can never skip a later gate.
  const [showJournalAgeGate, setShowJournalAgeGate] = useState(false);
  const pendingJournalShareRef = useRef<(() => void) | null>(null);
  const journalGateBypassRef = useRef(false);

  const requestJournalAttestation = async (retry: () => void): Promise<boolean> => {
    if (journalGateBypassRef.current) {
      journalGateBypassRef.current = false;
      return true;
    }
    try {
      if (await DatabaseService.getAgeAttested()) return true;
      // Anonymous guests: device-local attestation counts too (see the
      // community gate). Always false for signed-in users.
      if (await DatabaseService.getAnonymousAgeAttested()) return true;
    } catch {
      // Unknown (offline, no profile row yet): gate, don't assume.
    }
    pendingJournalShareRef.current = retry;
    setShowJournalAgeGate(true);
    return false;
  };

  const confirmJournalAgeGate = async () => {
    setShowJournalAgeGate(false);
    const share = pendingJournalShareRef.current;
    pendingJournalShareRef.current = null;
    if (share) {
      journalGateBypassRef.current = true;
      try {
        // H22: record BEFORE the pending share, while the bypass ref
        // is held, so the share's own gate check passes and the
        // server INSERT policy sees the attestation on first try.
        await DatabaseService.recordAgeAttestation().catch(() => {});
        await DatabaseService.recordAnonymousAgeAttestation().catch(() => {});
        share();
        // Consume (never re-record) after the share: a minted
        // anonymous id gets stamped into the map; if the share has
        // not minted a session yet (this share is not awaited),
        // the flag is dropped and the next share re-prompts —
        // the same re-prompt behaviour as before, but with no
        // standing flag left behind.
        void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
      } finally {
        journalGateBypassRef.current = false;
      }
    } else {
      void DatabaseService.recordAgeAttestation().catch(() => {});
      // No share follows, so there is nothing to consume after:
      // see the community confirm's else branch — consuming
      // here cannot strand a pending flag with no write.
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
    }
  };

  const declineJournalAgeGate = () => {
    setShowJournalAgeGate(false);
    journalGateBypassRef.current = false;
    pendingJournalShareRef.current = null;
    // Decline shares nothing: the pending share is dropped, so no post
    // is published. Defensive clear of any pending anonymous pass.
    void DatabaseService.clearAnonymousAgeAttestationPending().catch(() => {});
    Alert.alert(
      'The Prayer Wall is for ages 13 and up',
      'Your answered prayer is saved here. The community wall needs someone who is 13 or older.',
    );
  };

  // Audit round 4, AUTH-1: the retry path is a wall write too — a failed
  // testimony share retried from the journal must pass the same gate,
  // not bypass it because the first attempt already happened.
  const handleRetryTestimonyShare = async (id: string) => {
    if (!(await requestJournalAttestation(() => void retryTestimonyShare(id)))) return;
    // Audit fix F7: consume the pending flag once the retried share
    // succeeds (see handleMarkAnswered note above).
    void retryTestimonyShare(id).then(() => {
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
    });
  };

  const finishMarkAnswered = () => {
    if (!answeringId || !answerText.trim()) return;
    markPrayerAnswered(answeringId, answerText.trim(), shareTestimony);
    setAnsweringId(null);
    setAnswerText('');
    setShareTestimony(false);
    setShowCelebration(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const tabFade = { opacity: tabFadeAnim, transform: [{ translateY: tabSlideAnim }] };
  const contentAnim = { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.transparent]}
        style={styles.ambientTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <SafeAreaView style={styles.safeArea}>
        {/* Finding 63: one ScrollView for the whole page — the header,
            tabs, Profile / First Steps and reflections scroll together,
            so the top no longer sits frozen over a tiny scroller. The
            tab row stays reachable via stickyHeaderIndices below. */}
        {/* While state is still loading, show a loading state — never the
            empty state. Without this gate a user WITH reflections briefly
            saw "Your history with God starts here" on every launch
            (UI/UX audit 2026-11-10). */}
        {isLoading ? (
          <View style={styles.loadingContainer} testID="journal-loading">
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={[styles.loadingText, { fontFamily: Fonts.italic }]}>Loading your journal…</Text>
          </View>
        ) : (
        <ScrollView
          bounces={true}
          decelerationRate="fast"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          keyboardShouldPersistTaps="handled"
        >
        <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR JOURNEY</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifMedium }]}>
              Prayer{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Journal</Text>
            </Text>
          </Animated.View>
          <Animated.View style={[tabFade, styles.stickyTabWrap]}>
            <View style={styles.tabBar}>
              <Pressable
                onPress={() => setActiveTab('reflect')}
                style={[styles.tab, activeTab === 'reflect' && styles.tabActive]}
                testID="journal-tab-reflect"
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'reflect' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'reflect' && styles.tabTextActive]} numberOfLines={1}>
                  Reflect
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('answered')}
                style={[styles.tab, activeTab === 'answered' && styles.tabActive]}
                testID="journal-tab-answered"
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'answered' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'answered' && styles.tabTextActive]} numberOfLines={1}>
                  Answered
                </Text>
              </Pressable>
            </View>
          </Animated.View>
          {stateLoadError && (
            <View style={styles.loadErrorBanner} testID="journal-load-error">
              <Text style={[styles.loadErrorText, { fontFamily: Fonts.titleMedium }]}>
                Your saved journal couldn’t load. What you see may be incomplete.
              </Text>
              <Pressable
                onPress={() => void reloadState()}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                style={styles.loadErrorRetry}
              >
                <Text style={[styles.loadErrorRetryText, { fontFamily: Fonts.titleBold }]}>RETRY</Text>
              </Pressable>
            </View>
          )}
          {/* UI/UX audit 2026-11-10: a cloud-sync failure is NOT a load
              failure — the journal on this device is complete, only the
              cloud copy is stale (this used to show the alarming banner
              above). A quiet note, no RETRY: the autosync timer retries
              on its own. */}
          {syncFailed && !stateLoadError && (
            <View style={styles.syncNote} testID="journal-sync-note">
              <Text style={[styles.syncNoteText, { fontFamily: Fonts.italic }]}>
                Couldn’t sync to the cloud. Your journal is safe on this device. We’ll keep trying in the background.
              </Text>
            </View>
          )}
          {/* Your story doors — Profile used to hide in Settings; First Steps
              used to be linked from nowhere. Both live here now. */}
          <Animated.View style={tabFade}>
            <View style={styles.storyLinks}>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/profile');
                }}
                style={styles.storyLink}
                testID="journal-profile-link"
              >
                <View style={styles.storyLinkCopy}>
                  <Text style={[styles.storyLinkTitle, { fontFamily: Fonts.titleSemiBold }]}>Your Profile</Text>
                  <Text style={[styles.storyLinkSub, { fontFamily: Fonts.italic }]} numberOfLines={1}>
                    Your name, your rhythm, your story so far
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </Pressable>
              <View style={styles.storyLinkDivider} />
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/journal/checklist');
                }}
                style={styles.storyLink}
                testID="journal-first-steps-link"
              >
                <View style={styles.storyLinkCopy}>
                  <Text style={[styles.storyLinkTitle, { fontFamily: Fonts.titleSemiBold }]}>First Steps</Text>
                  <Text style={[styles.storyLinkSub, { fontFamily: Fonts.italic }]} numberOfLines={1}>
                    {checklistCompletedCount > 0
                      ? `${checklistCompletedCount} of ${CHECKLIST_ITEMS.length} steps taken`
                      : `${CHECKLIST_ITEMS.length} small steps to start strong`}
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </Pressable>
            </View>
          </Animated.View>        {/* REFLECT — weekly reflections, strictly private */}
        {activeTab === 'reflect' && (
          <View testID="journal-scroll">
            <Animated.View style={contentAnim}>
              {reflections.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>✍️</Text>
                  <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifMedium }]}>Your history with God{'\n'}starts here.</Text>
                  <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                    After your first week, we will invite you to reflect. Your answers will live here. They will show who you are becoming.
                  </Text>
                </View>
              ) : (
                <View style={styles.entriesContainer}>
                  {reflections.length >= 1 && (
                    <View style={styles.synthesizeCard}>
                      {!showCloud ? (
                        <GlowButton
                          label="Sum up my month"
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setShowCloud(true);
                          }}
                          style={{ marginTop: 0 }}
                        />
                      ) : (
                        <View style={styles.cloudWrapper}>
                          <Text style={[styles.cloudTitle, { fontFamily: Fonts.serifSemiBold, color: C.text }]}>
                            Themes of your last month
                          </Text>
                          <WordCloud
                            textData={reflections.flatMap(r => [r.q1 || '', r.q2 || '', r.q3 || ''])}
                          />
                        </View>
                      )}
                    </View>
                  )}

                  {[...reflections].reverse().map((r, i) => (
                    <View key={`r-${r.week}-${i}`} style={styles.entry}>
                      <LinearGradient
                        colors={['transparent', 'rgba(200,137,74,0.3)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.entryTopLine}
                      />
                      <Text style={[styles.entryWeek, { fontFamily: Fonts.titleSemiBold }]}>Day {r.week}</Text>
                      <Text style={[styles.entryDate, { fontFamily: Fonts.titleLight }]}>{formatJournalDate(r.date)}</Text>
                      {r.q1 ? (
                        <View style={styles.entryQ}>
                          <Text style={[styles.entryQLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT SHIFTED THIS WEEK?</Text>
                          <Text style={[styles.entryAns, { fontFamily: Fonts.serifRegular }]}>{r.q1}</Text>
                        </View>
                      ) : null}
                      {r.q2 ? (
                        <View style={styles.entryQ}>
                          <Text style={[styles.entryQLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT DO YOU WANT MORE OF?</Text>
                          <Text style={[styles.entryAns, { fontFamily: Fonts.serifRegular }]}>{r.q2}</Text>
                        </View>
                      ) : null}
                      {r.q3 ? (
                        <View style={styles.entryQ}>
                          <Text style={[styles.entryQLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT ARE YOU CARRYING INTO NEXT WEEK?</Text>
                          <Text style={[styles.entryAns, { fontFamily: Fonts.serifRegular }]}>{r.q3}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {/* ANSWERED — stones of remembrance */}
        {activeTab === 'answered' && (
          <View testID="journal-answered-scroll">
            <Animated.View style={contentAnim}>
              <View style={styles.sectionHeader}>
                {/* Kai-approved 2026-10-26 (bundle 19, journal header
                    gloss): "Testify" means telling what God has done —
                    glossed here for screen readers; the visual title
                    stays, and the empty-state copy below already
                    explains "stones of remembrance" in plain words. */}
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]} accessibilityLabel="Testify: share what God has done">Testify</Text>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsAdding(true);
                  }}
                  style={styles.requestPrayerBtn}
                  testID="journal-add-entry"
                >
                  <Plus size={15} color={C.accent} strokeWidth={2.5} />
                  <Text style={[styles.requestPrayerBtnText, { fontFamily: Fonts.titleBold }]}>ADD ENTRY</Text>
                </Pressable>
              </View>

              {answeredPrayers.length === 0 && prayerRequests.length === 0 && !isAdding ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>✨</Text>
                  <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>Stones of{'\n'}remembrance.</Text>
                  <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                    Write down what God has already done. Each testimony, dated and saved here, is proof of His faithfulness. On hard days, it will remind you He has not changed.
                  </Text>
                </View>
              ) : null}

              {isAdding && (
                <View style={styles.addCard}>
                  <TextInput
                    style={[styles.addInput, { fontFamily: Fonts.italic }]}
                    placeholder="What did God do? Write it down so you'll remember…"
                    placeholderTextColor={C.textMuted}
                    value={newPrayer}
                    onChangeText={setNewPrayer}
                    multiline
                    autoFocus
                  />
                  <View style={styles.addCardActions}>
                    <Pressable onPress={() => setIsAdding(false)} style={styles.cancelBtn}>
                      <Text style={[styles.cancelBtnText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                    </Pressable>
                    <Pressable onPress={handleAddPrayer} style={styles.saveBtnMini}>
                      <Text style={[styles.saveBtnMiniText, { fontFamily: Fonts.titleBold }]}>SAVE</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {prayerRequests.length > 0 && (
                <View style={styles.requestsContainer}>
                  <Text style={[styles.subLabel, { fontFamily: Fonts.titleBold }]}>STILL PRAYING</Text>
                  {prayerRequests.map(r => (
                    <View key={r.id} style={styles.requestCard}>
                      <Text style={[styles.requestText, { fontFamily: Fonts.serifRegular }]}>{r.text}</Text>
                      <View style={styles.requestFooter}>
                        <Text style={[styles.requestDate, { fontFamily: Fonts.titleLight }]}>{formatJournalDate(r.date)}</Text>
                        <View style={styles.requestActions}>
                          <AnimatedPressable
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              Alert.alert(
                                'Remove this prayer?',
                                'This only removes it from your list.',
                                [
                                  { text: 'Keep it', style: 'cancel' },
                                  { text: 'Remove', style: 'destructive', onPress: () => deletePrayerRequest(r.id) },
                                ],
                              );
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.iconButton}
                            scaleValue={0.97}
                            testID={`journal-delete-prayer-${r.id}`}
                          >
                            <Trash2 size={16} color={C.iconMuted} />
                          </AnimatedPressable>
                          <AnimatedPressable
                            onPress={() => setAnsweringId(r.id)}
                            style={styles.markBtn}
                            scaleValue={0.96}
                            testID={`journal-update-prayer-${r.id}`}
                          >
                            <Text style={[styles.markBtnText, { fontFamily: Fonts.titleBold }]}>UPDATE</Text>
                          </AnimatedPressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {answeredPrayers.length > 0 && (
                <View style={styles.answeredContainer}>
                  <Text style={[styles.subLabel, { fontFamily: Fonts.titleBold }]}>RECORD OF FAITHFULNESS</Text>
                  {[...answeredPrayers].reverse().map(p => (
                    <View key={p.id} style={styles.answeredCard}>
                      <View style={styles.answeredIconWrap}>
                        <Text style={styles.answeredIcon}>🙌</Text>
                      </View>
                      <View style={styles.answeredContent}>
                        <Text style={[styles.answeredReq, { fontFamily: Fonts.serifRegular }]}>{p.request}</Text>
                        <View style={styles.answerBubble}>
                          <Text style={[styles.answerText, { fontFamily: Fonts.serifRegular }]}>{p.answer}</Text>
                        </View>
                        <Text style={[styles.answeredDate, { fontFamily: Fonts.titleLight }]}>{formatJournalDate(p.date)}</Text>
                        {p.testimonyShareFailed && (
                          <Pressable
                            onPress={() => void handleRetryTestimonyShare(p.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.testimonyRetryBtn}
                            testID={`journal-retry-testimony-${p.id}`}
                          >
                            <Text style={[styles.testimonyRetryText, { fontFamily: Fonts.titleBold }]}>
                              Testimony didn’t post. Tap to try again
                            </Text>
                          </Pressable>
                        )}
                        {p.testimonyHeld && !p.testimonyShareFailed && (
                          <Text style={[styles.answeredDate, { fontFamily: Fonts.titleLight }]}>
                            Testimony under review. Hidden from the wall
                          </Text>
                        )}
                        <Pressable
                          style={styles.echoShareBtn}
                          hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSharingPrayer(p);
                          }}
                          testID={`journal-share-answered-${p.id}`}
                        >
                          <Share2 size={16} color={C.accent} strokeWidth={2.2} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          </View>
        )}
        </ScrollView>
        )}
      </SafeAreaView>

      <AnsweredPrayerShareModal prayer={sharingPrayer} onClose={() => setSharingPrayer(null)} />

      <WallGuidelinesSheet
        visible={guidelinesVisible}
        onClose={() => setGuidelinesVisible(false)}
      />

      <AgeAttestationModal
        visible={showJournalAgeGate}
        onConfirm={confirmJournalAgeGate}
        onDecline={declineJournalAgeGate}
      />

      {/* Mark Answered Modal */}
      <Modal visible={!!answeringId} transparent animationType="fade" onRequestClose={() => setAnsweringId(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnsweringId(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalInner}>
            <View style={styles.modalContent}>
              <Text style={[styles.modalTitle, { fontFamily: Fonts.serifRegular }]}>What did God do?</Text>
              <Text style={[styles.modalPrompter, { fontFamily: Fonts.italic, color: C.textSecondary, marginBottom: 12 }]}>Write it down. His faithfulness is worth remembering.</Text>
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
              <TextInput
                style={[styles.modalInput, { fontFamily: Fonts.italic }]}
                placeholder="God moved..."
                placeholderTextColor={C.textMuted}
                value={answerText}
                onChangeText={setAnswerText}
                multiline
                autoFocus
              />
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShareTestimony((v) => !v);
                }}
                style={[styles.testimonyToggle, shareTestimony && styles.testimonyToggleActive]}
                testID="share-testimony-toggle"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shareTestimony }}
                accessibilityLabel="Share as testimony"
              >
                <View style={[styles.testimonyToggleBox, shareTestimony && styles.testimonyToggleBoxActive]}>
                  {shareTestimony ? <Text style={styles.testimonyToggleCheck}>{'\u2713'}</Text> : null}
                </View>
                <View style={styles.testimonyToggleCopy}>
                  <Text style={[styles.testimonyToggleTitle, { fontFamily: Fonts.titleMedium }]}>Share as testimony</Text>
                  <Text style={[styles.testimonyToggleSub, { fontFamily: Fonts.italic }]}>
                    {/* Fix-everything: the old "Your first name only"
                        line was stale — the 2026-10-25 batch pass
                        omits first_name so the DB default 'A friend'
                        fires on new shares. Corrected here to match
                        what actually publishes; Kai can overrule. */}
                    Encourage others on the prayer wall. Shared as “A friend”, never your full profile.
                  </Text>
                </View>
              </Pressable>
              {shareTestimony && (
                <Pressable
                  onPress={() => setGuidelinesVisible(true)}
                  testID="journal-wall-guidelines-open"
                  accessibilityRole="button"
                  accessibilityLabel="Open wall guidelines"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={[styles.testimonyToggleSub, { fontFamily: Fonts.titleMedium }]}>Wall guidelines</Text>
                </Pressable>
              )}
              <View style={styles.modalActions}>
                <Pressable onPress={() => setAnsweringId(null)} style={styles.modalCancel} accessibilityLabel="Still trusting: not answered yet, keep praying">
                  <Text style={[styles.modalCancelText, { fontFamily: Fonts.titleMedium }]}>STILL TRUSTING</Text>
                </Pressable>
                <Pressable onPress={handleMarkAnswered} style={styles.modalSave} accessibilityLabel="Hallelujah: God answered this prayer">
                  <LinearGradient colors={[C.accent, C.accentDark]} style={styles.modalSaveGradient}>
                    <Text style={[styles.modalSaveText, { fontFamily: Fonts.titleBold }]}>HALLELUJAH!</Text>
                  </LinearGradient>
                </Pressable>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Answer Celebration Modal */}
      <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={() => setShowCelebration(false)}>
        <View style={[styles.celebrationOverlay, { backgroundColor: 'rgba(24,12,2,0.95)' }]}>
          <CelebrationParticles active={showCelebration} />
          <Animated.View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🙌</Text>
            <Text style={[styles.celebrationTitle, { fontFamily: Fonts.serifMedium }]}>He is Faithful.</Text>
            <Text style={[styles.celebrationSub, { fontFamily: Fonts.italic, color: C.accentDark }]}>
              Your prayer has been answered.
            </Text>
            <Pressable
              onPress={() => setShowCelebration(false)}
              style={styles.celebrationClose}
            >
              <Text style={[styles.celebrationCloseText, { fontFamily: Fonts.titleBold }]}>CONTINUE</Text>
            </Pressable>
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
    overflow: 'hidden' as const,
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
  stickyTabWrap: {
    // Finding 63: the sticky tab row needs an opaque backing so content
    // scrolling underneath it does not show through its rounded corners.
    backgroundColor: C.background,
  },
  storyLinks: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    backgroundColor: C.surface,
    paddingHorizontal: 18,
  },
  storyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  storyLinkCopy: {
    flex: 1,
    marginRight: 10,
  },
  storyLinkTitle: {
    fontSize: T.size.rowTitle,
    lineHeight: T.leading.rowTitle,
    color: C.text,
    marginBottom: 2,
  },
  storyLinkSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  storyLinkDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 24,
    // Clearance for the floating tab bar (~100pt incl. its bottom offset)
    // plus breathing room, so the last content never rests underneath it
    // (audit §8d) — same pattern as the Truth tab.
    paddingBottom: 176,
  },
  eyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    marginBottom: 10,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    marginTop: 10,
    marginBottom: 14,
  },
  synthesizeCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    alignItems: 'center',
    marginBottom: 16,
  },
  cloudWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  cloudTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
    backgroundColor: C.surfaceAlt,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
    minHeight: 44,
  },
  tabActive: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accent,
  },
  tabText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
    color: C.textSecondary,
    textAlign: 'center',
  },
  tabTextActive: {
    color: C.accentDark,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyIcon: {
    fontSize: T.scale(21),
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.textSecondary,
  },
  emptySub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 24,
  },
  entriesContainer: {
    gap: 16,
  },
  entry: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  entryTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  entryWeek: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    marginBottom: 4,
  },
  entryDate: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1,
    color: C.textSecondary,
    marginBottom: 16,
  },
  entryQ: {
    marginBottom: 14,
  },
  entryQLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    marginBottom: 6,
  },
  entryAns: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  addCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.accent,
  },
  addInput: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  addCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  cancelBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: C.textSecondary,
    letterSpacing: 1,
  },
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  saveBtnMini: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveBtnMiniText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#FFF',
    letterSpacing: 1,
  },
  subLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.textSecondary,
    marginBottom: 16,
  },
  requestsContainer: {
    marginBottom: 32,
  },
  requestCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  requestText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    marginBottom: 14,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestDate: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  markBtn: {
    backgroundColor: C.accentBg,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
  },
  markBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: C.accentDark,
    letterSpacing: 1,
  },
  answeredContainer: {
    marginBottom: 32,
  },
  answeredCard: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  answeredIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(200,137,74,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeredIcon: {
    fontSize: T.scale(20),
  },
  answeredContent: {
    flex: 1,
  },
  answeredReq: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginBottom: 6,
  },
  answerBubble: {
    backgroundColor: C.surfaceAlt,
    padding: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    marginBottom: 6,
  },
  answerText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
  },
  answeredDate: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    opacity: 0.6,
  },
  testimonyRetryBtn: {
    marginTop: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  testimonyRetryText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.5,
    color: C.accentDark,
  },
  loadErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(180,80,60,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(180,80,60,0.30)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 12,
  },
  loadErrorText: {
    flex: 1,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    marginRight: 12,
  },
  loadErrorRetry: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  loadErrorRetryText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  // Quiet sync note (UI/UX audit 2026-11-10) — deliberately calmer than
  // the load-error banner: no red, no RETRY, just the truth.
  syncNote: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 12,
  },
  syncNoteText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 80,
  },
  loadingText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  requestPrayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accentBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
    minHeight: 44,
    justifyContent: 'center',
  },
  requestPrayerBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.4,
    color: C.accentDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalInner: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 52,
    borderTopWidth: 1,
    borderTopColor: 'rgba(200,137,74,0.2)',
    maxHeight: '88%',
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    marginBottom: 8,
  },
  modalPrompter: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    backgroundColor: C.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 24,
    marginTop: 28,
  },
  modalCancel: {
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 1.5,
  },
  modalSave: {
    borderRadius: 100,
    overflow: 'hidden',
  },
  modalSaveGradient: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  modalSaveText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#FFF',
    letterSpacing: 1.5,
  },
  celebrationOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  celebrationContent: {
    alignItems: 'center',
    gap: 16,
  },
  celebrationEmoji: {
    fontSize: T.scale(64),
    marginBottom: 10,
  },
  celebrationTitle: {
    fontSize: T.size.display,
    lineHeight: T.leading.display,
    color: '#FFF',
    textAlign: 'center',
  },
  celebrationSub: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    textAlign: 'center',
    marginBottom: 40,
  },
  celebrationClose: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  celebrationCloseText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#FFF',
    letterSpacing: 2,
  },
  testimonyToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.surfaceAlt,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  testimonyToggleActive: {
    borderColor: C.accent,
    backgroundColor: 'rgba(200,137,74,0.08)',
  },
  testimonyToggleBox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  testimonyToggleBoxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  testimonyToggleCheck: {
    color: '#FFFFFF',
    fontSize: 14.5,
    lineHeight: 20,
  },
  testimonyToggleCopy: {
    flex: 1,
  },
  testimonyToggleTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  testimonyToggleSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginTop: 4,
  },
  echoShareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
  },
});
