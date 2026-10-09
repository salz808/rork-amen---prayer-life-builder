import React, { useRef, useEffect, useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Plus, Share2 } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import CelebrationParticles from '@/components/CelebrationParticles';
import GlowButton from '@/components/GlowButton';
import WordCloud from '@/components/WordCloud';
import AnimatedPressable from '@/components/AnimatedPressable';
import InsightsView from '@/components/InsightsView';
import AnsweredPrayerShareModal from '@/components/AnsweredPrayerShareModal';
import ConnectionChartCard from '@/components/ConnectionChartCard';
import { getSafeSession } from '@/lib/supabase';
import type { AnsweredPrayer } from '@/types';

type JournalTab = 'reflect' | 'answered' | 'insights';

/**
 * Journal tab — strictly private. Reflect (weekly reflections), Answered
 * (stones of remembrance), and Insights (stats, heatmaps, streak — all about
 * the user's own prayer life). Community content lives in the Community tab.
 */
export default function JournalScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: JournalTab =
    params.tab === 'answered' || params.tab === 'insights' ? params.tab : 'reflect';
  const [activeTab, setActiveTab] = useState<JournalTab>(initialTab);

  // Deep links (e.g. Home recap cards) can land on a specific sub-tab.
  useEffect(() => {
    if (params.tab === 'answered' || params.tab === 'insights') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  const { state, addPrayerRequest, markPrayerAnswered, deletePrayerRequest } = useApp();
  const [sharingPrayer, setSharingPrayer] = useState<AnsweredPrayer | null>(null);
  const [newPrayer, setNewPrayer] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [shareTestimony, setShareTestimony] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCloud, setShowCloud] = useState(false);

  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const tabFadeAnim = useRef(new Animated.Value(0)).current;
  const tabSlideAnim = useRef(new Animated.Value(16)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const contentSlideAnim = useRef(new Animated.Value(16)).current;

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
          'Your answered prayer is saved here. Create a free account to share it as a testimony on the wall.',
          [
            { text: 'Save privately', style: 'cancel', onPress: () => finishMarkAnswered() },
            { text: 'Sign In', onPress: () => router.push('/auth') },
          ],
        );
        return;
      }
    }

    finishMarkAnswered();
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
        {/* Fixed header — never scrolls away, so the sub-tabs are always reachable */}
        <Animated.View style={styles.headerBlock}>
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR JOURNEY</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Prayer{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Journal</Text>
            </Text>
          </Animated.View>
          <Animated.View style={tabFade}>
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
              <Pressable
                onPress={() => setActiveTab('insights')}
                style={[styles.tab, activeTab === 'insights' && styles.tabActive]}
                testID="journal-tab-insights"
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'insights' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'insights' && styles.tabTextActive]} numberOfLines={1}>
                  Insights
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>

        {/* REFLECT — weekly reflections, strictly private */}
        {activeTab === 'reflect' && (
          <ScrollView bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="journal-scroll">
            <Animated.View style={contentAnim}>
              {reflections.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>✍️</Text>
                  <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifLight }]}>Your history with God{'\n'}starts here.</Text>
                  <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                    After your first week of prayer you&apos;ll be invited to reflect. Those answers will live here — a record of who you&apos;re becoming.
                  </Text>
                </View>
              ) : (
                <View style={styles.entriesContainer}>
                  {reflections.length >= 1 && (
                    <View style={styles.synthesizeCard}>
                      {!showCloud ? (
                        <GlowButton
                          label="Synthesize my month"
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setShowCloud(true);
                          }}
                          style={{ marginTop: 0 }}
                        />
                      ) : (
                        <View style={styles.cloudWrapper}>
                          <Text style={[styles.cloudTitle, { fontFamily: Fonts.serifLight, color: C.text }]}>
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
                      <Text style={[styles.entryWeek, { fontFamily: Fonts.titleSemiBold }]}>Week {r.week}</Text>
                      <Text style={[styles.entryDate, { fontFamily: Fonts.titleLight }]}>{r.date}</Text>
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
          </ScrollView>
        )}

        {/* ANSWERED — stones of remembrance */}
        {activeTab === 'answered' && (
          <ScrollView bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="journal-answered-scroll">
            <Animated.View style={contentAnim}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Testify</Text>
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
                    Record what God has already done. Each testimony — dated and saved here — becomes proof of His faithfulness for the days your faith feels far. This is how you anchor your future.
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
                    <Pressable onPress={() => setIsAdding(false)}>
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
                        <Text style={[styles.requestDate, { fontFamily: Fonts.titleLight }]}>{r.date}</Text>
                        <View style={styles.requestActions}>
                          <AnimatedPressable
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              deletePrayerRequest(r.id);
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
                        <Text style={[styles.answeredDate, { fontFamily: Fonts.titleLight }]}>{p.date}</Text>
                        <Pressable
                          style={styles.echoShareBtn}
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
          </ScrollView>
        )}

        {/* INSIGHTS — stats, heatmaps, streak. All about your own prayer life. */}
        {activeTab === 'insights' && (
          <InsightsView header={<ConnectionChartCard />} />
        )}
      </SafeAreaView>

      <AnsweredPrayerShareModal prayer={sharingPrayer} onClose={() => setSharingPrayer(null)} />

      {/* Mark Answered Modal */}
      <Modal visible={!!answeringId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnsweringId(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalInner}>
            <View style={styles.modalContent}>
              <Text style={[styles.modalTitle, { fontFamily: Fonts.serifRegular }]}>What did God do?</Text>
              <Text style={[styles.modalPrompter, { fontFamily: Fonts.italic, color: C.textSecondary, marginBottom: 12 }]}>Capture the moment. His faithfulness deserves to be remembered.</Text>
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
              >
                <View style={[styles.testimonyToggleBox, shareTestimony && styles.testimonyToggleBoxActive]}>
                  {shareTestimony ? <Text style={styles.testimonyToggleCheck}>{'\u2713'}</Text> : null}
                </View>
                <View style={styles.testimonyToggleCopy}>
                  <Text style={[styles.testimonyToggleTitle, { fontFamily: Fonts.titleMedium }]}>Share as testimony</Text>
                  <Text style={[styles.testimonyToggleSub, { fontFamily: Fonts.italic }]}>
                    Encourage others on the prayer wall. Your first name only — never your full profile.
                  </Text>
                </View>
              </Pressable>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setAnsweringId(null)} style={styles.modalCancel}>
                  <Text style={[styles.modalCancelText, { fontFamily: Fonts.titleMedium }]}>STILL TRUSTING</Text>
                </Pressable>
                <Pressable onPress={handleMarkAnswered} style={styles.modalSave}>
                  <LinearGradient colors={[C.accent, C.accentDark]} style={styles.modalSaveGradient}>
                    <Text style={[styles.modalSaveText, { fontFamily: Fonts.titleBold }]}>HALLELUJAH!</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Answer Celebration Modal */}
      <Modal visible={showCelebration} transparent animationType="fade">
        <View style={[styles.celebrationOverlay, { backgroundColor: 'rgba(24,12,2,0.95)' }]}>
          <CelebrationParticles active={showCelebration} />
          <Animated.View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🙌</Text>
            <Text style={[styles.celebrationTitle, { fontFamily: Fonts.serifLight }]}>He is Faithful.</Text>
            <Text style={[styles.celebrationSub, { fontFamily: Fonts.italic, color: C.accent }]}>
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
  headerBlock: {
    paddingHorizontal: 32,
    paddingTop: 16,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 150,
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
    lineHeight: T.scale(40),
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
    fontSize: T.scale(18),
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
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
  },
  tabActive: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accent,
  },
  tabText: {
    fontSize: T.scale(13),
    letterSpacing: 0.3,
    color: C.textMuted,
    textAlign: 'center',
  },
  tabTextActive: {
    color: C.accent,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyIcon: {
    fontSize: T.scale(38),
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: T.scale(24),
    color: C.textSecondary,
  },
  emptySub: {
    fontSize: T.scale(15),
    lineHeight: 26,
    color: C.textMuted,
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
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 3,
  },
  entryDate: {
    fontSize: T.scale(9),
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 16,
  },
  entryQ: {
    marginBottom: 14,
  },
  entryQLabel: {
    fontSize: T.scale(8),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.5)',
    marginBottom: 6,
  },
  entryAns: {
    fontSize: T.scale(16),
    lineHeight: 28,
    color: C.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: T.scale(24),
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
    fontSize: T.scale(17),
    lineHeight: 26,
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
    fontSize: T.scale(10),
    color: C.textMuted,
    letterSpacing: 1,
  },
  saveBtnMini: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
  },
  saveBtnMiniText: {
    fontSize: T.scale(10),
    color: '#FFF',
    letterSpacing: 1,
  },
  subLabel: {
    fontSize: T.scale(8),
    letterSpacing: 2,
    color: C.textMuted,
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
    fontSize: T.scale(17),
    lineHeight: 26,
    color: C.text,
    marginBottom: 14,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestDate: {
    fontSize: T.scale(9),
    color: C.textMuted,
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
    fontSize: T.scale(9),
    color: C.accent,
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
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textMuted,
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
    fontSize: T.scale(17),
    lineHeight: 26,
    color: C.text,
  },
  answeredDate: {
    fontSize: T.scale(9),
    color: C.textMuted,
    opacity: 0.6,
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
  },
  requestPrayerBtnText: {
    fontSize: T.scale(10.5),
    letterSpacing: 1.4,
    color: C.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalInner: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 52,
    borderTopWidth: 1,
    borderTopColor: 'rgba(200,137,74,0.2)',
  },
  modalTitle: {
    fontSize: T.scale(24),
    color: C.text,
    marginBottom: 8,
  },
  modalPrompter: {
    fontSize: T.scale(14),
    color: C.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    fontSize: T.scale(18),
    lineHeight: 28,
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
  },
  modalCancelText: {
    fontSize: T.scale(11),
    color: C.textMuted,
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
    fontSize: T.scale(11),
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
    fontSize: T.scale(42),
    color: '#FFF',
    textAlign: 'center',
  },
  celebrationSub: {
    fontSize: T.scale(20),
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
    fontSize: T.scale(13),
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
    borderRadius: 7,
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
    fontSize: 14,
    lineHeight: 16,
  },
  testimonyToggleCopy: {
    flex: 1,
  },
  testimonyToggleTitle: {
    fontSize: T.scale(14),
    lineHeight: 19,
    color: C.text,
  },
  testimonyToggleSub: {
    fontSize: T.scale(12),
    lineHeight: 18,
    color: C.textMuted,
    marginTop: 3,
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
