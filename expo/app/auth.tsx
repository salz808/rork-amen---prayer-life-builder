import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getSafeSession, hasAnonymousSession, isIdentityConflictError, supabase } from '@/lib/supabase';
import { resolveGoogleAuthStart } from '@/lib/googleAuth';
import { SyncService } from '@/lib/syncService';
import {
  interpretAnonymousLink,
  interpretSignUp,
  isAlreadyRegisteredError,
  normalizeEmail,
  validateEmailPassword,
  type EmailAuthMode,
} from '@/lib/emailAuth';
import { reportError } from '@/lib/crashReporter';
import { DatabaseService } from '@/lib/database';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';
import { Chrome as Google, Mail } from 'lucide-react-native';
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
  const [pendingProvider, setPendingProvider] = useState<'apple' | 'google' | 'email' | null>(null);

  // Email sign-in (password, not OTP — see lib/emailAuth.ts for why):
  // the same age gate and the same anonymous-upgrade rule as
  // Google/Apple apply. The email/password are passed only to
  // supabase.auth calls; they are never stored, logged, or sent
  // anywhere else. No "forgot password" button is offered yet on
  // purpose: a reset email's link has no recovery screen/route to land
  // on (there is no auth-callback route in this app), so sending one
  // would dead-end. That screen is still owed before password reset
  // can be offered honestly.
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [emailMode, setEmailMode] = useState<EmailAuthMode>('signIn');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  // Set only after an anonymous link attempt fails because the email
  // already belongs to another account. It is the explicit "sign in
  // anyway, knowing guest progress will not move" consent: without it,
  // an anonymous sign-in tap always tries the preserving link first,
  // so a tap can never silently strand guest data.
  const [emailStrandAcknowledged, setEmailStrandAcknowledged] = useState<boolean>(false);

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

  // Email sign-in/confirmation return trip: the mount check above
  // runs once, so a signed-in session that appears while this
  // screen is already mounted (confirmed in the mail app and
  // returned to, session restored after the mount check, or any
  // other path that signs in without navigating) would strand
  // the user on the auth screen. Re-check on every focus, with
  // the same guard: only a signed-in, non-anonymous session
  // routes home. Unconfirmed users stay put — with confirm-email
  // ON they have no session yet, or a still-anonymous one — so
  // this never routes an unconfirmed user home. Anonymous guests
  // stay too (is_anonymous === true is excluded, as above).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const session = await getSafeSession();
          if (!cancelled && session?.user && session.user.is_anonymous !== true) {
            router.replace('/');
          }
        } catch {
          // Session unreadable: stay on the auth screen (safe default).
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(AGE_ATTESTATION_KEY);
        // Audit fix F10: a bare '1' is NEVER trusted here. It is only
        // the in-flight marker confirmAgeAttestation writes before a
        // sign-in (no user id exists yet to stamp), and a legacy bare
        // flag from a previous account must not attest the next
        // account on a shared device — that was the stamped-only
        // comment's promise, contradicted by the old stored === '1'
        // check. Only an owner-stamped '1:<userId>' matching the
        // CURRENT session's user counts at load; the server record
        // remains the authority for wall writes, and sign-out /
        // fresh-sign-in clearing (AppProvider) is unchanged. A guest
        // who confirmed the modal this session is already covered by
        // attestedRef in memory, so this load-time tightening never
        // re-prompts a just-confirmed user mid-flow.
        if (stored?.startsWith('1:') ?? false) {
          const session = await getSafeSession();
          if (session?.user && stored === `1:${session.user.id}`) {
            attestedRef.current = true;
            setAgeAttested(true);
          }
        }
      } catch {
        // Attestation unreadable: stay gated (safe default).
      }
    })();
  }, []);

  const ensureAgeAttested = (provider: 'apple' | 'google' | 'email'): boolean => {
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

  const handleEmailSubmit = async () => {
    if (!ensureAgeAttested('email')) return;
    const normalizedEmail = normalizeEmail(email);
    const validationError = validateEmailPassword(email, password, emailMode);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    setEmailError(null);
    setEmailNotice(null);
    try {
      setLoading(true);
      // Unconfigured client: no auth call is possible; surface the
      // existing inline error (finally resets loading) instead of
      // throwing on a null client.
      if (!supabase) {
        setEmailError('Sign-in is not available right now. Please try again in a moment.');
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Wave-1 guest fix (#10): same pre-sign-in guest warning as
      // Apple/Google, and the same migration-source marker for the
      // anonymous case (the email flow strands exactly like Apple's
      // native fallback when updateUser resolves elsewhere).
      if (!(await confirmGuestSignIn())) return;

      // Anonymous upgrade (mirrors Google's linkIdentity, but for
      // email the Supabase-supported link is updateUser on the
      // anonymous session — it keeps the SAME user id, so amens, wall
      // posts, and synced progress carry over. OTP cannot do this:
      // signInWithOtp signs into a separate account and would strand
      // the anonymous data, which is why this screen is password-only.
      const preLinkSession = await getSafeSession();
      const anonymousUserId =
        preLinkSession?.user?.is_anonymous === true ? preLinkSession.user.id : null;
      if (anonymousUserId) {
        await SyncService.recordMigrationSourceId(anonymousUserId);
      }

      if (anonymousUserId) {
        // Explicit stranded sign-in: only after a link attempt already
        // failed as already-registered (which sets
        // emailStrandAcknowledged) and the user taps sign-in again.
        // Mirrors the Apple native fallback's L3 alert: say plainly
        // that guest progress did not move, then proceed.
        if (emailMode === 'signIn' && emailStrandAcknowledged) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (error) {
            setEmailError('That email or password is not right. Please try again.');
            return;
          }
          if (!data.session) {
            setEmailError('Email sign-in did not complete. Please try again in a moment.');
            return;
          }
          if (data.session.user.id !== anonymousUserId) {
            // This branch keeps the old wording deliberately: the
            // target here is the already-registered EXISTING account
            // the user explicitly consented to start fresh on, and
            // the migration refuses existing accounts — so "starts
            // fresh" is still true here.
            Alert.alert(
              'Signed in on a new account',
              'Your guest progress stayed on the guest account. It did not move to this account. Your journey here starts fresh.',
            );
          }
          recordAttestation();
          router.replace('/');
          return;
        }
        // Otherwise an anonymous attempt ALWAYS tries the preserving
        // link first, whatever the mode toggle says — a sign-in tap
        // for a brand-new email must upgrade in place, not create a
        // second account and strand the guest data.
        const { error } = await supabase.auth.updateUser({
          email: normalizedEmail,
          password,
        });
        if (error) {
          if (isIdentityConflictError(error) || isAlreadyRegisteredError(error)) {
            // This email already belongs to another account. Do NOT
            // sign into it on this tap — that would strand the guest
            // data. Switch to sign-in mode, arm the explicit-consent
            // flag, and say so plainly; tapping sign-in again is the
            // user's explicit choice to start fresh on that account.
            setEmailMode('signIn');
            setEmailStrandAcknowledged(true);
            setEmailError(
              'This email already belongs to another account. Your guest progress will stay on the guest account and will not move over. Use a different email to keep your guest progress, or tap Sign in again to sign into that account anyway.',
            );
            return;
          }
          throw error;
        }
        const { data: userData } = await supabase.auth.getUser();
        const outcome = interpretAnonymousLink(anonymousUserId, userData?.user ?? null);
        if (outcome === 'upgraded') {
          recordAttestation();
          router.replace('/');
          return;
        }
        if (outcome === 'confirmationPending') {
          // Confirm-email is ON: the account is still anonymous until
          // the confirmation email is clicked, and the password does
          // not work yet. Do NOT navigate home as if signed in, and
          // do NOT record an attestation — there is no permanent
          // account yet. The user keeps praying as a guest meanwhile
          // and, once confirmed, signs in with this email/password
          // onto the same user id.
          setEmailNotice(
            'Check your email to confirm this address. Your guest progress stays linked to this account. Once you confirm, sign in with this email and password to continue where you left off. You can keep praying as a guest meanwhile.',
          );
          setEmailMode('signIn');
          return;
        }
        if (outcome === 'stranded') {
          // Audit fix F6: the old branch showed the alert and then
          // returned with no navigation and no attestation — a dead
          // end (the user was signed in on the new account but left
          // staring at the auth screen). Match the explicit stranded
          // sign-in branch above: record the attestation and go home.
          // Wave-1 guest fix (#10): unlike that branch, this target
          // may be a FRESH account, so the migration may adopt the
          // guest progress — the old "starts fresh" claim is no
          // longer safe here. [NEW] alert copy — needs Kai's review
          // before shipping.
          Alert.alert(
            'Signed in on a new account',
            'Signing into a new account carries your guest progress from this device with it. If this account already has progress, that progress is used instead. Your guest progress stays saved on this device.',
          );
          recordAttestation();
          router.replace('/');
          return;
        }
        // 'unchanged': updateUser reported success but the session did
        // not move. Stay on this screen rather than presenting a
        // signed-in state that is not one.
        setEmailError('Email sign-in did not complete. Please try again in a moment.');
        return;
      }

      if (emailMode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });
        if (error) {
          if (isIdentityConflictError(error) || isAlreadyRegisteredError(error)) {
            setEmailMode('signIn');
            setEmailError('An account with this email already exists. Sign in with it below.');
            return;
          }
          throw error;
        }
        if (interpretSignUp(Boolean(data.session)) === 'signedIn') {
          recordAttestation();
          router.replace('/');
          return;
        }
        // Confirm-email is ON: no session yet. Do NOT navigate home
        // or record an attestation; the user signs in after clicking
        // the confirmation email.
        setEmailNotice(
          'Check your email to confirm your account, then sign in with this email and password.',
        );
        setEmailMode('signIn');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        // Deliberately generic: never say whether the email exists or
        // the password was wrong.
        setEmailError('That email or password is not right. Please try again.');
        return;
      }
      if (!data.session) {
        setEmailError('Email sign-in did not complete. Please try again in a moment.');
        return;
      }
      recordAttestation();
      router.replace('/');
    } catch (e) {
      if (__DEV__) {
        console.error('Email Sign In Error', e);
      }
      Alert.alert('Email sign-in failed', 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // Wave-1 guest fix (#10): pure guests previously got NO warning —
  // the stranded-data alert fired only when an anonymous id existed.
  // Now every sign-in path checks the device guest blob first. A NEW
  // account adopts that progress (SyncService migration); an EXISTING
  // account's progress wins instead. Either way the user chooses
  // explicitly — returning false aborts the sign-in before any auth
  // call runs. [NEW] alert copy — needs Kai's review before shipping.
  const confirmGuestSignIn = async (): Promise<boolean> => {
    const summary = await SyncService.getGuestProgressSummary();
    if (!summary?.hasProgress) return true;
    const detail = summary.daysCompleted > 0
      ? `${summary.daysCompleted} day${summary.daysCompleted === 1 ? '' : 's'} of progress`
      : 'prayers and journal entries';
    return new Promise((resolve) => {
      Alert.alert(
        'Your progress is saved on this device',
        `You have ${detail} saved here without an account. Signing into a new account carries it with you. If you sign into an account that already has progress, that account's progress is used instead. Your guest progress stays saved on this device.`,
        [
          { text: 'Stay as guest', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue to sign in', onPress: () => resolve(true) },
        ],
        { onDismiss: () => resolve(false) },
      );
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
    else if (provider === 'email') void handleEmailSubmit();
  };

  const declineAgeAttestation = () => {
    setShowAgeGate(false);
    setPendingProvider(null);
    Alert.alert(
      'TRIAD is for ages 13 and up',
      "You can still use TRIAD on this device without an account. Tap 'Maybe later' below. Your journey stays on this device, and the community wall needs an account.",
    );
  };

  const handleAppleSignIn = async () => {
    if (!ensureAgeAttested('apple')) return;
    try {
      setLoading(true);
      // Unconfigured client: no auth call is possible; surface the
      // existing Apple failure alert (finally resets loading) instead
      // of throwing on a null client.
      if (!supabase) {
        Alert.alert('Apple Sign In failed', 'Sign-in is not available right now. Please try again in a moment.');
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Wave-1 guest fix (#10): warn before any auth call when guest
      // progress exists on this device. A declined choice aborts here.
      if (!(await confirmGuestSignIn())) return;

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

      // Wave-1 guest fix (#10): record the anonymous id as the
      // migration source BEFORE the link/native attempts. If they
      // resolve to a different account, the sign-in migration adopts
      // the stranded anonymous blob only because this marker names
      // its owner; a successful link clears the marker unused.
      if (anonymousUserId) {
        await SyncService.recordMigrationSourceId(anonymousUserId);
      }

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

      // Audit round 4, L3, as amended by the wave-1 guest fix (#10):
      // the native fallback above signs into a separate Apple account
      // when the link failed. That no longer means the progress is
      // lost: the sign-in migration adopts it into a fresh account
      // (or the account's own progress wins for an existing one).
      // Say that plainly instead of presenting either outcome as a
      // successful upgrade or a fresh start. [NEW] alert copy — needs
      // Kai's review before shipping.
      if (anonymousUserId) {
        const currentSession = await getSafeSession();
        if (currentSession?.user && currentSession.user.id !== anonymousUserId) {
          Alert.alert(
            'Signed in on a new account',
            'Signing into a new account carries your guest progress from this device with it. If this account already has progress, that progress is used instead. Your guest progress stays saved on this device.',
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
      // Unconfigured client: no auth call is possible; surface the
      // existing Google failure alert (finally resets loading) instead
      // of throwing on a null client.
      if (!supabase) {
        Alert.alert('Google Sign In failed', 'Sign-in is not available right now. Please try again in a moment.');
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Wave-1 guest fix (#10): same pre-sign-in guest warning as
      // Apple, and the same migration-source marker for the anonymous
      // case (previously Google had neither the marker nor any
      // post-sign-in stranded alert — see below).
      if (!(await confirmGuestSignIn())) return;
      const preGoogleSession = await getSafeSession();
      const googleAnonymousUserId =
        preGoogleSession?.user?.is_anonymous === true ? preGoogleSession.user.id : null;
      const isAnonymous = googleAnonymousUserId !== null;
      if (googleAnonymousUserId) {
        await SyncService.recordMigrationSourceId(googleAnonymousUserId);
      }
      const redirectTo = Linking.createURL('auth/callback');
      // Narrowed local binding: TS resets imported-variable narrowing
      // inside the startAuth closure below, so capture it once here.
      const client = supabase;

      // Wave 2, fix 8: the start logic lives in lib/googleAuth so the
      // fall-through is unit-testable. Upgrade in place (link Google
      // to the anonymous account) stays the first attempt; every link
      // failure now falls through to plain sign-in, mirroring Apple's
      // link attempt — previously a non-conflict link error was
      // returned and the handler threw on it, failing the sign-in.
      const { data, error } = await resolveGoogleAuthStart(client, isAnonymous, redirectTo);

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

      // Wave-1 guest fix (#10): Google parity with Apple's stranded
      // alert — a link that resolved to a different account used to
      // complete silently. The migration adopts guest progress into a
      // fresh account (or the account's own progress wins), so say
      // that instead of claiming a fresh start. [NEW] alert copy —
      // needs Kai's review before shipping.
      if (googleAnonymousUserId) {
        const currentSession = await getSafeSession();
        if (currentSession?.user && currentSession.user.id !== googleAnonymousUserId) {
          Alert.alert(
            'Signed in on a new account',
            'Signing into a new account carries your guest progress from this device with it. If this account already has progress, that progress is used instead. Your guest progress stays saved on this device.',
          );
        }
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
                {/* [NEW] copy — needs Kai's review before shipping. The
                    old line implied sign-in keeps the journey when it
                    did not yet do so; with guest persistence + sign-in
                    migration, this is now true for a new account. */}
                Sign in to keep your journey on every device and join the community. Your progress is saved on this device even without an account, signing into a new account carries it with you.
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

                <View style={styles.emailDivider}>
                  <View style={styles.emailDividerLine} />
                  <Text style={[styles.emailDividerText, { fontFamily: Fonts.titleRegular }]}>OR</Text>
                  <View style={styles.emailDividerLine} />
                </View>

                <TextInput
                  style={styles.emailInput}
                  placeholder="Email address"
                  placeholderTextColor="rgba(244,237,224,0.45)"
                  value={email}
                  onChangeText={(next) => {
                    setEmail(next);
                    setEmailStrandAcknowledged(false);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                  returnKeyType="next"
                />
                <TextInput
                  style={styles.emailInput}
                  placeholder="Password"
                  placeholderTextColor="rgba(244,237,224,0.45)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={emailMode === 'signUp' ? 'new-password' : 'password'}
                  textContentType={emailMode === 'signUp' ? 'newPassword' : 'password'}
                  editable={!loading}
                  returnKeyType="go"
                  onSubmitEditing={() => void handleEmailSubmit()}
                />
                {emailError ? (
                  <Text style={styles.emailError}>{emailError}</Text>
                ) : null}
                {emailNotice ? (
                  <Text style={styles.emailNotice}>{emailNotice}</Text>
                ) : null}
                <GlowButton
                  label={emailMode === 'signUp' ? 'CREATE ACCOUNT WITH EMAIL' : 'SIGN IN WITH EMAIL'}
                  onPress={handleEmailSubmit}
                  variant="ghost"
                  disabled={loading}
                  icon={<Mail size={18} color="#F4EDE0" />}
                  style={{ width: '100%' }}
                  textStyle={{ color: '#F4EDE0' }}
                />
                <Pressable
                  style={({ pressed }) => [styles.emailToggleBtn, pressed && styles.skipBtnPressed]}
                  onPress={() => {
                    setEmailError(null);
                    setEmailNotice(null);
                    setEmailStrandAcknowledged(false);
                    setEmailMode(emailMode === 'signUp' ? 'signIn' : 'signUp');
                  }}
                >
                  <Text style={[styles.emailToggleText, { fontFamily: Fonts.titleRegular }]}>
                    {emailMode === 'signUp'
                      ? 'Already have an account? Sign in'
                      : 'New here? Create an account'}
                  </Text>
                </Pressable>

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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: 4,
    color: '#C8894A',
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
  actions: {
    gap: 16,
  },
  emailDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  emailDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(244,237,224,0.15)',
  },
  emailDividerText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: 'rgba(244,237,224,0.8)',
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
    color: 'rgba(244,237,224,0.85)',
    textAlign: 'center',
  },
  emailToggleBtn: {
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  emailToggleText: {
    color: 'rgba(244,237,224,0.65)',
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    color: 'rgba(244,237,224,0.8)',
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: '#F4EDE0',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  ageGateBody: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
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
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    color: '#0D0804',
    letterSpacing: 0.5,
  },
  ageGateSecondary: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ageGateSecondaryText: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
    color: '#F4EDE0',
  },
  ageGatePressed: {
    opacity: 0.7,
  },
});
