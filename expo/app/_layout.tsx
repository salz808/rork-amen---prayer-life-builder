import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/appQueryClient';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { AppProvider, useApp } from '@/providers/AppProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import BackgroundGradient from '@/components/BackgroundGradient';
import SplashMotion from '@/components/SplashMotion';
import { getLaunchSplashSession } from '@/lib/splashMotion';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import SupportCardModal from '@/components/SupportCardModal';
import { DatabaseService } from '@/lib/database';
import { getSafeSession, supabase } from '@/lib/supabase';
import DarkColors from '@/constants/darkColors'
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  BOOT_CONTENT_EXIT_MS,
  BOOT_VEIL_EXIT_DELAY_MS,
  BOOT_VEIL_EXIT_MS,
  bootExitDelayMs,
  bootVeilDurationMs,
  markBootStart,
  msSinceBootStart,
} from '@/lib/launchMotion';
import { configureRevenueCat } from '@/services/revenuecat';
import { installErrorGuards } from '@/lib/installErrorGuards';
import { startMainThreadHeartbeat, stopMainThreadHeartbeat } from '@/lib/mainThreadHeartbeat';
import { ensurePlaybackAudioMode } from '@/lib/audioSession';

installErrorGuards();

// P1-5 trap (__DEV__ only, never ships): when the red "Text strings
// must be rendered within a <Text>" error fires, print the component
// stack it arrived with, so the offending screen is named instead of
// guessed. Correlation aid only — it does not diagnose or fix the
// error, and production console silencing below leaves it inert.
if (__DEV__) {
  const __origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    __origConsoleError(...args);
    const first = args[0];
    const message = typeof first === 'string' ? first : first instanceof Error ? first.message : '';
    if (message.includes('Text strings must be rendered within a <Text>')) {
      const withStack = args.find(
        (a): a is { componentStack?: string } =>
          typeof a === 'object' && a !== null && 'componentStack' in a,
      );
      __origConsoleError(
        '[TextTrap] component stack:\n',
        withStack?.componentStack ?? (first instanceof Error ? first.stack : 'n/a — see LogBox stack'),
      );
    }
  };
}

void SplashScreen.preventAutoHideAsync();

function silenceProductionConsole(): void {
  if (__DEV__) {
    return;
  }

  console.log = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
}

silenceProductionConsole();



configureRevenueCat();

// Round-2 L1: explicit foreground notification behavior — show the
// banner + list entry and play the sound, never set a badge — instead
// of leaving it to Expo's platform default. Module-level (not in an
// effect) so it applies before any notification can fire while
// foregrounded.
if (Platform.OS !== 'web') {
  void import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }).catch(() => {});
}

const FONT_LOAD_TIMEOUT_MS = 3500;

// Route-known timeout (2026-11-17): bound on the boot exit when the
// user/profile load never settles — see the route-known gate in
// RootLayout. 8s gives a genuinely slow connection room to finish
// while still bounding the worst-case strand.
const ROUTE_KNOWN_TIMEOUT_MS = 8000;

async function loadCustomFonts(): Promise<void> {
  // 8 faces at startup (was 16): Montserrat 300/400/500/600/700 and
  // Cormorant 400/500 + 400 Italic. See constants/fonts.ts for the
  // 2026-11-16 rebalance that removed the other 8 faces.
  await Font.loadAsync({
    Montserrat_300Light: require('@expo-google-fonts/montserrat/300Light/Montserrat_300Light.ttf'),
    Montserrat_400Regular: require('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'),
    Montserrat_500Medium: require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf'),
    Montserrat_600SemiBold: require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
    Montserrat_700Bold: require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
    CormorantGaramond_400Regular: require('@expo-google-fonts/cormorant-garamond/400Regular/CormorantGaramond_400Regular.ttf'),
    CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf'),
    CormorantGaramond_400Regular_Italic: require('@expo-google-fonts/cormorant-garamond/400Regular_Italic/CormorantGaramond_400Regular_Italic.ttf'),
  });
}

function RootLayoutNav({
  onRouteKnown,
}: {
  /** Bridges AppProvider's isUserLoaded up to RootLayout (which sits outside the provider) so the boot exit can wait for the route to be known. */
  onRouteKnown?: (known: boolean) => void;
}) {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  // Audit round 3, J-S10 (partial): a reminder tap used to push /session
  // unconditionally — including for a user who never finished onboarding,
  // landing them mid-journey. Route those taps to onboarding instead.
  // The ref (synced in an effect, never written during render) keeps the
  // notification listener reading the latest value without re-subscribing.
  const { state, supportCardVariant, supportCardBlocked, dismissSupportCard, isUserLoaded } = useApp();
  const onboardingCompleteRef = useRef<boolean | undefined>(undefined);
  // Audio must play with the iPhone silent switch on: configure the
  // playback audio session once at launch so every audio path
  // (declarations, sessions, soundbeds, Selah) is covered, not only the
  // paths that set the mode themselves.
  useEffect(() => {
    void ensurePlaybackAudioMode();
  }, []);
  useEffect(() => {
    onboardingCompleteRef.current = state.user?.onboardingComplete;
  });

  // Route-known bridge (2026-11-17): RootLayout owns the boot exit
  // but sits outside AppProvider, so the signal comes up through
  // this callback. setRouteKnown is stable, so this fires exactly
  // when isUserLoaded changes.
  useEffect(() => {
    onRouteKnown?.(isUserLoaded);
  }, [isUserLoaded, onRouteKnown]);

  // Audit round 4, AUTH-2/AUTH-3: the startup gate is the re-attestation
  // prompt for signed-in users whose server record is NULL — and it must
  // check the SERVER record first. The old order trusted the device flag
  // before the server record, so a device flag set by a previous account
  // silenced the gate for whoever signed in next. The device flag is now
  // never gate evidence on its own: the only flag-equivalents are a
  // confirm in this very session (legacyConfirmedRef) or a flag stamped
  // with this user's own id by auth.tsx, covering the window where this
  // session's own RPC write is still in flight. A bare legacy '1' flag
  // gets one brief deferred re-check (the SIGNED_IN event fires before
  // auth.tsx stamps the flag) and then the modal, if still unattested.
  // Declining does not brick the app — the modal returns next launch,
  // and the wall-write gate still blocks all wall use until they attest.
  const [showLegacyAgeGate, setShowLegacyAgeGate] = useState(false);
  const legacyGateCheckedFor = useRef<string | null>(null);
  const legacyConfirmedRef = useRef(false);
  const legacyDeferredRef = useRef<string | null>(null);
  const legacyDeferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref indirection so the deferred re-check below can re-invoke the
  // gate without a self-reference inside its own useCallback (which the
  // react-hooks/immutability rule rejects).
  const checkLegacyAttestationRef = useRef<((userId: string | null, isAnonymous: boolean) => Promise<void>) | null>(null);

  const checkLegacyAttestation = useCallback(async (userId: string | null, isAnonymous: boolean) => {
    if (!userId || isAnonymous) return;
    if (legacyGateCheckedFor.current === userId) return;
    legacyGateCheckedFor.current = userId;
    try {
      const attested = await DatabaseService.getAgeAttested();
      if (attested) return;
      if (legacyConfirmedRef.current) return;
      const flag = await AsyncStorage.getItem('triad_age_attested_v1');
      if (flag === `1:${userId}`) return;
      if (flag === '1' && legacyDeferredRef.current !== userId) {
        legacyDeferredRef.current = userId;
        legacyDeferTimerRef.current = setTimeout(() => {
          legacyGateCheckedFor.current = null;
          void checkLegacyAttestationRef.current?.(userId, isAnonymous);
        }, 2500);
        return;
      }
      setShowLegacyAgeGate(true);
    } catch {
      // Read failed (offline): skip this launch, recheck next launch.
    }
  }, []);

  useEffect(() => {
    checkLegacyAttestationRef.current = checkLegacyAttestation;
  }, [checkLegacyAttestation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getSafeSession();
        if (cancelled) return;
        await checkLegacyAttestation(session?.user?.id ?? null, session?.user?.is_anonymous === true);
      } catch {
        // Skip this launch on session-read failure.
      }
    })();
    const authListener = supabase
      ? supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && !cancelled) {
            void checkLegacyAttestation(session?.user?.id ?? null, session?.user?.is_anonymous === true);
          }
        })
      : null;
    return () => {
      cancelled = true;
      if (legacyDeferTimerRef.current) clearTimeout(legacyDeferTimerRef.current);
      authListener?.data.subscription.unsubscribe();
    };
  }, [checkLegacyAttestation]);

  const confirmLegacyAgeGate = () => {
    setShowLegacyAgeGate(false);
    // This IS a modal confirm this session, so the RPC write below is
    // allowed (round 4, AUTH-2) and the gate must not re-prompt while
    // that write is in flight.
    legacyConfirmedRef.current = true;
    void AsyncStorage.setItem('triad_age_attested_v1', '1').catch(() => {});
    void DatabaseService.recordAgeAttestation().catch(() => {});
  };

  const declineLegacyAgeGate = () => {
    setShowLegacyAgeGate(false);
  };

  // Refs must not be written during render (concurrent rendering can
  // discard the write); sync in an effect instead.
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // C-4: main-thread heartbeat — turns the next #60-style freeze into a
  // diagnosable event (see lib/mainThreadHeartbeat.ts). Mounted here in
  // RootLayoutNav, away from the BootScreen / boot-fade launch-motion
  // code; the route comes from the already-synced segmentsRef.
  useEffect(() => {
    startMainThreadHeartbeat(() => segmentsRef.current.join('/') || null);
    return () => stopMainThreadHeartbeat();
  }, []);

  // Tapping a notification routes on its data.kind. Daily reminders
  // open today's session; neglected-phase nudges open today's session
  // directly on the neglected movement (?phase=, honored once by the
  // session screen); unknown kinds fall back to /session. Taps while
  // already on a session are ignored instead of stacking a second one.
  // Round-2 M4: the old listener ignored data entirely (every tap
  // landed generically on /session), and getLastNotificationResponse
  // was consumed unconditionally on every cold start, so a stale last
  // response could re-route a normal launch. Handled response
  // identifiers are now recorded and skipped on repeat.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: { remove: () => void } | undefined;
    let cancelled = false;
    const HANDLED_RESPONSE_KEY = 'triad_handled_notification_response_v1';
    const openFromResponse = async (response: {
      notification: { request: { identifier: string; content: { data?: unknown } } };
    }) => {
      const identifier = response.notification.request.identifier;
      try {
        const handled = await AsyncStorage.getItem(HANDLED_RESPONSE_KEY);
        if (handled === identifier) return;
        await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, identifier);
      } catch {
        // Dedup is best-effort — a storage failure must not swallow the tap.
      }
      if (segmentsRef.current[0] === 'session') return;
      // Audit round 3, J-S10: never drop an un-onboarded user into a
      // session from a reminder tap (ref, not state, so the listener
      // always sees the latest value without re-subscribing).
      // Audit round 4, lane 5 (G-M4): `undefined` means "not loaded
      // yet", not "onboarded" — the old `=== false` check fell through
      // to /session while onboarding state was still unknown. Only a
      // positively-true value earns /session; anything else (false OR
      // still-loading) goes to onboarding, and the onboarding screen
      // itself redirects already-onboarded users onward (onboarding.tsx
      // effect on state.user.onboardingComplete), so a late-loading
      // onboarded user is not stranded there.
      if (onboardingCompleteRef.current !== true) {
        router.push('/onboarding');
        return;
      }
      const data = response.notification.request.content.data as
        | { kind?: string; phase?: string }
        | undefined;
      if (data?.kind === 'neglected_phase' && typeof data.phase === 'string' && data.phase) {
        router.push(`/session?phase=${encodeURIComponent(data.phase)}`);
        return;
      }
      router.push('/session');
    };
    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (cancelled) return;
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last && !cancelled) {
          await openFromResponse(last);
        }
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          void openFromResponse(response);
        });
      } catch {
        // Notifications unavailable — taps just open the app.
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);

  return (
    <>
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: DarkColors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      {/* Password reset: /auth/reset-password is the landing route for
          the reset email's deep link (RESET_PASSWORD_REDIRECT_URL in
          lib/emailAuth.ts). Registered explicitly like /moderation so
          its presentation is deliberate, not an accident of file
          routing. The screen itself establishes the recovery session
          from the link; registration alone grants nothing. */}
      <Stack.Screen
        name="auth/reset-password"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="tracks"
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="session"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          headerShown: false,
          presentation: 'card',
        }}
      />
      {/* Audit round 4, lane 5 (G-M4): /moderation previously resolved
          only by file routing, with its presentation an accident of
          the component. Registered explicitly; the screen itself still
          gates on the moderator RPC, so registration alone grants
          nothing. */}
      <Stack.Screen
        name="moderation"
        options={{
          headerShown: false,
          presentation: 'card',
        }}
      />
      {/* Pre-launch audit M-4: /report-problem parity with /moderation. */}
      <Stack.Screen
        name="report-problem"
        options={{
          headerShown: false,
          presentation: 'card',
        }}
      />
    </Stack>
    <AgeAttestationModal
      visible={showLegacyAgeGate}
      onConfirm={confirmLegacyAgeGate}
      onDecline={declineLegacyAgeGate}
    />
    {/* Support card (wall moderation holds): rendered ONCE here, so
        the community composer, session Ask share, and journal
        testimony share/retry all surface the identical card.
        Visible only when AppProvider holds a variant — i.e. only
        on a self_harm or threat hold, never on a normal screen. */}
    <SupportCardModal
      visible={supportCardVariant != null}
      variant={supportCardVariant}
      blocked={supportCardBlocked}
      onClose={dismissSupportCard}
    />
    </>
  );
}

function BootScreen({
  contentOpacity,
  alreadyPlayed,
  onEntranceComplete,
  onSkip,
  fontsReady,
}: {
  contentOpacity: Animated.Value;
  /** Captured-once session state (or true after a tap-to-skip). */
  alreadyPlayed: boolean;
  /** Fires once when the launch entrance finishes (or immediately under Reduce Motion / replay). */
  onEntranceComplete: () => void;
  /** Tap-to-skip: jump to final state and start the exit at once. */
  onSkip: () => void;
  /** True once the custom fonts are loaded (appReady) — the launch splash's text beats wait for it so Cormorant never renders in the fallback font. */
  fontsReady: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const splashHiddenRef = useRef(false);

  // The native splash hides on the boot screen's first layout — that is
  // what makes the boot composition visible at all. Before this, the
  // splash stayed up until fonts were ready and the swap to the app
  // happened in the same commit, so the boot animations rendered behind
  // the static splash and were never seen. The appReady effect below
  // still calls hideAsync as a fallback (a second call is a no-op).
  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  // The launch splash IS the boot content now (components/SplashMotion,
  // variant="launch"): drift, static glows, bloom, logo, tagline, amber
  // phrase, footnote — no LET'S BEGIN button. Its entrance starts at
  // mount (first layout), exactly like the old BootScreen choreography
  // did; the logo, bloom, drift and glows are font-free so they start
  // at mount, but the TEXT beats (tagline / amber / footnote) wait for
  // the fontsReady prop (appReady) — the 2026-11-17 font gate, after
  // the launch splash was caught rendering the whole tagline in the
  // fallback sans because fonts load slower than the 960ms text-beat
  // start in Expo Go.
  // The exit still waits for appReady AND onEntranceComplete (see the
  // RootLayout exit effect): the 26s drift is ambient, the exit keys
  // off the 2.34s arrival only. SplashMotion's launch variant never
  // calls useColors()/useTypography() — it uses DarkColors +
  // TYPOGRAPHY directly, because AppProvider does not wrap the boot
  // overlay.
  //
  // Tap-to-skip: the Pressable covers the whole overlay, so any tap
  // during the entrance skips immediately. The content wrapper below
  // keeps pointerEvents="none" so the tap reaches this Pressable, and
  // the overlay itself keeps pointerEvents auto until the veil lifts,
  // so no tap leaks through to the app underneath.
  return (
    <Pressable
      style={styles.bootRoot}
      testID="app-boot-screen"
      onLayout={hideSplash}
      onPress={onSkip}
    >
      <BackgroundGradient style={StyleSheet.absoluteFill} />
      {/* Boot content fades as one at the exit (260ms); the solid
          background underneath is the veil and lifts separately
          (440ms, starting 60ms later). */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: contentOpacity, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <SplashMotion
          variant="launch"
          fontsReady={fontsReady}
          reduceMotion={reduceMotion}
          alreadyPlayed={alreadyPlayed}
          onEntrancePlayed={() => getLaunchSplashSession().markPlayed()}
          onEntranceComplete={onEntranceComplete}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  const [appReady, setAppReady] = useState<boolean>(false);
  const [splashHidden, setSplashHidden] = useState<boolean>(false);
  const reduceMotion = useReduceMotion();
  const [bootVisible, setBootVisible] = useState<boolean>(true);
  const bootContentOpacity = useState(() => new Animated.Value(1))[0];
  const bootVeilOpacity = useState(() => new Animated.Value(1))[0];
  const [bootPointerNone, setBootPointerNone] = useState<boolean>(false);
  // Launch-splash exit gate: the exit starts only once the entrance is
  // done (or skipped, or Reduce-Motion-immediate) AND the app is ready.
  const [launchDone, setLaunchDone] = useState<boolean>(false);
  const [skipped, setSkipped] = useState<boolean>(false);
  // Route-known gate (2026-11-17): the exit also waits until the
  // user/profile load has settled — isUserLoaded from AppProvider,
  // bridged up via onRouteKnown below (RootLayout sits outside the
  // provider). Until the flag is known, onboardingComplete may still
  // be its fresh-sign-in default (false), so lifting the veil would
  // flash onboarding LET'S BEGIN at a returning veteran. The timeout
  // backstop fires 8s after boot start so a hung load can never
  // strand the user on the splash.
  const [routeKnown, setRouteKnown] = useState(false);
  const [routeTimedOut, setRouteTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRouteTimedOut(true), ROUTE_KNOWN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  // Captured ONCE at mount: getLaunchSplashSession().hasPlayed() flips
  // true at entrance start, so re-reading it on every render would kill
  // the entrance mid-play on the next re-render. The only way the
  // alreadyPlayed prop changes after mount is the tap-to-skip below.
  const [capturedOnce] = useState(() => getLaunchSplashSession().hasPlayed());
  // Tap-to-skip guard: once skipping/exiting, ignore further taps.
  const skipGuardRef = useRef(false);
  const handleBootSkip = useCallback(() => {
    if (skipGuardRef.current) return;
    skipGuardRef.current = true;
    getLaunchSplashSession().markPlayed();
    setSkipped(true);
    setLaunchDone(true);
  }, []);

  // t=0 for the launch timeline (lib/launchMotion.ts): the boot's first
  // frame. Home reads the clock so its entrance lands at t=940.
  useEffect(() => {
    markBootStart();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      if (__DEV__) {
        console.log('[RootLayout] Font loading timeout reached, continuing with fallback fonts');
      }
      setAppReady(true);
    }, FONT_LOAD_TIMEOUT_MS);

    const prepare = async () => {
      try {
        await loadCustomFonts();
      } catch (e) {
        if (__DEV__) {
          console.log('[RootLayout] Failed to load custom fonts:', e);
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) {
          setAppReady(true);
        }
      }
    };

    void prepare();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!appReady || splashHidden) return;
    // Soundscape prefetch no longer runs at launch (2026-11-16): it
    // downloaded every soundscape on Wi-Fi just because the app opened.
    // It now runs lazily, once, when the user first opens Sleep Prayer
    // (session.tsx, isSleepMode) via AudioManager.ensureAccessoryAudioPrefetched
    // — still Wi-Fi-gated there. Soundscape playback still downloads on
    // demand via AudioManager.getLocalUri, so skipping is safe.
    void SplashScreen.hideAsync()
      .then(() => {
        setSplashHidden(true);
      })
      .catch((error: unknown) => {
        if (__DEV__) {
          console.log('[RootLayout] Failed to hide splash screen:', error);
        }
      });
  }, [appReady, splashHidden]);

  // Launch handoff: once the app is ready AND the launch entrance is
  // done (launchDone — entrance complete, skipped, or
  // Reduce-Motion-immediate), the app mounts underneath the boot
  // screen and the boot exits in two beats — the content fades 1 -> 0
  // over 260ms, then the solid veil lifts 1 -> 0 over 440ms from 60ms
  // later. The exit also waits for the route to be known (routeReady
  // below — isUserLoaded from AppProvider, or the 8s timeout), so a
  // veteran never lifts onto onboarding while their profile is still
  // in flight; a true first-timer still exits to onboarding. pointerEvents go none when the veil starts lifting, so the
  // app underneath is touchable while the veil is still clearing.
  // Before appReady there is nothing under the overlay (the app mounts
  // only when appReady), so the exit never starts early — exiting
  // early would reveal a blank screen. bootExitDelayMs still applies
  // its floor from the boot clock: 0 in normal motion (the 2.34s
  // entrance is long past the old 760ms Still Point), and the 380ms
  // hold under Reduce Motion, when the veil alone fades 260ms and the
  // content rides along inside it. The app is mounted and interactive
  // underneath during the fade, so this costs no time past the lift.
  // Route-ready for the exit gate: known, or timed out (bounded).
  const routeReady = routeKnown || routeTimedOut;
  useEffect(() => {
    if (!appReady || !launchDone || !bootVisible || !routeReady) return;
    const delay = bootExitDelayMs(msSinceBootStart(), reduceMotion);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const anims: Animated.CompositeAnimation[] = [];
    let pointerTimer: ReturnType<typeof setTimeout> | null = null;
    const startExit = () => {
      if (reduceMotion) {
        // Static Hold + Fade: no content fade, the whole overlay lifts.
        setBootPointerNone(true);
        const veil = Animated.timing(bootVeilOpacity, {
          toValue: 0,
          duration: bootVeilDurationMs(true),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
        anims.push(veil);
        veil.start(({ finished }) => {
          if (finished) setBootVisible(false);
        });
        return;
      }
      const content = Animated.timing(bootContentOpacity, {
        toValue: 0,
        duration: BOOT_CONTENT_EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      });
      const veil = Animated.sequence([
        Animated.delay(BOOT_VEIL_EXIT_DELAY_MS),
        Animated.timing(bootVeilOpacity, {
          toValue: 0,
          duration: BOOT_VEIL_EXIT_MS,
          easing: Easing.bezier(0.33, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]);
      anims.push(content, veil);
      content.start();
      veil.start(({ finished }) => {
        if (finished) setBootVisible(false);
      });
      pointerTimer = setTimeout(() => setBootPointerNone(true), BOOT_VEIL_EXIT_DELAY_MS);
    };
    if (delay > 0) {
      timers.push(setTimeout(startExit, delay));
    } else {
      startExit();
    }
    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (pointerTimer) clearTimeout(pointerTimer);
      anims.forEach((anim) => anim.stop());
    };
  }, [appReady, launchDone, bootContentOpacity, bootVeilOpacity, bootVisible, reduceMotion, routeReady]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.gestureRoot}>
            {appReady ? (
              <AppProvider>
                <RootLayoutNav onRouteKnown={setRouteKnown} />
              </AppProvider>
            ) : null}
            {bootVisible ? (
              <Animated.View
                style={[styles.bootOverlay, { opacity: bootVeilOpacity }]}
                pointerEvents={bootPointerNone ? 'none' : 'auto'}
              >
                <BootScreen
                  contentOpacity={bootContentOpacity}
                  alreadyPlayed={capturedOnce || skipped}
                  onEntranceComplete={() => setLaunchDone(true)}
                  onSkip={handleBootSkip}
                  fontsReady={appReady}
                />
              </Animated.View>
            ) : null}
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    backgroundColor: DarkColors.background,
  },
  bootRoot: {
    flex: 1,
    backgroundColor: DarkColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bootOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: DarkColors.background,
  },
});
