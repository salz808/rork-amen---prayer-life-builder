import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Share2, LogOut, Trash2, Lock } from 'lucide-react-native';

import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import GlowButton from '@/components/GlowButton';
import AnimatedPressable from '@/components/AnimatedPressable';
import { getSafeSession } from '@/lib/supabase';
import { Circle, UserTier } from '@/types';
import {
  createCircle,
  deleteCircle,
  describeCircleError,
  getCircleLimits,
  getMyCircles,
  joinCircleByCode,
  leaveCircle,
  normalizeJoinCode,
  shareCircleInvite,
} from '@/lib/circles';

type AuthGate = 'checking' | 'guest' | 'member';

export default function CirclesScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const { state } = useApp();

  const [authGate, setAuthGate] = useState<AuthGate>('checking');
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [nameInput, setNameInput] = useState<string>('');
  const [codeInput, setCodeInput] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [joining, setJoining] = useState<boolean>(false);

  const limits = getCircleLimits(state.tierLevel);
  const atCircleLimit = circles.length >= limits.circles;

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const mine = await getMyCircles();
      setCircles(mine);
    } catch (error) {
      if (__DEV__) {
        console.warn('[Circles] Failed to load circles:', error);
      }
      setLoadError('We couldn’t load your circles. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const session = await getSafeSession();
      if (cancelled) return;
      const isRealUser = !!session?.user && session.user.is_anonymous !== true;
      setAuthGate(isRealUser ? 'member' : 'guest');
      if (isRealUser) {
        await refresh();
      } else {
        setLoading(false);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (creating || !nameInput.trim()) return;
    if (atCircleLimit) {
      Alert.alert(
        'Circle limit reached',
        state.tierLevel >= UserTier.SUPPORT
          ? 'You can belong to 5 circles on your current plan.'
          : 'The free plan includes 1 circle. Upgrade to create more.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See plans', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }

    setCreating(true);
    try {
      const circle = await createCircle(nameInput);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCircles((prev) => [circle, ...prev]);
      setNameInput('');
      Alert.alert(
        'Your circle is ready',
        `“${circle.name}” is private to its members. Share the invite link so others can join — they’ll need the code ${circle.joinCode}.`
      );
    } catch (error) {
      Alert.alert('Couldn’t create your circle', describeCircleError(error));
    } finally {
      setCreating(false);
    }
  }, [atCircleLimit, creating, nameInput, router, state.tierLevel]);

  const handleJoin = useCallback(async () => {
    if (joining) return;
    const code = normalizeJoinCode(codeInput);
    if (code.length !== 6) {
      Alert.alert('Check the code', 'Invite codes are 6 characters, like A1B2C3.');
      return;
    }

    setJoining(true);
    try {
      const circle = await joinCircleByCode(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCircles((prev) => (prev.some((c) => c.id === circle.id) ? prev : [circle, ...prev]));
      setCodeInput('');
      Alert.alert(`You’ve joined “${circle.name}”`, 'Open the Wall tab and switch to this circle to see its prayers.');
    } catch (error) {
      Alert.alert('Couldn’t join', describeCircleError(error));
    } finally {
      setJoining(false);
    }
  }, [codeInput, joining]);

  const handleShare = useCallback(async (circle: Circle) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await shareCircleInvite(circle.name, circle.joinCode);
    } catch {
      Alert.alert('Couldn’t open the share sheet', 'Try again in a moment.');
    }
  }, []);

  const handleLeave = useCallback((circle: Circle) => {
    Alert.alert(
      `Leave “${circle.name}”?`,
      circle.role === 'owner'
        ? 'You lead this circle. Leaving will delete it and every prayer shared inside it. This cannot be undone.'
        : 'You’ll no longer see this circle’s prayers. Members who stay keep everything.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: circle.role === 'owner' ? 'Delete circle' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (circle.role === 'owner') {
                await deleteCircle(circle.id);
              } else {
                await leaveCircle(circle.id);
              }
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setCircles((prev) => prev.filter((c) => c.id !== circle.id));
            } catch (error) {
              Alert.alert('Couldn’t leave the circle', describeCircleError(error));
            }
          },
        },
      ]
    );
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
          colors={[C.background, C.surface, C.background]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              bounces={true}
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <AnimatedPressable
                onPress={() => router.back()}
                style={styles.backBtn}
                scaleValue={0.94}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID="circles-back"
              >
                <ArrowLeft size={22} color={C.textSecondary} />
              </AnimatedPressable>

              <View style={styles.header}>
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>PRAY TOGETHER</Text>
                <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
                  Prayer{'\n'}
                  <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Circles</Text>
                </Text>
                <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>
                  A quiet, private place for the people you actually pray with. Only members can see what’s shared.
                </Text>
                <View style={styles.rule} />
              </View>

              {authGate === 'checking' && (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={C.accent} size="large" />
                </View>
              )}

              {authGate === 'guest' && (
                <View style={styles.gateCard}>
                  <View style={styles.gateIconWrap}>
                    <Lock size={26} color={C.accent} />
                  </View>
                  <Text style={[styles.gateTitle, { fontFamily: Fonts.serifRegular }]}>
                    Circles need an account
                  </Text>
                  <Text style={[styles.gateBody, { fontFamily: Fonts.italic }]}>
                    Sign in with Apple or Google to create a private circle or accept an invitation. Your prayer journey stays exactly as it is.
                  </Text>
                  <GlowButton
                    label="SIGN IN"
                    onPress={() => router.push('/auth')}
                    variant="primary"
                    gradient={[C.accent, C.accentDark]}
                    style={{ width: '100%' }}
                  />
                </View>
              )}

              {authGate === 'member' && (
                <>
                  {/* ── My circles ── */}
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Your circles</Text>
                    <Text style={[styles.sectionMeta, { fontFamily: Fonts.titleLight }]}>
                      {circles.length} of {limits.circles} · {limits.members} members each
                    </Text>
                  </View>

                  {loading && circles.length === 0 && (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator color={C.accent} />
                    </View>
                  )}

                  {loadError && (
                    <View style={styles.errorCard}>
                      <Text style={[styles.errorText, { fontFamily: Fonts.italic }]}>{loadError}</Text>
                      <Pressable onPress={() => void refresh()} style={styles.retryBtn}>
                        <Text style={[styles.retryText, { fontFamily: Fonts.titleBold }]}>TRY AGAIN</Text>
                      </Pressable>
                    </View>
                  )}

                  {!loading && !loadError && circles.length === 0 && (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyIcon}>🕊</Text>
                      <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>
                        No circles yet
                      </Text>
                      <Text style={[styles.emptyBody, { fontFamily: Fonts.italic }]}>
                        Create one for your family, small group, or closest friends — then share the invite link.
                      </Text>
                    </View>
                  )}

                  {circles.map((circle) => (
                    <View key={circle.id} style={styles.circleCard}>
                      <View style={styles.circleCardTop}>
                        <View style={styles.circleNameWrap}>
                          <Text style={[styles.circleName, { fontFamily: Fonts.serifMedium }]} numberOfLines={1}>
                            {circle.name}
                          </Text>
                          <Text style={[styles.circleMeta, { fontFamily: Fonts.titleLight }]}>
                            {circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'} ·{' '}
                            {circle.role === 'owner' ? 'you lead' : 'member'}
                          </Text>
                        </View>
                        <View style={styles.codeChip}>
                          <Text style={[styles.codeChipText, { fontFamily: Fonts.titleBold }]}>
                            {circle.joinCode}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.circleHint, { fontFamily: Fonts.italic }]}>
                        Anyone with this code — or your invite link — can join.
                      </Text>

                      <View style={styles.circleActions}>
                        <AnimatedPressable
                          onPress={() => void handleShare(circle)}
                          style={styles.inviteBtn}
                          scaleValue={0.96}
                          testID={`circles-share-${circle.id}`}
                        >
                          <Share2 size={15} color={C.accent} strokeWidth={2.4} />
                          <Text style={[styles.inviteBtnText, { fontFamily: Fonts.titleBold }]}>
                            SHARE INVITE
                          </Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                          onPress={() => handleLeave(circle)}
                          style={styles.leaveBtn}
                          scaleValue={0.94}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          testID={`circles-leave-${circle.id}`}
                        >
                          {circle.role === 'owner' ? (
                            <Trash2 size={17} color={C.textMuted} />
                          ) : (
                            <LogOut size={17} color={C.textMuted} />
                          )}
                        </AnimatedPressable>
                      </View>
                    </View>
                  ))}

                  {/* ── Create ── */}
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Start a circle</Text>
                  </View>
                  <View style={styles.formCard}>
                    <TextInput
                      style={[styles.input, { fontFamily: Fonts.italic }]}
                      placeholder="Name it — “Family,” “Thursday small group”…"
                      placeholderTextColor={C.textMuted}
                      value={nameInput}
                      onChangeText={setNameInput}
                      maxLength={60}
                      returnKeyType="done"
                    />
                    <GlowButton
                      label={creating ? 'CREATING…' : atCircleLimit ? 'CIRCLE LIMIT REACHED' : 'CREATE CIRCLE'}
                      onPress={() => void handleCreate()}
                      variant="primary"
                      gradient={[C.accent, C.accentDark]}
                      disabled={creating || atCircleLimit || !nameInput.trim()}
                      style={{ width: '100%' }}
                    />
                    {state.tierLevel < UserTier.SUPPORT && (
                      <Text style={[styles.limitNote, { fontFamily: Fonts.italic }]}>
                        Free plan: 1 circle of up to 15. Subscribers can lead 5 circles of 50.
                      </Text>
                    )}
                  </View>

                  {/* ── Join ── */}
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>Join a circle</Text>
                  </View>
                  <View style={styles.formCard}>
                    <TextInput
                      style={[styles.input, styles.codeInput, { fontFamily: Fonts.titleSemiBold }]}
                      placeholder="INVITE CODE"
                      placeholderTextColor={C.textMuted}
                      value={codeInput}
                      onChangeText={(text) => setCodeInput(normalizeJoinCode(text))}
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                    <GlowButton
                      label={joining ? 'JOINING…' : 'JOIN WITH CODE'}
                      onPress={() => void handleJoin()}
                      variant="ghost"
                      disabled={joining || codeInput.length !== 6}
                      style={{ width: '100%' }}
                    />
                    <Text style={[styles.limitNote, { fontFamily: Fonts.italic }]}>
                      Received an invite link? It opens here automatically.
                    </Text>
                  </View>

                  <View style={styles.footerSpacer} />
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 80,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.10)',
    marginBottom: 18,
  },
  header: {
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#B8843A',
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    color: '#1A0F06',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#5A3E22',
    marginTop: 12,
    marginBottom: 4,
  },
  rule: {
    width: 44,
    height: 1.5,
    backgroundColor: '#B8843A',
    opacity: 0.55,
    marginTop: 18,
    marginBottom: 26,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  gateCard: {
    backgroundColor: '#F5EDE2',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.14)',
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  gateIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.12)',
  },
  gateTitle: {
    fontSize: 24,
    color: '#1A0F06',
  },
  gateBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A3E22',
    textAlign: 'center',
  },
  sectionHeader: {
    marginTop: 26,
    marginBottom: 12,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 21,
    color: '#1A0F06',
  },
  sectionMeta: {
    fontSize: 12,
    color: '#7A5A38',
    letterSpacing: 0.3,
  },
  errorCard: {
    backgroundColor: '#F5EDE2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.14)',
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5A3E22',
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#B8843A',
  },
  emptyCard: {
    backgroundColor: '#F5EDE2',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.12)',
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    fontSize: 34,
  },
  emptyTitle: {
    fontSize: 22,
    color: '#1A0F06',
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A3E22',
    textAlign: 'center',
  },
  circleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    padding: 22,
    marginBottom: 14,
  },
  circleCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  circleNameWrap: {
    flex: 1,
    gap: 4,
  },
  circleName: {
    fontSize: 21,
    color: '#1A0F06',
  },
  circleMeta: {
    fontSize: 12,
    color: '#7A5A38',
  },
  codeChip: {
    backgroundColor: 'rgba(180,116,53,0.14)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.30)',
  },
  codeChipText: {
    fontSize: 13,
    letterSpacing: 2,
    color: '#9E6220',
  },
  circleHint: {
    fontSize: 13,
    color: '#7A5A38',
    marginTop: 12,
    marginBottom: 16,
  },
  circleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inviteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(180,116,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.30)',
  },
  inviteBtnText: {
    fontSize: 12,
    letterSpacing: 1.6,
    color: '#9E6220',
  },
  leaveBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,23,10,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    padding: 20,
    gap: 14,
  },
  input: {
    backgroundColor: '#F5EDE2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.12)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1A0F06',
  },
  codeInput: {
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
  },
  limitNote: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7A5A38',
    textAlign: 'center',
  },
  footerSpacer: {
    height: 40,
  },
});
