import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Share2 } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import CelebrationParticles from '@/components/CelebrationParticles';
import GlowButton from '@/components/GlowButton';
import WordCloud from '@/components/WordCloud';
import AnimatedPressable from '@/components/AnimatedPressable';
import { SEED_ECHOES } from '@/mocks/echoes';

// ── Animated echo card component ──────────────────────────────────────────────
function EchoCard({
  echo,
  isAmened,
  onAmen,
  styles,
  _C,
  Fonts,
}: {
  echo: typeof SEED_ECHOES[0];
  isAmened: boolean;
  onAmen: () => void;
  styles: any;
  _C: any;
  Fonts: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const countScale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (isAmened) return;

    // Scale burst
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.spring(scale, { toValue: 1.01, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
    ]).start();

    // Glow pulse
    Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Count bounce
    Animated.sequence([
      Animated.spring(countScale, { toValue: 1.4, useNativeDriver: true, tension: 200, friction: 8 }),
      Animated.spring(countScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 10 }),
    ]).start();

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAmen();
  };

  return (
    <Animated.View style={[
      styles.echoCard,
      isAmened && styles.echoCardActive,
      { transform: [{ scale }] },
    ]}>
      {/* Amber glow overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: 20,
            backgroundColor: 'rgba(200,154,90,0.12)',
            opacity: glowOpacity,
          },
        ]}
      />
      <Pressable onPress={handlePress} style={{ flex: 1 }}>
        <View style={styles.echoHeader}>
          <Text style={styles.echoTime}>{echo.timeAgo}</Text>
          {isAmened && (
            <View style={styles.echoAmenedBadge}>
              <Text style={[styles.echoAmenedBadgeText, { fontFamily: Fonts.titleBold }]}>✓ PRAYED</Text>
            </View>
          )}
        </View>
        <Text style={[
          styles.echoText,
          { fontFamily: Fonts.italic },
          isAmened && styles.echoTextActive,
        ]}>
          "{echo.text}"
        </Text>
        <View style={styles.echoFooter}>
          <View style={[styles.amenPill, isAmened && styles.amenPillActive]}>
            <Text style={[styles.amenIcon, isAmened && styles.amenIconActive]}>🙏</Text>
            <Animated.Text style={[
              styles.amenCount,
              isAmened && styles.amenCountActive,
              { fontFamily: Fonts.titleBold, transform: [{ scale: countScale }] },
            ]}>
              {isAmened ? echo.amens + 1 : echo.amens}
            </Animated.Text>
            <Text style={[styles.amenLabel, isAmened && styles.amenCountActive, { fontFamily: Fonts.titleLight }]}>
              praying
            </Text>
          </View>
          {!isAmened && (
            <View style={styles.tapToAmenWrap}>
              <Text style={[styles.tapToAmen, { fontFamily: Fonts.titleLight }]}>Tap to say Amen</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function JournalScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const { state, addPrayerRequest, markPrayerAnswered, deletePrayerRequest } = useApp();
  const [activeTab, setActiveTab] = useState<'reflections' | 'prayers' | 'echoes'>('reflections');
  const [newPrayer, setNewPrayer] = useState('');
  const [amenedEchoes, setBenedEchoes] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [isSharingToEchoes, setIsSharingToEchoes] = useState(false);
  const [echoInput, setEchoInput] = useState('');
  
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

  const handleMarkAnswered = () => {
    if (!answeringId || !answerText.trim()) return;
    markPrayerAnswered(answeringId, answerText.trim());
    setAnsweringId(null);
    setAnswerText('');
    setShowCelebration(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleShareToEchoes = () => {
    if (!echoInput.trim()) return;
    // In a real app, this would send to a server. 
    // For now, we mimic the success and reset.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSharingToEchoes(false);
    setEchoInput('');
  };

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
        <ScrollView bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="journal-scroll">
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR JOURNEY</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Prayer{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Journal</Text>
            </Text>
            <AnimatedPressable
              onPress={() => {
                if (__DEV__) {
                  console.log('[Journal] Opening First Steps checklist');
                }
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/journal/checklist');
              }}
              style={styles.checklistCard}
              scaleValue={0.97}
              testID="journal-open-first-steps"
            >
              <View style={styles.checklistCardCopy}>
                <Text style={[styles.checklistEyebrow, { fontFamily: Fonts.titleSemiBold }]}>PRIVATE MILESTONE TRACKER</Text>
                <Text style={[styles.checklistTitle, { fontFamily: Fonts.serifRegular }]}>First Steps Checklist</Text>
                <Text style={[styles.checklistMeta, { fontFamily: Fonts.italic }]}>
                  {checklistCompletedCount} of 35 steps taken
                </Text>
              </View>
              <Text style={[styles.checklistLink, { fontFamily: Fonts.titleMedium }]}>OPEN</Text>
            </AnimatedPressable>
            <View style={styles.rule} />

            <Animated.View style={{ opacity: tabFadeAnim, transform: [{ translateY: tabSlideAnim }] }}>
              <View style={styles.tabBar}>
              <Pressable 
                onPress={() => setActiveTab('reflections')}
                style={[styles.tab, activeTab === 'reflections' && styles.tabActive]}
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'reflections' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'reflections' && styles.tabTextActive]}>
                  REFLECTIONS
                </Text>
              </Pressable>
              <Pressable 
                onPress={() => setActiveTab('prayers')}
                style={[styles.tab, activeTab === 'prayers' && styles.tabActive]}
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'prayers' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'prayers' && styles.tabTextActive]}>
                  WHAT GOD DID
                </Text>
              </Pressable>
              <Pressable 
                onPress={() => setActiveTab('echoes')}
                style={[styles.tab, activeTab === 'echoes' && styles.tabActive]}
              >
                <Text style={[styles.tabText, { fontFamily: activeTab === 'echoes' ? Fonts.titleBold : Fonts.titleMedium }, activeTab === 'echoes' && styles.tabTextActive]}>
                  ECHOES
                </Text>
              </Pressable>
              </View>
            </Animated.View>
          </Animated.View>

          {activeTab === 'reflections' && (
            reflections.length === 0 ? (
              <Animated.View style={[styles.emptyContainer, { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }]}>
                <Text style={styles.emptyIcon}>✍️</Text>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifLight }]}>Your history with God{'\n'}starts here.</Text>
                <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                  After your first week of prayer you&apos;ll be invited to reflect. Those answers will live here — a record of who you&apos;re becoming.
                </Text>
              </Animated.View>
            ) : (
              <Animated.View style={[styles.entriesContainer, { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }]}>
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
                        <Text style={[styles.entryAns, { fontFamily: Fonts.italic }]}>{r.q1}</Text>
                      </View>
                    ) : null}
                    {r.q2 ? (
                      <View style={styles.entryQ}>
                        <Text style={[styles.entryQLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT DO YOU WANT MORE OF?</Text>
                        <Text style={[styles.entryAns, { fontFamily: Fonts.italic }]}>{r.q2}</Text>
                      </View>
                    ) : null}
                    {r.q3 ? (
                      <View style={styles.entryQ}>
                        <Text style={[styles.entryQLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT ARE YOU CARRYING INTO NEXT WEEK?</Text>
                        <Text style={[styles.entryAns, { fontFamily: Fonts.italic }]}>{r.q3}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </Animated.View>
            )
          )}

          {activeTab === 'prayers' && (
            <Animated.View style={{ opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>What God Did</Text>
                <Pressable onPress={() => setIsAdding(true)} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>I BELIEVED FOR...</Text>
                </Pressable>
              </View>

              {answeredPrayers.length === 0 && prayerRequests.length === 0 && !isAdding ? (
                 <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>✨</Text>
                    <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>Build a record{'\n'}of faithfulness.</Text>
                    <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                      Record what you&apos;re asking for today. When God moves, you&apos;ll find the answer here to celebrate. This is how you anchor your faith.
                    </Text>
                    <Pressable 
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setIsAdding(true);
                      }}
                      style={styles.emptyActionBtn}
                    >
                      <Text style={[styles.emptyActionBtnText, { fontFamily: Fonts.titleMedium }]}>ADD A REQUEST</Text>
                    </Pressable>
                 </View>
              ) : null}

              {isAdding && (
                <View style={styles.addCard}>
                    <TextInput
                    style={[styles.addInput, { fontFamily: Fonts.italic }]}
                    placeholder="What are you asking for?"
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
                  <Text style={[styles.subLabel, { fontFamily: Fonts.titleBold }]}>I BELIEVED FOR...</Text>
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
                          <Text style={[styles.answerText, { fontFamily: Fonts.italic }]}>{p.answer}</Text>
                        </View>
                        <Text style={[styles.answeredDate, { fontFamily: Fonts.titleLight }]}>{p.date}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {activeTab === 'echoes' && (
            <Animated.View style={[styles.entriesContainer, { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }]}>
              <View style={styles.echoesHeader}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.echoesTitle, { fontFamily: Fonts.serifLight }]}>Community Echoes</Text>
                    <Text style={[styles.echoesSub, { fontFamily: Fonts.italic }]}>You are not alone. Support others in prayer.</Text>
                  </View>
                  <Pressable 
                    onPress={() => setIsSharingToEchoes(true)} 
                    style={styles.echoShareBtn}
                  >
                    <Share2 size={16} color={C.accent} />
                  </Pressable>
                </View>
              </View>

              {isSharingToEchoes && (
                <View style={styles.echoAddCard}>
                  <Text style={[styles.echoAddTitle, { fontFamily: Fonts.titleBold }]}>SHARE ANONYMOUSLY</Text>
                  <TextInput
                    style={[styles.echoAddInput, { fontFamily: Fonts.italic }]}
                    placeholder="How can the community pray for you?"
                    placeholderTextColor={C.textMuted}
                    value={echoInput}
                    onChangeText={setEchoInput}
                    multiline
                    autoFocus
                  />
                  <View style={styles.addCardActions}>
                    <Pressable onPress={() => setIsSharingToEchoes(false)}>
                      <Text style={[styles.cancelBtnText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                    </Pressable>
                    <Pressable onPress={handleShareToEchoes} style={styles.echoSaveBtn}>
                      <Text style={[styles.saveBtnMiniText, { fontFamily: Fonts.titleBold }]}>SHARE</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {SEED_ECHOES.length === 0 && !isSharingToEchoes ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🙏</Text>
                  <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>Silent, for now.</Text>
                  <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                    This is where you&apos;ll see and support others in their journey. Be the first to share a quiet request with the gathering.
                  </Text>
                  <Pressable 
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsSharingToEchoes(true);
                    }}
                    style={styles.emptyActionBtn}
                  >
                    <Text style={[styles.emptyActionBtnText, { fontFamily: Fonts.titleMedium }]}>SHARE A REQUEST</Text>
                  </Pressable>
                </View>
              ) : (
                SEED_ECHOES.map(echo => {
                  const isAmened = amenedEchoes.has(echo.id);
                  return (
                    <EchoCard
                      key={echo.id}
                      echo={echo}
                      isAmened={isAmened}
                      onAmen={() => setBenedEchoes(prev => new Set(prev).add(echo.id))}
                      styles={styles}
                      _C={C}
                      Fonts={Fonts}
                    />
                  );
                })
              )}
              <View style={styles.echoesFooterSpacer} />
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

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
  title: {
    fontSize: T.scale(36),
    lineHeight: 40,
    color: C.text,
    marginTop: 10,
    marginBottom: 14,
  },
  rule: {
    width: 44,
    height: 1.5,
    backgroundColor: C.accent,
    opacity: 0.55,
    marginBottom: 20,
  },
  checklistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surfaceAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 18,
  },
  checklistCardCopy: {
    flex: 1,
    paddingRight: 12,
  },
  checklistEyebrow: {
    color: C.accent,
    fontSize: T.scale(8.8),
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  checklistTitle: {
    color: C.text,
    fontSize: T.scale(22),
    marginBottom: 4,
  },
  checklistMeta: {
    color: C.textMuted,
    fontSize: T.scale(13),
    lineHeight: 21,
  },
  checklistLink: {
    color: C.accentDark,
    fontSize: T.scale(10),
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 24,
  },
  tab: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.accent,
  },
  tabText: {
    fontSize: T.scale(10),
    letterSpacing: 1.5,
    color: C.textMuted,
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
  emptyActionBtn: {
    backgroundColor: C.accentBg,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
  },
  emptyActionBtnText: {
    fontSize: T.scale(10.4),
    letterSpacing: 1.5,
    color: C.accent,
    textTransform: 'uppercase' as const,
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
  addBtn: {
    backgroundColor: C.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
  },
  addBtnText: {
    fontSize: T.scale(9),
    letterSpacing: 1,
    color: C.accent,
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
  modalSub: {
    fontSize: T.scale(12),
    color: C.accent,
    lineHeight: 18,
    marginBottom: 4,
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,137,74,0.3)',
    paddingVertical: 12,
    minHeight: 100,
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
    fontSize: T.scale(12),
    color: '#FFF',
    letterSpacing: 2,
  },
  
  /* ── Echoes CSS ── */
  echoesHeader: {
    marginBottom: 24,
  },
  echoesTitle: {
    fontSize: T.scale(28),
    color: C.text,
    marginBottom: 4,
  },
  echoesSub: {
    fontSize: T.scale(14),
    color: C.accent,
  },
  echoCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
  },
  echoCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accentBg,
  },
  echoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  echoAmenedBadge: {
    backgroundColor: C.accentBg,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.accent,
  },
  echoAmenedBadgeText: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  echoTime: {
    fontSize: 12,
    color: C.textMuted,
    letterSpacing: 1,
  },
  echoText: {
    fontSize: T.scale(18),
    lineHeight: 28,
    color: C.textSecondary,
    marginBottom: 20,
  },
  echoTextActive: {
    color: C.text,
  },
  echoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  amenPillActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  amenIcon: {
    fontSize: 14,
    opacity: 0.5,
  },
  amenIconActive: {
    opacity: 1,
  },
  amenCount: {
    fontSize: 14,
    color: C.textSecondary,
  },
  amenCountActive: {
    color: C.accentDark,
  },
  amenLabel: {
    fontSize: 12,
    color: C.textMuted,
  },
  tapToAmenWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.border,
  },
  tapToAmen: {
    fontSize: 11,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  echoesFooterSpacer: {
    height: 60,
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
  echoAddCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.accent,
  },
  echoAddTitle: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 16,
  },
  echoAddInput: {
    fontSize: T.scale(18),
    lineHeight: 28,
    color: C.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  echoSaveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 100,
  },
});
