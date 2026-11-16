import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getSafeSession, supabase } from '@/lib/supabase';
import {
  isValidEmail,
  normalizeEmail,
  parseRecoveryUrl,
  RESET_PASSWORD_REDIRECT_URL,
  validateResetPassword,
  type RecoveryCredentials,
} from '@/lib/emailAuth';
import { reportError } from '@/lib/crashReporter';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import { useColors } from '@/hooks/useColors';
import BackgroundGradient from '@/components/BackgroundGradient';
import RadialGlow from '@/components/RadialGlow';
import GlowButton from '@/components/GlowButton';
import { useApp } from '@/providers/AppProvider';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

type ResetStatus = 'verifying' | 'ready' | 'invalid';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const T = useTypography();
  const C = useColors();
  const styles = useMemo(() => createStyles(T, C), [T, C]);
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const incomingUrl = Linking.useURL();
  const { signOut } = useApp();

  const [status, setStatus] = useState<ResetStatus>('verifying');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [resendEmail, setResendEmail] = useState<string>('');
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resending, setResending] = useState<boolean>(false);

  // The recovery link's credentials are single-use: exchanging the
  // same code twice fails, so each distinct link is attempted at most
  // once. The key is the credential itself (or the link URL), not a
  // one-shot flag — a second, different link arriving while this
  // screen is mounted must still be attempted.
  const attemptedKeyRef = useRef<string | null>(null);
  const initialUrlRef = useRef<string | null>(null);
  const [initialUrlReady, setInitialUrlReady] = useState<boolean>(false);

  // The link URL arrives two ways: useURL() covers a warm start (the
  // app was already running when the link arrived); getInitialURL()
  // covers a cold start. Either can be null when the route was opened
  // by hand with no link at all.
  useEffect(() => {
    let cancelled = false;
    void Linking.getInitialURL().then((initial) => {
      if (cancelled) return;
      initialUrlRef.current = initial;
      setInitialUrlReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const establishSession = useCallback(async (credentials: RecoveryCredentials | null): Promise<void> => {
    try {
      if (!supabase) {
        setStatus('invalid');
        return;
      }
      if (!credentials || credentials.kind === 'error') {
        setStatus('invalid');
        return;
      }
      if (credentials.kind === 'code') {
        const { error } = await supabase.auth.exchangeCodeForSession(credentials.code);
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.setSession({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
        });
        if (error) throw error;
      }
      // The link alone is not proof: confirm a real user session
      // exists, and that it is not an anonymous one — a recovery link
      // never belongs to a guest.
      const session = await getSafeSession();
      if (!session?.user || session.user.is_anonymous === true) {
        throw new Error('Recovery session did not establish a user.');
      }
      setStatus('ready');
    } catch (e) {
      if (__DEV__) {
        console.error('Password reset link error', e);
      }
      reportError('[ResetPassword]', e, { flow: 'recovery-link' });
      setStatus('invalid');
    }
  }, []);

  useEffect(() => {
    const codeParam = typeof params.code === 'string' ? params.code : undefined;
    const errorParam = typeof params.error === 'string' ? params.error : undefined;
    const errorDescParam =
      typeof params.error_description === 'string' ? params.error_description : undefined;

    // Route params (PKCE code / error) arrive with the navigation
    // itself — no need to wait for the link URL.
    if (codeParam || errorParam) {
      const key = codeParam ? `code:${codeParam}` : `error:${errorParam}`;
      if (attemptedKeyRef.current === key) return;
      attemptedKeyRef.current = key;
      const credentials: RecoveryCredentials | null = codeParam
        ? { kind: 'code', code: codeParam }
        : errorParam
          ? { kind: 'error', error: errorParam, description: errorDescParam ?? null }
          : null;
      void establishSession(credentials);
      return;
    }
    // Otherwise the credentials live in the link URL (implicit-flow
    // tokens in the fragment). Wait until both URL sources have had a
    // chance to resolve before concluding the link carries nothing.
    if (incomingUrl === null && !initialUrlReady) return;
    const candidate = incomingUrl ?? initialUrlRef.current;
    if (candidate !== null && attemptedKeyRef.current === candidate) return;
    attemptedKeyRef.current = candidate;
    void establishSession(parseRecoveryUrl(candidate));
  }, [params.code, params.error, params.error_description, incomingUrl, initialUrlReady, establishSession]);

  const handleUpdatePassword = async () => {
    const validationError = validateResetPassword(newPassword, confirmPassword);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    if (!supabase) {
      setFormError('Password reset is not available right now. Please try again in a moment.');
      return;
    }
    try {
      setSubmitting(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // The recovery session exists only to set the new password.
      // Sign out through AppProvider — the same full sign-out as any
      // other session end, so no account state is left on disk — and
      // land on sign-in, where the new password can be used right
      // away. That also proves the new password works.
      await signOut();
      Alert.alert('Password updated', 'Your password is updated. Sign in with your new password.');
    } catch (e) {
      if (__DEV__) {
        console.error('Password update error', e);
      }
      setFormError('We could not update your password. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResendError(null);
    setResendNotice(null);
    if (!isValidEmail(resendEmail)) {
      setResendError('Please enter a valid email address.');
      return;
    }
    if (!supabase) {
      setResendError('Password reset is not available right now. Please try again in a moment.');
      return;
    }
    try {
      setResending(true);
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(resendEmail), {
        redirectTo: RESET_PASSWORD_REDIRECT_URL,
      });
      if (error) throw error;
      setResendNotice(`Check your email — we sent a reset link to ${normalizeEmail(resendEmail)}.`);
    } catch (e) {
      if (__DEV__) {
        console.error('Password reset resend error', e);
      }
      setResendError('We could not send a reset email right now. Please try again in a moment.');
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <BackgroundGradient style={StyleSheet.absoluteFill} />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.glowWrap}>
            <RadialGlow size={400} maxOpacity={0.15} />
          </View>

          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.centerWrap}>
              <View style={styles.header}>
                <Image
                  source={require('../../assets/images/triad-prayer-logo.png')}
                  style={styles.brandLogo}
                  resizeMode="contain"
                  accessibilityLabel="TRIAD Prayer"
                />
                <Text style={[styles.tagline, { fontFamily: Fonts.italic }]}>
                  God is <Text style={{ fontFamily: Fonts.italic, fontWeight: 'bold', fontStyle: 'italic', color: C.accent }}>much closer</Text> than you think.
                </Text>
              </View>

              <View style={styles.authBox}>
                <Text style={[styles.boxTitle, { fontFamily: Fonts.titleMedium }]}>RESET YOUR PASSWORD</Text>

                {status === 'verifying' ? (
                  <View style={styles.verifyingWrap}>
                    <ActivityIndicator color={C.accent} size="large" />
                    <Text style={[styles.boxDesc, { fontFamily: Fonts.serifRegular }]}>
                      Checking your reset link…
                    </Text>
                  </View>
                ) : null}

                {status === 'ready' ? (
                  <>
                    <Text style={[styles.boxDesc, { fontFamily: Fonts.serifRegular }]}>
                      Choose a new password for your account. It needs at least 8 characters.
                    </Text>
                    <View style={styles.actions}>
                      <TextInput
                        style={styles.emailInput}
                        placeholder="New password"
                        placeholderTextColor={C.textFaint}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!submitting}
                        returnKeyType="next"
                      />
                      <TextInput
                        style={styles.emailInput}
                        placeholder="Confirm new password"
                        placeholderTextColor={C.textFaint}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!submitting}
                        returnKeyType="go"
                        onSubmitEditing={() => void handleUpdatePassword()}
                      />
                      {formError ? (
                        <Text style={styles.emailError}>{formError}</Text>
                      ) : null}
                      <GlowButton
                        label={submitting ? 'UPDATING…' : 'UPDATE PASSWORD'}
                        onPress={handleUpdatePassword}
                        variant="ghost"
                        disabled={submitting}
                        style={{ width: '100%' }}
                        textStyle={{ color: '#F4EDE0' }}
                      />
                      <Pressable
                        style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
                        onPress={() => router.replace('/auth')}
                      >
                        <Text style={[styles.skipText, { fontFamily: Fonts.titleRegular }]}>Back to sign in</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                {status === 'invalid' ? (
                  <>
                    <Text style={[styles.boxDesc, { fontFamily: Fonts.serifRegular }]}>
                      This reset link is no longer valid. Links expire after a while, or may have already been used. Enter your email below and we&apos;ll send a fresh one.
                    </Text>
                    <View style={styles.actions}>
                      <TextInput
                        style={styles.emailInput}
                        placeholder="Email address"
                        placeholderTextColor={C.textFaint}
                        value={resendEmail}
                        onChangeText={setResendEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        editable={!resending}
                        returnKeyType="go"
                        onSubmitEditing={() => void handleResend()}
                      />
                      {resendError ? (
                        <Text style={styles.emailError}>{resendError}</Text>
                      ) : null}
                      {resendNotice ? (
                        <Text style={styles.emailNotice}>{resendNotice}</Text>
                      ) : null}
                      <GlowButton
                        label={resending ? 'SENDING…' : 'SEND A NEW LINK'}
                        onPress={handleResend}
                        variant="ghost"
                        disabled={resending}
                        style={{ width: '100%' }}
                        textStyle={{ color: '#F4EDE0' }}
                      />
                      <Pressable
                        style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
                        onPress={() => router.replace('/auth')}
                      >
                        <Text style={[styles.skipText, { fontFamily: Fonts.titleRegular }]}>Back to sign in</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { fontFamily: Fonts.serifRegular }]}>
                By signing in, you agree to our Terms of Service & Privacy Policy.
              </Text>
            </View>
          </ScrollView>

          {submitting && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={C.accent} size="large" />
            </View>
          )}
        </SafeAreaView>
      </View>
    </>
  );
}

const createStyles = (T: any, C: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0804',
  },
  safeArea: {
    flex: 1,
  },
  glowWrap: {
    position: 'absolute',
    top: -100,
    alignSelf: 'center',
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  brandLogo: {
    width: 196,
    height: 83,
    marginBottom: 20,
  },
  tagline: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textMuted,
    textAlign: 'center',
  },
  authBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
  },
  boxTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: 4,
    color: C.accent,
    textAlign: 'center',
    marginBottom: 16,
  },
  boxDesc: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  verifyingWrap: {
    alignItems: 'center',
    gap: 24,
    paddingVertical: 24,
  },
  actions: {
    gap: 16,
  },
  emailInput: {
    backgroundColor: 'rgba(244,237,224,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(244,237,224,0.15)',
    borderRadius: 18,
    height: 58,
    paddingHorizontal: 18,
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    color: '#F4EDE0',
  },
  emailError: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    color: '#E89A8A',
    textAlign: 'center',
  },
  emailNotice: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    color: C.textSecondary,
    textAlign: 'center',
  },
  skipBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    color: 'rgba(244,237,224,0.8)',
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  skipBtnPressed: {
    opacity: 0.6,
  },
  footer: {
    paddingHorizontal: 8,
    paddingTop: 24,
  },
  footerText: {
    fontSize: T.size.body,
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    lineHeight: T.leading.body,
  },
  loadingOverlay: {
    ...absoluteFillObject,
    backgroundColor: 'rgba(13,8,4,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
