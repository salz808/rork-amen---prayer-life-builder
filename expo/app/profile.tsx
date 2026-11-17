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
import BackgroundGradient from '@/components/BackgroundGradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Check, LogOut, RefreshCw } from 'lucide-react-native';
import { UserIdentity } from '@supabase/supabase-js';

import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import GlowButton from '@/components/GlowButton';
import AnimatedPressable from '@/components/AnimatedPressable';
import InsightsView from '@/components/InsightsView';
import { getSafeSession, supabase } from '@/lib/supabase';
import { reportError } from '@/lib/crashReporter';

type AccountState =
  | { phase: 'checking' }
  | { phase: 'guest' }
  | { phase: 'ready'; identities: UserIdentity[]; isAnonymous: boolean };

// P1-3: Math.round(totalSeconds / 60) showed "0" for any real prayer
// under 30s — a 20-second session read as no prayer at all. A nonzero
// total that rounds to 0 reads "<1": honest about sub-minute prayer
// without overstating it as a full minute. Zero stays "0".
export function formatPrayerMinutes(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0';
  const minutes = Math.round(totalSeconds / 60);
  return minutes === 0 ? '<1' : `${minutes}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, updateDisplayName } = useApp();

  const [account, setAccount] = useState<AccountState>({ phase: 'checking' });
  const [nameInput, setNameInput] = useState<string>(state.user?.displayName ?? '');
  const [savingName, setSavingName] = useState<boolean>(false);

  const daysCompleted = useMemo(
    () => state.progress.filter((p) => p.completed).length,
    [state.progress]
  );
  // Finding 09: the unit lives in the label, the number stays bare
  // ("0 min" vs plain "0" was inconsistent). Always minutes — the
  // tile reads Minutes in prayer whatever the total.
  const prayerTime = useMemo(() => {
    const totalSeconds = (state.phaseLog ?? []).reduce(
      (sum, entry) => sum + (entry.seconds ?? 0),
      0
    );
    const minutes = formatPrayerMinutes(totalSeconds);
    return { value: minutes, label: 'Minutes in prayer' };
  }, [state.phaseLog]);
  const answeredCount = state.answeredPrayers?.length ?? 0;

  const savedName = state.user?.displayName ?? '';
  const nameDirty = nameInput.trim().length > 0 && nameInput.trim() !== savedName;

  const loadAccount = useCallback(async (): Promise<void> => {
    const session = await getSafeSession();
    if (!session?.user) {
      setAccount({ phase: 'guest' });
      return;
    }

    // Unconfigured client: no remote identities.
    // getSafeSession already returns null when unconfigured, so this
    // is a defensive guard; the profile still renders local stats with
    // an empty linked-accounts list.
    if (!supabase) {
      setAccount({
        phase: 'ready',
        identities: [],
        isAnonymous: session.user.is_anonymous === true,
      });
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
      // C-3: production-silent before — the profile rendered with no
      // identities and nothing diagnosable was recorded.
      reportError('ProfileLoadFailed', error, { label: 'identities' });
      setAccount({
        phase: 'ready',
        identities: [],
        isAnonymous: session.user.is_anonymous === true,
      });
    }

  }, []);

  useEffect(() => {
    // C-7: mount data load — loadAccount sets state only after awaits
    // (session + queries), never synchronously in the effect body. The
    // effect is the correct pattern for a mount load; the directive
    // suppresses the heuristic, it does not hide a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        `Remove ${identity.provider === 'apple' ? 'Apple' : identity.provider === 'google' ? 'Google' : identity.provider === 'email' ? 'Email' : identity.provider} sign-in?`,
        'You’ll no longer be able to sign in with this account. Your progress stays on your other sign-in method.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Unconfigured client: surface the existing unlink-failure
              // alert instead of throwing; nothing is removed.
              if (!supabase) {
                Alert.alert('Couldn’t remove that account', 'Sign-in accounts are not available right now. Please try again in a moment.');
                return;
              }
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

  // Decision 4 (2026-11-14): three tiles only — the quiet record, not
  // a scorecard. Streaks, amens, reflections and journey passes are
  // no longer shown here.
  const stats = [
    { label: 'Days completed', value: `${daysCompleted}` },
    { label: prayerTime.label, value: prayerTime.value },
    { label: 'Answered prayers', value: `${answeredCount}` },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <BackgroundGradient
          colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]}
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
                accessibilityLabel="Back"
                accessibilityRole="button"
              >
                <ArrowLeft size={22} color={C.textSecondary} />
              </AnimatedPressable>

              <View style={styles.header}>
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium, color: C.accent }]}>YOUR PROFILE</Text>
                {/* P1-5: was one <Text> with a nested <Text> for the
                    second line ("The story{'\n'}<Text>God is
                    writing</Text>") — a nested-Text suspect for the
                    red "Text strings must be rendered within a
                    <Text>" LogBox. Two sibling <Text>s now, same
                    styles per line, same line break (each line is
                    its own line box at the same lineHeight). This
                    is a correlation fix, not a diagnosis. */}
                <Text style={[styles.title, { fontFamily: Fonts.serifMedium, color: C.text }]}>
                  The story
                </Text>
                <Text style={[styles.title, { fontFamily: Fonts.italic, color: C.accentDark }]}>
                  God is writing
                </Text>
                <View style={[styles.rule, { backgroundColor: C.accent }]} />
              </View>

              {/* Arena audit A2 — Profile had no route back to prayer.
                  Primary PRAY TODAY button, same go-home pattern as
                  session/auth (router.replace('/')). */}
              <GlowButton
                label="PRAY TODAY"
                variant="primary"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.replace('/');
                }}
                style={styles.prayTodayBtn}
                testID="profile-pray-today"
              />

              {/* ── Your Journey ── */}
              {/* Finding 73: Your Journey lives here, prominent — first
                  section after the header, not buried as account
                  analytics. */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>
                  Your Journey
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
                  How your prayer life is unfolding. No scores, just the story so far.
                </Text>
              </View>
              <InsightsView />

              {/* ── Statistics ── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>
                  Prayer statistics
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
                  A quiet record of faithfulness, all time, never a scorecard.
                </Text>
              </View>
              <View style={styles.statsGrid}>
                {stats.map((stat) => (
                  <View key={stat.label} style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <Text style={[styles.statValue, { fontFamily: Fonts.titleSemiBold, color: C.text }]}>
                      {stat.value}
                    </Text>
                    <Text style={[styles.statLabel, { fontFamily: Fonts.titleSemiBold, color: C.textSecondary }]}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* ── Display name ── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>
                  Display name
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
                  {'The name shown with what you share.'}
                </Text>
              </View>
              <View style={[styles.formCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                <TextInput
                  style={[styles.input, { fontFamily: Fonts.titleMedium, backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]}
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
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifMedium, color: C.text }]}>
                  Sign-in accounts
                </Text>
                <Text style={[styles.sectionMeta, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
                  The accounts that open this profile.
                </Text>
              </View>

              {account.phase === 'checking' && (
                <View style={styles.accountLoading}>
                  <ActivityIndicator color={C.accent} />
                </View>
              )}

              {account.phase === 'guest' && (
                <View style={[styles.formCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Text style={[styles.guestTitle, { fontFamily: Fonts.serifRegular, color: C.text }]}>
                    Praying as a guest
                  </Text>
                  <Text style={[styles.guestBody, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>
                    {'Your journey lives on this device only. Sign in to save it to the cloud.'}
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
                <View style={[styles.formCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  {account.isAnonymous && (
                    <View style={[styles.anonCard, { backgroundColor: C.accentBg, borderColor: C.border }]}>
                      <Text style={[styles.anonTitle, { fontFamily: Fonts.serifRegular, color: C.text }]}>
                        Guest account
                      </Text>
                      <Text style={[styles.anonBody, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>
                        You have been praying as a guest. Sign in with Apple, Google, or email.
                        Keep your journey and your amens in one place.
                      </Text>
                    </View>
                  )}

                  {account.identities.length > 0 ? (
                    account.identities.map((identity) => {
                      const providerLabel =
                        identity.provider === 'apple' ? 'Apple' : identity.provider === 'google' ? 'Google' : identity.provider === 'email' ? 'Email' : identity.provider;
                      const email =
                        (identity.identity_data?.email as string | undefined) ??
                        (identity.identity_data?.full_name as string | undefined) ??
                        '';
                      const canUnlink = account.identities.length > 1;
                      return (
                        <View key={identity.id} style={[styles.identityRow, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                          <View style={styles.identityInfo}>
                            <Text style={[styles.identityProvider, { fontFamily: Fonts.titleSemiBold, color: C.text }]}>
                              {providerLabel}
                            </Text>
                            {email ? (
                              <Text
                                style={[styles.identityEmail, { fontFamily: Fonts.titleLight, color: C.textSecondary }]}
                                numberOfLines={1}
                              >
                                {email}
                              </Text>
                            ) : null}
                          </View>
                          {/* F-11: sage was a second accent as chrome — the
                              only-account badge below now uses amber tokens. */}
                          {canUnlink ? (
                            <AnimatedPressable
                              onPress={() => handleUnlink(identity)}
                              style={[styles.unlinkBtn, { backgroundColor: C.overlayLight, borderColor: C.border }]}
                              scaleValue={0.94}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              testID={`profile-unlink-${identity.provider}`}
                              accessibilityLabel={`Remove ${providerLabel} sign-in`}
                              accessibilityRole="button"
                            >
                              <LogOut size={16} color={C.textMuted} />
                            </AnimatedPressable>
                          ) : (
                            <View style={[styles.onlyAccountBadge, { backgroundColor: C.accentBg, borderColor: C.dayChipTodayBorder }]}>
                              <Check size={13} color={C.accentDark} strokeWidth={2.6} />
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={[styles.noIdentities, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>
                      We couldn’t load your sign-in methods right now.
                    </Text>
                  )}

                  <AnimatedPressable
                    onPress={() => void loadAccount()}
                    style={styles.refreshRow}
                    scaleValue={0.96}
                  >
                    <RefreshCw size={13} color={C.textMuted} />
                    <Text style={[styles.refreshText, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>
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

const createStyles = (C: any, T: any) => StyleSheet.create({
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
    // Arena (e): plain chevron, no filled disc — the 44pt hit area
    // (+ hitSlop) carries the tap target, not a background.
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // Arena audit C3 — 8px spacing system: was 18, now 16.
    marginBottom: 16,
  },
  header: {
    marginBottom: 0,
  },
  eyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase',
    // Arena audit D2 — light-theme leak: was hardcoded #B8843A.
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  rule: {
    width: 44,
    height: 1.5,
    // Arena audit D2 — light-theme leak: was hardcoded #B8843A.
    backgroundColor: C.accent,
    opacity: 0.55,
    marginTop: 18,
    // Finding 09: consistent vertical rhythm — header-to-first-section
    // now matches the section-to-section gap (rule 12 + sectionHeader
    // 24 = 36, same as sectionHeader marginBottom 12 + marginTop 24).
    marginBottom: 12,
  },
  // Arena audit A2 — primary route back to prayer from Profile.
  prayTodayBtn: {
    width: '100%',
    marginTop: 12,
    marginBottom: 4,
  },
  sectionHeader: {
    // Arena audit C3 — 8px spacing system: was 26, now 24.
    marginTop: 24,
    marginBottom: 12,
    gap: 4,
  },
  sectionTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  sectionMeta: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    // Arena audit D4 — light-theme leak: was hardcoded #7A5A38.
    color: C.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    // Decision 4 (2026-11-14): three tiles, one row — ~31% each plus
    // the 12px gaps, flexGrow takes up the slack.
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    // Finding 09: the number/label block sits vertically centered in
    // the card instead of riding high with a dead gap above the label.
    justifyContent: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: T.size.number,
    lineHeight: T.leading.number,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  statLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    // Arena audit D4 — light-theme leak: was hardcoded #7A5A38.
    color: C.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    padding: 20,
    // Arena audit C3 — 8px spacing system: was 14, now 16.
    gap: 16,
  },
  input: {
    backgroundColor: '#F5EDE2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.12)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  guestTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
    textAlign: 'center',
  },
  guestBody: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #5A3E22.
    color: C.textSecondary,
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
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  anonBody: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #5A3E22.
    color: C.textSecondary,
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
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #1A0F06.
    color: C.text,
  },
  identityEmail: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #7A5A38.
    color: C.textSecondary,
  },
  unlinkBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,23,10,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
  },
  onlyAccountBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.45)',
  },
  noIdentities: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    // Arena audit D4 — light-theme leak: was hardcoded #7A5A38.
    color: C.textSecondary,
    textAlign: 'center',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    minHeight: 44,
  },
  refreshText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    // Arena audit D4 — light-theme leak: was hardcoded #7A5A38.
    color: C.textSecondary,
  },
  footerSpacer: {
    height: 40,
  },
});
