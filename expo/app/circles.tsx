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
import { Redirect, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Share2, LogOut, Trash2, Lock, Check, Footprints } from 'lucide-react-native';

import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { Fonts } from '@/constants/fonts';
import { FEATURES } from '@/constants/features';
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
import {
  CircleJourney,
  TogetherMember,
  formatPrayerDay,
  getCircleJourney,
  getJourneyRoster,
  isTogetherModeAvailable,
  joinCircleJourney,
  startCircleJourney,
  TOGETHER_DAY_COUNT,
} from '@/lib/journeyTogether';

type AuthGate = 'checking' | 'guest' | 'member';

/* ── Journey Together ──────────────────────────────────────────────────────
 * A circle walking Foundations side by side. Renders nothing at all until
 * the foundations-together migration has run (feature-detected), so the
 * circles screen is untouched for everyone before activation. */

type TogetherPhase = 'checking' | 'hidden' | 'none' | 'active';

function JourneyTogetherSection({ circle }: { circle: Circle }) {
  const router = useRouter();
  const C = useColors();

  const [phase, setPhase] = useState<TogetherPhase>('checking');
  const [journey, setJourney] = useState<CircleJourney | null>(null);
  const [roster, setRoster] = useState<TogetherMember[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const aliveRef = React.useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const available = await isTogetherModeAvailable();
    if (!aliveRef.current) return;
    if (!available) {
      setPhase('hidden');
      return;
    }
    try {
      const active = await getCircleJourney(circle.id);
      if (!aliveRef.current) return;
      if (!active) {
        setJourney(null);
        setRoster([]);
        setPhase('none');
        return;
      }
      setJourney(active);
      const members = await getJourneyRoster(active);
      if (!aliveRef.current) return;
      setRoster(members);
      setPhase('active');
    } catch {
      // Fail silent — circles keep working exactly as before.
      if (aliveRef.current) setPhase('hidden');
    }
  }, [circle.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStart = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await startCircleJourney(circle.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch {
      Alert.alert('Couldn’t start the journey', 'Check your connection and try again in a moment.');
    } finally {
      setBusy(false);
    }
  }, [busy, circle.id, load]);

  const handleJoin = useCallback(async () => {
    if (busy || !journey) return;
    setBusy(true);
    try {
      await joinCircleJourney(journey.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch {
      Alert.alert('Couldn’t join the journey', 'Check your connection and try again in a moment.');
    } finally {
      setBusy(false);
    }
  }, [busy, journey, load]);

  if (phase === 'hidden') return null;

  const me = roster.find((m) => m.isYou) ?? null;
  const walking = roster.length;

  return (
    <View style={styles.togetherWrap}>
      <View style={styles.togetherDivider} />

      {phase === 'checking' && (
        <View style={styles.togetherLoading}>
          <ActivityIndicator color={C.accent} size="small" />
        </View>
      )}

      {phase === 'none' && (
        <>
          <Text style={[styles.togetherTitle, { fontFamily: Fonts.serifMedium }]}>
            Walk Foundations together
          </Text>
          <Text style={[styles.togetherBody, { fontFamily: Fonts.italic }]}>
            Start the 30 days side by side. You will see each other’s day. You can cheer each other on.
            And each person still prays at their own pace.
          </Text>
          <AnimatedPressable
            onPress={() => void handleStart()}
            style={styles.togetherBtn}
            scaleValue={0.96}
            disabled={busy}
            testID={`circles-together-start-${circle.id}`}
          >
            <Footprints size={15} color={C.accent} strokeWidth={2.4} />
            <Text style={[styles.inviteBtnText, { fontFamily: Fonts.titleBold }]}>
              {busy ? 'STARTING…' : 'START FOUNDATIONS TOGETHER'}
            </Text>
          </AnimatedPressable>
        </>
      )}

      {phase === 'active' && journey && (
        <>
          <Text style={[styles.togetherMeta, { fontFamily: Fonts.titleRegular }]}>
            {walking} {walking === 1 ? 'person' : 'people'} walking together · since{' '}
            {formatPrayerDay(journey.startPrayerDay)}
          </Text>

          {!me && (
            <>
              <Text style={[styles.togetherBody, { fontFamily: Fonts.italic }]}>
                Your circle is walking Foundations together. Come join them. Your own day is the one
                that shows. Joining never resets your journey.
              </Text>
              <AnimatedPressable
                onPress={() => void handleJoin()}
                style={styles.togetherBtn}
                scaleValue={0.96}
                disabled={busy}
                testID={`circles-together-join-${circle.id}`}
              >
                <Footprints size={15} color={C.accent} strokeWidth={2.4} />
                <Text style={[styles.inviteBtnText, { fontFamily: Fonts.titleBold }]}>
                  {busy ? 'JOINING…' : 'JOIN THE JOURNEY'}
                </Text>
              </AnimatedPressable>
            </>
          )}

          {me &&
            roster.map((member) => {
              const name = member.displayName ?? (member.isYou ? 'You' : 'Circle member');
              const initial = (member.displayName ?? (member.isYou ? 'Y' : 'C'))
                .trim()
                .charAt(0)
                .toUpperCase();
              return (
                <View key={member.userId} style={styles.rosterRow}>
                  <View style={styles.rosterAvatar}>
                    <Text style={[styles.rosterAvatarText, { fontFamily: Fonts.titleBold }]}>
                      {initial}
                    </Text>
                  </View>
                  <View style={styles.rosterCopy}>
                    <Text style={[styles.rosterName, { fontFamily: Fonts.serifMedium }]} numberOfLines={1}>
                      {name}
                      {member.isYou && member.displayName ? ' · you' : ''}
                    </Text>
                    <Text style={[styles.rosterMeta, { fontFamily: Fonts.titleRegular }]}>
                      {member.hasStarted
                        ? `Day ${member.progress?.currentDay ?? 1} of ${TOGETHER_DAY_COUNT}` +
                          ((member.progress?.currentStreak ?? 0) > 0
                            ? ` · ${member.progress?.currentStreak}-day streak`
                            : '')
                        : 'Not started yet'}
                    </Text>
                  </View>
                  {member.hasStarted &&
                    (member.prayedToday ? (
                      <View style={styles.prayedChip}>
                        <Check size={12} color={C.sageDark} strokeWidth={3} />
                        <Text style={[styles.prayedChipText, { fontFamily: Fonts.titleBold }]}>
                          Prayed today
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.notYetText, { fontFamily: Fonts.italic }]}>
                        Not yet today
                      </Text>
                    ))}
                </View>
              );
            })}

          {me && !me.hasStarted && (
            <AnimatedPressable
              onPress={() => router.push('/session?day=1')}
              style={styles.togetherBtn}
              scaleValue={0.96}
              testID={`circles-together-begin-${circle.id}`}
            >
              <Text style={[styles.inviteBtnText, { fontFamily: Fonts.titleBold }]}>BEGIN DAY 1</Text>
            </AnimatedPressable>
          )}
        </>
      )}
    </View>
  );
}

// Circles are hidden for launch (Posture C) — the screen below stays intact
// and dormant; flipping FEATURES.circles is the only step to bring it back.
export default function CirclesScreen() {
  if (!FEATURES.circles) {
    return <Redirect href="/(tabs)/community" />;
  }
  return <CirclesScreenContent />;
}

function CirclesScreenContent() {
  const router = useRouter();
  const C = useColors();
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
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium, color: C.accent }]}>PRAY TOGETHER</Text>
                <Text style={[styles.title, { fontFamily: Fonts.serifLight, color: C.text }]}>
                  Prayer{'\n'}
                  <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>Circles</Text>
                </Text>
                <Text style={[styles.subtitle, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
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
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>Your circles</Text>
                    <Text style={[styles.sectionMeta, { fontFamily: Fonts.titleLight, color: C.textSecondary }]}>
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

                      <JourneyTogetherSection circle={circle} />
                    </View>
                  ))}

                  {/* ── Join ── */}
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>Join a circle</Text>
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

                  {/* ── Create ── */}
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>Start a circle</Text>
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
                        Free plan: 1 circle of up to 3 people. Partners can lead 10 circles of up to 20 people each.
                      </Text>
                    )}
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
    fontSize: 13.4,
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
    fontSize: 16,
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
    fontSize: 14,
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
    fontSize: 13.4,
    letterSpacing: 2,
    color: '#9E6220',
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
    fontSize: 16,
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
    fontSize: 14,
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
    fontSize: 13.4,
    letterSpacing: 2,
    color: '#9E6220',
  },
  circleHint: {
    fontSize: 14,
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
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(180,116,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.30)',
  },
  inviteBtnText: {
    fontSize: 13.4,
    letterSpacing: 1.6,
    color: '#9E6220',
  },
  leaveBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,23,10,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
  },
  togetherWrap: {
    marginTop: 2,
  },
  togetherDivider: {
    height: 1,
    backgroundColor: 'rgba(36,23,10,0.08)',
    marginTop: 18,
    marginBottom: 16,
  },
  togetherTitle: {
    fontSize: 17,
    color: '#1A0F06',
    marginBottom: 6,
  },
  togetherBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5A3E22',
    marginBottom: 14,
  },
  togetherMeta: {
    fontSize: 14,
    color: '#7A5A38',
    marginBottom: 12,
  },
  togetherBtn: {
    height: 46,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(180,116,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.30)',
  },
  togetherLoading: {
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(36,23,10,0.06)',
  },
  rosterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.30)',
  },
  rosterAvatarText: {
    fontSize: 14,
    color: '#9E6220',
  },
  rosterCopy: {
    flex: 1,
    gap: 2,
  },
  rosterName: {
    fontSize: 16,
    color: '#1A0F06',
  },
  rosterMeta: {
    fontSize: 14,
    color: '#7A5A38',
  },
  prayedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4EFD9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  prayedChipText: {
    fontSize: 13.4,
    letterSpacing: 0.4,
    color: '#4A6643',
  },
  notYetText: {
    fontSize: 14,
    color: '#7A5A38',
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
    fontSize: 16,
    color: '#1A0F06',
  },
  codeInput: {
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
  },
  limitNote: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7A5A38',
    textAlign: 'center',
  },
  footerSpacer: {
    height: 40,
  },
});
