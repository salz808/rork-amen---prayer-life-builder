import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getSafeSession, hasAnonymousSession, isIdentityConflictError, supabase } from '@/lib/supabase';
import { reportError } from '@/lib/crashReporter';
import { DatabaseService } from '@/lib/database';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';
import { Chrome as Google } from 'lucide-react-native';
import GlowButton from '@/components/GlowButton';
import { useApp } from '@/providers/AppProvider';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

export default function AuthScreen() {
  const router = useRouter();
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  const [loading, setLoading] = useState<boolean>(false);
  const { dismissCloudPrompt } = useApp();

  // Audit must-fix #5: the Prayer Wall is a public social feed rated 13+,
  // but no sign-up path asked the user's age. This is the gate: no
  // account-creating sign-in starts until the user attests 13+ on this
  // device, and the attestation is recorded on the profile server-side
  // via the record_age_attestation RPC — but ONLY when the modal was
  // actually confirmed this session (round 4, AUTH-2/AUTH-3).
  // "Maybe later" stays open for under-13s: local-only use, no account,
  // no wall posting. The ref is the guard's source of truth so the modal
  // confirm can immediately re-run the pending sign-in.
  const AGE_ATTESTATION_KEY = 'triad_age_attested_v1';
  const [ageAttested, setAgeAttested] = useState<boolean>(false);
  const attestedRef = useRef<boolean>(false);
  const [showAgeGate, setShowAgeGate] = useState<boolean>(false);
  const [pendingProvider, setPendingProvider] = useState<'apple' | 'google' | null>(null);

  // Audit round 4, AUTH-3: the auth screen is for guests and anonymous
  // upgraders, not account switching. A signed-in, non-anonymous user who
  // lands here (deep link, back navigation) is sent home — otherwise a
  // second account could sign in on top of the first and inherit the
  // first account's device attestation flag.
  useEffect(() => {
    void (async () => {
      try {
        const session = await getSafeSession();
        if (session?.user && session.user.is_anonymous !== true) {
          router.replace('/');
        }
      } catch {
        // Session unreadable: stay on the auth screen (safe default).
      }
    })();
  }, [router]);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(AGE_ATTESTATION_KEY);
        // Bare '1' (legacy) or owner-stamped '1:<userId>' (round 4) both
        // count as attested on this device; the server record is the
        // authority for wall writes, and the /auth guard above keeps a
        // signed-in user from reusing another account's flag.
        if (stored === '1' || (stored?.startsWith('1:') ?? false)) {
          attestedRef.current = true;
          setAgeAttested(true);
        }
      } catch {
        // Attestation unreadable: stay gated (safe default).
      }
    })();
  }, []);

  const ensureAgeAttested = (provider: 'apple' | 'google'): boolean => {
    // The ref is authoritative (state updates are async); ageAttested is
    // read here too so the loaded value participates after re-renders.
    if (attestedRef.current || ageAttested) return true;
    setPendingProvider(provider);
    setShowAgeGate(true);
    return false;
  };

  // Audit round 4, AUTH-2/AUTH-3: the server attestation is written ONLY
  // when the user actually confirmed the age modal in this session.
  // The old code recorded on every sign-in success, so a user who never
  // saw the modal (device flag already set by a previous account) got a
  // server attestation anyway. The ref is set by confirmAgeAttestation
  // and nowhere else.
  const modalConfirmedRef = useRef<boolean>(false);

  const recordAttestation = () => {
    if (!modalConfirmedRef.current) return;
    // Stamp the device flag with THIS user id: the startup gate treats
    // an owner-stamped flag as this session's own confirm still in
    // flight, while a bare '1' from a previous account is never trusted
    // (round 4, AUTH-3). Written before the RPC so the gate sees it even
    // if the network write is slow.
    void (async () => {
      try {
        const session = await getSafeSession();
        if (session?.user) {
          await AsyncStorage.setItem(AGE_ATTESTATION_KEY, `1:${session.user.id}`);
        }
      } catch {
        // Best effort — the server record below is the durable trail.
      }
    })();
    // Best-effort audit trail; a transient failure self-heals on the next
    // modal-confirmed sign-in, and the device flag still gates buttons.
    void DatabaseService.recordAgeAttestation().catch((e) => {
      if (__DEV__) console.log('[Auth] age attestation record failed', e);
    });
  };

  const confirmAgeAttestation = async () => {
    try {
      await AsyncStorage.setItem(AGE_ATTESTATION_KEY, '1');
    } catch {
      // Device flag unwritable: still proceed this once — the server
      // record (on sign-in success) is the durable attestation.
    }
    modalConfirmedRef.current = true;
    attestedRef.current = true;
    setAgeAttested(true);
    setShowAgeGate(false);
    const provider = pendingProvider;
    setPendingProvider(null);
    if (provider === 'apple') void handleAppleSignIn();
    else if (provider === 'google') void handleGoogleSignIn();
  };

  const declineAgeAttestation = () => {
    setShowAgeGate(false);
    setPendingProvider(null);
    Alert.alert(
      'TRIAD is for ages 13 and up',
      "You can still use TRIAD on this device without an account — tap 'Maybe later' below. Your journey stays on this device, and the community wall needs an account.",
    );
  };

  const handleAppleSignIn = async () => {
    if (!ensureAgeAttested('apple')) return;
    try {
      setLoading(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Anonymous upgrade attempt (mirrors Google): try linking Apple to
      // the anonymous account via browser OAuth first, so amens, wall
      // posts, and synced progress keep the same user id. Apple browser
      // OAuth may not be configured in Supabase — ANY failure here falls
      // through to the native path below, so this can never regress
      // sign-in; it only needs a live test to prove the link works.
      // Audit round 4, L3: remember the anonymous identity before the
      // link attempt, so the native fallback below can tell a real
      // upgrade (same user id) from a separate account (guest data left
      // behind) instead of silently presenting it as an upgrade.
      const preLinkSession = await getSafeSession();
      const anonymousUserId =
        preLinkSession?.user?.is_anonymous === true ? preLinkSession.user.id : null;

      if (await hasAnonymousSession()) {
        try {
          const redirectTo = Linking.createURL('auth/callback');
          const link = await supabase.auth.linkIdentity({
            provider: 'apple',
            options: { redirectTo, skipBrowserRedirect: true },
          });
          if (!link.error && link.data?.url) {
            const result = await WebBrowser.openAuthSessionAsync(link.data.url, redirectTo);
            if (result.type === 'success' && result.url) {
              const callbackUrl = new URL(result.url);
              const callbackHash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
              const code = callbackUrl.searchParams.get('code');
              // Audit round 4, L4: implicit tokens come from the URL
              // fragment only. Query-param tokens are wider surface
              // (logs, redirects); the PKCE code path above stays primary.
              const accessToken = callbackHash.get('access_token');
              const refreshToken = callbackHash.get('refresh_token');
              if (code) {
                await supabase.auth.exchangeCodeForSession(code);
              } else if (accessToken && refreshToken) {
                await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              }
              const { data: userData } = await supabase.auth.getUser();
              const linked = userData?.user?.identities?.some((identity) => identity.provider === 'apple');
              if (linked) {
                recordAttestation();
                router.replace('/');
                return;
              }
            }
          } else if (link.error) {
            throw link.error;
          }
        } catch (linkError) {
          // Fall through to native sign-in; the link attempt is best-effort.
          reportError('[Auth]', linkError, { flow: 'apple-link-attempt' });
          if (__DEV__) {
            console.log('[Auth] Apple link attempt failed, falling back to native:', linkError);
          }
        }
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign In did not return a valid identity token.');
      }

      // Native fallback: signs in with the ID token directly. When the
      // link attempt above already attached this Apple identity, the
      // native sign-in resolves to the same (anonymous-upgraded) user.
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      // Audit round 4, L3: the native fallback above signs into a
      // separate Apple account when the link failed — the anonymous
      // session's amens and progress stay orphaned under the guest id.
      // Say so plainly instead of presenting it as a successful upgrade.
      if (anonymousUserId) {
        const currentSession = await getSafeSession();
        if (currentSession?.user && currentSession.user.id !== anonymousUserId) {
          Alert.alert(
            'Signed in on a new account',
            'Your guest progress stayed on the guest account — it did not move to this account. Your journey here starts fresh.',
          );
        }
      }

      recordAttestation();
      router.replace('/');
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        if (__DEV__) {
          console.error('Apple Sign In Error', e);
        }
        Alert.alert('Apple Sign In failed', 'Please try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!ensureAgeAttested('google')) return;
    try {
      setLoading(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const isAnonymous = await hasAnonymousSession();
      const redirectTo = Linking.createURL('auth/callback');

      const startAuth = async () => {
        if (!isAnonymous) {
          return supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
            },
          });
        }

        // Upgrade in place: link Google to the anonymous account so amens,
        // wall posts, and synced progress keep the same user id.
        const link = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (!link.error || !isIdentityConflictError(link.error)) {
          return link;
        }

        // Google account already exists — sign in there instead.
        return supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
      };

      const { data, error } = await startAuth();

      if (error) throw error;
      if (!data?.url) {
        throw new Error('Google Sign In could not start.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      if (result.type !== 'success' || !result.url) {
        throw new Error('Google Sign In did not complete.');
      }

      const callbackUrl = new URL(result.url);
      const callbackHash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
      const code = callbackUrl.searchParams.get('code');
      // Audit round 4, L4: implicit tokens from the fragment only (see
      // the Apple path above); the PKCE code path stays primary.
      const accessToken = callbackHash.get('access_token');
      const refreshToken = callbackHash.get('refresh_token');

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      } else if (isAnonymous) {
        // Linking can complete without returning tokens; verify the identity
        // was attached before treating this as success.
        const { data: userData } = await supabase.auth.getUser();
        const linked = userData?.user?.identities?.some(
          (identity) => identity.provider === 'google'
        );
        if (!linked) {
          throw new Error('Google Sign In did not complete.');
        }
      } else {
        throw new Error('Google Sign In returned no session.');
      }

      recordAttestation();
      router.replace('/');
    } catch (e) {
      if (__DEV__) {
        console.error('Google Sign In Error', e);
      }
      Alert.alert('Google Sign In failed', 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
          colors={['#0D0804', '#1A1006', '#0D0804']}
          style={StyleSheet.absoluteFill}
        />
        
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
                source={require('../assets/images/triad-prayer-logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="TRIAD Prayer"
              />
              <Text style={[styles.tagline, { fontFamily: Fonts.italic }]}>
                God is <Text style={{ fontFamily: Fonts.italic, fontWeight: 'bold', fontStyle: 'italic', color: '#C8924A' }}>much closer</Text> than you think.
              </Text>
            </View>

            <View style={styles.authBox}>
              <Text style={[styles.boxTitle, { fontFamily: Fonts.titleMedium }]}>SAVE YOUR PROGRESS</Text>
              <Text style={[styles.boxDesc, { fontFamily: Fonts.serifRegular }]}>
                Link an account to keep your 30-day journey on every device, and join the community.
              </Text>

              <View style={styles.actions}>
                {Platform.OS === 'ios' && (
                  <GlowButton
                    label="SIGN IN WITH APPLE"
                    onPress={handleAppleSignIn}
                    variant="primary"
                    gradient={['#F4EDE0', '#DED6C8']}
                    disabled={loading}
                    icon={<Text style={{ fontSize: 20, color: '#0D0804' }}></Text>}
                    glowColor={{ r: 244, g: 237, b: 224 }}
                    style={{ width: '100%' }}
                  />
                )}

                <GlowButton
                  label="SIGN IN WITH GOOGLE"
                  onPress={handleGoogleSignIn}
                  variant="ghost"
                  disabled={loading}
                  icon={<Google size={18} color="#F4EDE0" />}
                  style={{ width: '100%' }}
                  textStyle={{ color: '#F4EDE0' }}
                />

                <Pressable
                  style={({ pressed }) => [styles.skipBtn, pressed && styles.skipBtnPressed]}
                  onPress={() => {
                    dismissCloudPrompt();
                    router.replace('/');
                  }}
                >
                  <Text style={[styles.skipText, { fontFamily: Fonts.titleRegular }]}>Maybe later</Text>
                </Pressable>
              </View>
            </View>
            </View>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { fontFamily: Fonts.serifRegular }]}>
                By signing in, you agree to our Terms of Service & Privacy Policy.
              </Text>
            </View>
          </ScrollView>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#C8894A" size="large" />
            </View>
          )}

          <Modal
            visible={showAgeGate}
            transparent
            animationType="fade"
            onRequestClose={declineAgeAttestation}
          >
            <View style={styles.ageGateBackdrop}>
              <View style={styles.ageGateCard}>
                <Text style={[styles.ageGateTitle, { fontFamily: Fonts.titleMedium }]}>
                  ONE THING FIRST
                </Text>
                <Text style={[styles.ageGateBody, { fontFamily: Fonts.serifRegular }]}>
                  TRIAD Prayer is a community app for ages 13 and up, including the
                  public Prayer Wall. To create an account, please confirm you are
                  13 or older.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.ageGatePrimary, pressed && styles.ageGatePressed]}
                  onPress={confirmAgeAttestation}
                >
                  <Text style={[styles.ageGatePrimaryText, { fontFamily: Fonts.titleMedium }]}>
                    I AM 13 OR OLDER
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.ageGateSecondary, pressed && styles.ageGatePressed]}
                  onPress={declineAgeAttestation}
                >
                  <Text style={[styles.ageGateSecondaryText, { fontFamily: Fonts.titleRegular }]}>
                    I&apos;m under 13
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </View>
    </>
  );
}

const createStyles = (T: any) => StyleSheet.create({
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
    fontSize: 20,
    color: 'rgba(244,237,224,0.6)',
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
    fontSize: T.scale(13),
    letterSpacing: 4,
    color: '#C8894A',
    textAlign: 'center',
    marginBottom: 16,
  },
  boxDesc: {
    fontSize: 20,
    lineHeight: 26,
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  actions: {
    gap: 16,
  },
  appleBtn: {
    backgroundColor: '#F4EDE0',
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleBtnText: {
    color: '#0D0804',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  googleBtn: {
    backgroundColor: 'rgba(244,237,224,0.08)',
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,237,224,0.15)',
  },
  googleBtnText: {
    color: '#F4EDE0',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  skipBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    color: 'rgba(244,237,224,0.65)',
    fontSize: T.scale(13),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  skipBtnPressed: {
    opacity: 0.6,
  },
  btnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  footer: {
    paddingHorizontal: 8,
    paddingTop: 24,
  },
  footerText: {
    fontSize: T.scale(13),
    color: 'rgba(244,237,224,0.55)',
    textAlign: 'center',
    lineHeight: T.scale(16),
  },
  loadingOverlay: {
    ...absoluteFillObject,
    backgroundColor: 'rgba(13,8,4,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  ageGateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,8,4,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  ageGateCard: {
    width: '100%',
    backgroundColor: '#1A1006',
    borderWidth: 1,
    borderColor: '#C8924A',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  ageGateTitle: {
    fontSize: 18,
    color: '#F4EDE0',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  ageGateBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#E8DCC8',
    textAlign: 'center',
    marginBottom: 24,
  },
  ageGatePrimary: {
    width: '100%',
    backgroundColor: '#C8924A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  ageGatePrimaryText: {
    fontSize: 15,
    color: '#0D0804',
    letterSpacing: 0.5,
  },
  ageGateSecondary: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ageGateSecondaryText: {
    fontSize: 15,
    color: '#F4EDE0',
  },
  ageGatePressed: {
    opacity: 0.7,
  },
});
