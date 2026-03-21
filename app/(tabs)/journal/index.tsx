import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import CelebrationParticles from '@/components/CelebrationParticles';

export default function JournalScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const { state, addPrayerRequest, markPrayerAnswered, deletePrayerRequest } = useApp();
  const [activeTab, setActiveTab] = useState<'reflections' | 'prayers'>('reflections');
  const [newPrayer, setNewPrayer] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const reflections = state.reflections ?? [];
  const prayerRequests = state.prayerRequests?.filter(r => !r.isAnswered) ?? [];
  const answeredPrayers = state.answeredPrayers ?? [];

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
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR JOURNEY</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Prayer{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Journal</Text>
            </Text>
            <View style={styles.rule} />
            
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
            </View>
          </Animated.View>

          {activeTab === 'reflections' ? (
            reflections.length === 0 ? (
              <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
                <Text style={styles.emptyIcon}>✍️</Text>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifLight }]}>Your history with God{'\n'}starts here.</Text>
                <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                  After your first week of prayer you&apos;ll be invited to reflect. Those answers will live here — a record of who you&apos;re becoming.
                </Text>
              </Animated.View>

            ) : (
              <Animated.View style={[styles.entriesContainer, { opacity: fadeAnim }]}>
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
          ) : (
            <Animated.View style={{ opacity: fadeAnim }}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>Answered</Text>
                <Pressable onPress={() => setIsAdding(true)} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+ REQUEST</Text>
                </Pressable>
              </View>

              {answeredPrayers.length === 0 && prayerRequests.length === 0 && !isAdding ? (
                 <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>✨</Text>
                    <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>No requests yet.</Text>
                    <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                      Record what you&apos;re asking for. When God moves, record the answer here to celebrate.
                    </Text>
                 </View>
              ) : null}

              {isAdding && (
                <View style={styles.addCard}>
                  <TextInput
                    style={[styles.addInput, { fontFamily: Fonts.serifRegular }]}
                    placeholder="What are you asking for?"
                    placeholderTextColor={C.textMuted}
                    value={newPrayer}
                    onChangeText={setNewPrayer}
                    multiline
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
                  <Text style={[styles.subLabel, { fontFamily: Fonts.titleBold }]}>ACTIVE REQUESTS</Text>
                  {prayerRequests.map(r => (
                    <View key={r.id} style={styles.requestCard}>
                      <Text style={[styles.requestText, { fontFamily: Fonts.serifRegular }]}>{r.text}</Text>
                      <View style={styles.requestFooter}>
                        <Text style={[styles.requestDate, { fontFamily: Fonts.titleLight }]}>{r.date}</Text>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <TouchableOpacity 
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              deletePrayerRequest(r.id);
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Trash2 size={16} color={C.textMuted} opacity={0.6} />
                          </TouchableOpacity>
                          <Pressable 
                            onPress={() => setAnsweringId(r.id)}
                            style={styles.markBtn}
                          >
                            <Text style={[styles.markBtnText, { fontFamily: Fonts.titleBold }]}>MARK ANSWERED</Text>
                          </Pressable>
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
        </ScrollView>
      </SafeAreaView>

      {/* Mark Answered Modal */}
      <Modal visible={!!answeringId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnsweringId(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalInner}>
            <View style={styles.modalContent}>
              <Text style={[styles.modalTitle, { fontFamily: Fonts.serifRegular }]}>What did God do?</Text>
              <Text style={[styles.modalSub, { fontFamily: Fonts.italic }]}>Record the answer to anchor your faith.</Text>
              <TextInput
                style={[styles.modalInput, { fontFamily: Fonts.serifRegular }]}
                placeholder="The answer was..."
                placeholderTextColor={C.textMuted}
                value={answerText}
                onChangeText={setAnswerText}
                multiline
                autoFocus
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setAnsweringId(null)} style={styles.modalCancel}>
                  <Text style={[styles.modalCancelText, { fontFamily: Fonts.titleMedium }]}>NOT YET</Text>
                </Pressable>
                <Pressable onPress={handleMarkAnswered} style={styles.modalSave}>
                  <LinearGradient colors={[C.accent, C.accentDark]} style={styles.modalSaveGradient}>
                    <Text style={[styles.modalSaveText, { fontFamily: Fonts.titleBold }]}>CELEBRATE</Text>
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
    marginBottom: 20,
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
    marginBottom: 12,
  },
  requestsContainer: {
    marginBottom: 32,
  },
  requestCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  requestText: {
    fontSize: T.scale(17),
    lineHeight: 26,
    color: C.text,
    marginBottom: 12,
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
  markBtn: {
    backgroundColor: C.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
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
    marginBottom: 20,
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
    fontSize: T.scale(15),
    color: C.textSecondary,
    marginBottom: 24,
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
});
