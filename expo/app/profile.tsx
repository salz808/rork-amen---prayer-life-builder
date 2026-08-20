import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Check, LogOut, RefreshCw } from 'lucide-react-native';
import { UserIdentity } from '@supabase/supabase-js';

import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { Fonts } from '@/constants/fonts';
import GlowButton from '@/components/GlowButton';
import AnimatedPressable from '@/components/AnimatedPressable';
import { getSafeSession, supabase } from '@/lib/supabase';
import { DailyPrayerLogEntry } from '@/types';

type AccountState =
  | { phase: 'checking' }
  | { phase: 'guest' }
  | { phase: 'ready'; identities: UserIdentity[]; isAnonymous: boolean };

function computeLongestStreak(log: DailyPrayerLogEntry[]): number {
  const dates = Array.from(new Set(log.map((entry) => entry.date))).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;

  for (const date of dates) {
    if (prev !== null) {
      const diffDays = Math.round(
        (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime()) /
          86400000
      );
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = date;
  }

  return longest;
}

function formatPrayerTime(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const C = useColors();
  const { state, updateDisplayName } = useApp();

  const [account, setAccount] = useState<AccountState>({ phase: 'checking' });
  const [nameInput, setNameInput] = useState<string>(state.user?.displayName ?? '');
  const [savingName, setSavingName] = useState<boolean>(false);
  const [amensGiven, setAmensGiven] = useState<number | null>(null);

  const daysCompleted = useMemo(
    () => state.progress.filter((p) => p.completed).length,
    [state.progress]
  );
  const longestStreak = useMemo(
    () => computeLongestStreak(state.dailyPrayerLog ?? []),
    [state.dailyPrayerLog]
  );
  const prayerTimeLabel = useMemo(() => {
    const totalSeconds = (state.phaseLog ?? []).reduce(
      (sum, entry) => sum + (entry.seconds ?? 0),
      0
    );
    const minutes = Math.round(totalSeconds / 60);
    return minutes < 60 ? `${minutes} min` : `${formatPrayerTime(totalSeconds)} hr`;
  }, [state.phaseLog]);
  const answeredCount = state.answeredPrayers?.length ?? 0;
  const reflectionsCount = state.reflections?.length ?? 0;

  const savedName = state.user?.displayName ?? '';
  const nameDirty = nameInput.trim().length > 0 && nameInput.trim() !== savedName;

  const loadAccount = useCallback(async (): Promise<void> => {
    const session = await getSafeSession();
    if (!session?.user) {
      setAccount({ phase: 'guest' });
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setAccount({
        phase: 'ready',
        identities: data?.identities ?? [],
        isAnonymous: session.user.is_anonymous === true,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[Profile] Failed to load identities:', error);
      }
      setAccount({
        phase: 'ready',
        identities: [],
        isAnonymous: session.user.is_anonymous === true,
      });
    }

    try {
      const { count, error } = await supabase
        .from('community_amens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      if (!error && typeof count === 'number') {
        setAmensGiven(count);
      }
    } catch {
      // Amens count is optional — profile stays useful without it.
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || savingName) return;

    setSavingName(true);
    try {
      updateDisplayName(trimmed);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSavingName(false);
    }
  }, [nameInput, savingName, updateDisplayName]);

  const handleUnlink = useCallback(
    (identity: UserIdentity) => {
      if (account.phase !== 'ready') return;

      if (account.identities.length <= 1) {
        Alert.alert(
          'Keep at least one account',
          'Add another sign-in method before removing this one, so you don’t get locked out.'
        );
        return;
      }

      Alert.alert(
        `Remove ${identity.provider === 'apple' ? 'Apple' : 'Google'} sign-in?`,
        'You’ll no longer be able to sign in with this account. Your progress stays on your other sign-in method.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                const { error } = await supabase.auth.unlinkIdentity(identity);
                if (error) throw error;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                await loadAccount();
              } catch (error) {
                if (__DEV__) {
                  console.warn('[Profile] Unlink failed:', error);
                }
                Alert.alert('Couldn’t remove that account', 'Please try again in a moment.');
              }
            },
          },
        ]
      );
    },
    [account, loadAccount]
  );

  const stats = [
    { label: 'DAYS COMPLETED', value: `${daysCompleted}` },
    { label: 'CURRENT STREAK', value: `${state.streakCount}` },
    { label: 'LONGEST STREAK', value: `${longestStreak}` },
    { label: 'TIME IN PRAYER', value: prayerTimeLabel },
    { label: 'ANSWERED PRAYERS', value: `${answeredCount}` },
    {
      label: 'AMENS GIVEN',
      value: amensGiven === null ? '—' : `${amensGiven}`,
    },
    { label: 'REFLECTIONS', value: `${reflectionsCount}` },
    { label: 'JOURNEY PASSES', value: `${state.journeyPass}` },
  ];

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
                testID="profile-back"
              >
                <ArrowLeft size={22} color={C.textSecondary} />
              </AnimatedPressable>

              <View style={styles.header}>
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR PROFILE</Text>
                <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
                  The story{'\n'}
                  <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>
                    God is writing
                  </Text>
                </Text>
                <View style={styles.rule} />
              </View>

              {/* ── Statistics ── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>
                  Prayer statistics
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic }]}>
                  A quiet record of faithfulness — never a scorecard.
                </Text>
              </View>
              <View style={styles.statsGrid}>
                {stats.map((stat) => (
                  <View key={stat.label} style={styles.statCard}>
                    <Text style={[styles.statValue, { fontFamily: Fonts.serifMedium }]}>
                      {stat.value}
                    </Text>
                    <Text style={[styles.statLabel, { fontFamily: Fonts.titleSemiBold }]}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* ── Display name ── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>
                  Display name
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic }]}>
                  How you appear inside your private prayer circles.
                </Text>
              </View>
              <View style={styles.formCard}>
                <TextInput
                  style={[styles.input, { fontFamily: Fonts.italic }]}
                  placeholder={state.user?.firstName || 'Your name'}
                  placeholderTextColor={C.textMuted}
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSaveName()}
                />
                <GlowButton
                  label={savingName ? 'SAVING…' : 'SAVE NAME'}
                  onPress={() => void handleSaveName()}
                  variant="primary"
                  gradient={[C.accent, C.accentDark]}
                  disabled={!nameDirty || savingName}
                  style={{ width: '100%' }}
                />
              </View>

              {/* ── Linked accounts ── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium }]}>
                  Sign-in accounts
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic }]}>
                  The Apple or Google accounts that open this profile.
                </Text>
              </View>

              {account.phase === 'checking' && (
                <View style={styles.accountLoading}>
                  <ActivityIndicator color={C.accent} />
                </View>
              )}

              {account.phase === 'guest' && (
                <View style={styles.formCard}>
                  <Text style={[styles.guestTitle, { fontFamily: Fonts.serifRegular }]}>
                    Praying as a guest
                  </Text>
                  <Text style={[styles.guestBody, { fontFamily: Fonts.italic }]}>
                    Your journey lives on this device only. Sign in to save it to the cloud and unlock private circles.
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

              {account.phase === 'ready' && (
                <View style={styles.formCard}>
                  {account.isAnonymous && (
                    <View style={styles.anonCard}>
                      <Text style={[styles.anonTitle, { fontFamily: Fonts.serifRegular }]}>
                        Guest account
                      </Text>
                      <Text style={[styles.anonBody, { fontFamily: Fonts.italic }]}>
                        You’ve been praying under a temporary account. Sign in with Apple or Google
                        to keep everything — your journey, amens, and circles — under one permanent login.
                      </Text>
                    </View>
                  )}

                  {account.identities.length > 0 ? (
                    account.identities.map((identity) => {
                      const providerLabel =
                        identity.provider === 'apple' ? 'Apple' : identity.provider === 'google' ? 'Google' : identity.provider;
                      const email =
                        (identity.identity_data?.email as string | undefined) ??
                        (identity.identity_data?.full_name as string | undefined) ??
                        '';
                      const canUnlink = account.identities.length > 1;
                      return (
                        <View key={identity.id} style={styles.identityRow}>
                          <View style={styles.identityInfo}>
                            <Text style={[styles.identityProvider, { fontFamily: Fonts.titleSemiBold }]}>
                              {providerLabel}
                            </Text>
                            {email ? (
                              <Text
                                style={[styles.identityEmail, { fontFamily: Fonts.titleLight }]}
                                numberOfLines={1}
                              >
                                {email}
                              </Text>
                            ) : null}
                          </View>
                          {canUnlink ? (
                            <AnimatedPressable
                              onPress={() => handleUnlink(identity)}
                              style={styles.unlinkBtn}
                              scaleValue={0.94}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              testID={`profile-unlink-${identity.provider}`}
                            >
                              <LogOut size={16} color={C.textMuted} />
                            </AnimatedPressable>
                          ) : (
                            <View style={styles.onlyAccountBadge}>
                              <Check size={13} color={C.sageDark} strokeWidth={2.6} />
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={[styles.noIdentities, { fontFamily: Fonts.italic }]}>
                      We couldn’t load your sign-in methods right now.
                    </Text>
                  )}

                  <AnimatedPressable
                    onPress={() => void loadAccount()}
                    style={styles.refreshRow}
                    scaleValue={0.96}
                  >
                    <RefreshCw size={13} color={C.textMuted} />
                    <Text style={[styles.refreshText, { fontFamily: Fonts.titleMedium }]}>
                      REFRESH ACCOUNTS
                    </Text>
                  </AnimatedPressable>
                </View>
              )}

              <View style={styles.footerSpacer} />
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
  rule: {
    width: 44,
    height: 1.5,
    backgroundColor: '#B8843A',
    opacity: 0.55,
    marginTop: 18,
    marginBottom: 24,
  },
  sectionHeader: {
    marginTop: 26,
    marginBottom: 12,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 21,
    color: '#1A0F06',
  },
  sectionMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7A5A38',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 30,
    color: '#1A0F06',
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.6,
    color: '#7A5A38',
    textAlign: 'center',
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
  guestTitle: {
    fontSize: 22,
    color: '#1A0F06',
    textAlign: 'center',
  },
  guestBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A3E22',
    textAlign: 'center',
  },
  accountLoading: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  anonCard: {
    backgroundColor: 'rgba(180,116,53,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.22)',
    padding: 16,
    gap: 8,
  },
  anonTitle: {
    fontSize: 19,
    color: '#1A0F06',
  },
  anonBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5A3E22',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5EDE2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  identityInfo: {
    flex: 1,
    gap: 2,
  },
  identityProvider: {
    fontSize: 15,
    color: '#1A0F06',
  },
  identityEmail: {
    fontSize: 12,
    color: '#7A5A38',
  },
  unlinkBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,23,10,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
  },
  onlyAccountBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,128,85,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(94,128,85,0.30)',
  },
  noIdentities: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7A5A38',
    textAlign: 'center',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  refreshText: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#7A5A38',
  },
  footerSpacer: {
    height: 40,
  },
});
