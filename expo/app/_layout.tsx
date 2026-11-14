import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/appQueryClient';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { AppProvider, useApp } from '@/providers/AppProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import SupportCardModal from '@/components/SupportCardModal';
import { DatabaseService } from '@/lib/database';
import { getSafeSession, supabase } from '@/lib/supabase';
import DarkColors from '@/constants/darkColors'
import { TYPOGRAPHY } from '@/constants/typography';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  BOOT_BLOOM_MS,
  BOOT_SUBTITLE_MS,
  BOOT_SWEEP_DELAY_MS,
  BOOT_SWEEP_MS,
  BOOT_WORDMARK_MS,
  LAUNCH_STAGGER_MS,
  bootExitDurationMs,
} from '@/lib/launchMotion';
import { AudioManager } from '@/lib/audioManager';
import NetInfo from '@react-native-community/netinfo';
import { configureRevenueCat } from '@/services/revenuecat';
import { installErrorGuards } from '@/lib/installErrorGuards';

installErrorGuards();

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

async function loadCustomFonts(): Promise<void> {
  await Font.loadAsync({
    Montserrat_100Thin: require('@expo-google-fonts/montserrat/100Thin/Montserrat_100Thin.ttf'),
    Montserrat_200ExtraLight: require('@expo-google-fonts/montserrat/200ExtraLight/Montserrat_200ExtraLight.ttf'),
    Montserrat_300Light: require('@expo-google-fonts/montserrat/300Light/Montserrat_300Light.ttf'),
    Montserrat_400Regular: require('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'),
    Montserrat_500Medium: require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf'),
    Montserrat_600SemiBold: require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
    Montserrat_700Bold: require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
    CormorantGaramond_300Light: require('@expo-google-fonts/cormorant-garamond/300Light/CormorantGaramond_300Light.ttf'),
    CormorantGaramond_400Regular: require('@expo-google-fonts/cormorant-garamond/400Regular/CormorantGaramond_400Regular.ttf'),
    CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf'),
    CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
    CormorantGaramond_700Bold: require('@expo-google-fonts/cormorant-garamond/700Bold/CormorantGaramond_700Bold.ttf'),
    CormorantGaramond_300Light_Italic: require('@expo-google-fonts/cormorant-garamond/300Light_Italic/CormorantGaramond_300Light_Italic.ttf'),
    CormorantGaramond_400Regular_Italic: require('@expo-google-fonts/cormorant-garamond/400Regular_Italic/CormorantGaramond_400Regular_Italic.ttf'),
    CormorantGaramond_500Medium_Italic: require('@expo-google-fonts/cormorant-garamond/500Medium_Italic/CormorantGaramond_500Medium_Italic.ttf'),
    CormorantGaramond_600SemiBold_Italic: require('@expo-google-fonts/cormorant-garamond/600SemiBold_Italic/CormorantGaramond_600SemiBold_Italic.ttf'),
  });
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  // Audit round 3, J-S10 (partial): a reminder tap used to push /session
  // unconditionally — including for a user who never finished onboarding,
  // landing them mid-journey. Route those taps to onboarding instead.
  // The ref (synced in an effect, never written during render) keeps the
  // notification listener reading the latest value without re-subscribing.
  const { state, supportCardVariant, supportCardBlocked, dismissSupportCard } = useApp();
  const onboardingCompleteRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    onboardingCompleteRef.current = state.user?.onboardingComplete;
  });

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

function BootScreen() {
  const reduceMotion = useReduceMotion();
  const splashHiddenRef = useRef(false);
  const bloom = useState(() => new Animated.Value(0))[0]
  const wordmarkOpacity = useState(() => new Animated.Value(0))[0]
  const wordmarkTranslateY = useState(() => new Animated.Value(12))[0]
  const subtitleOpacity = useState(() => new Animated.Value(0))[0]
  const subtitleTranslateY = useState(() => new Animated.Value(16))[0]
  const orbit = useState(() => new Animated.Value(0))[0]
  const coreScale = useState(() => new Animated.Value(1))[0]
  const sweepX = useState(() => new Animated.Value(0))[0]
  const sweepOpacity = useState(() => new Animated.Value(0))[0]
  const glowScale = useState(() => new Animated.Value(0.96))[0]
  const glowOpacity = useState(() => new Animated.Value(0.35))[0]

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

  // Launch choreography (shared beat in lib/launchMotion.ts): the glow
  // blooms, the wordmark rises, the subtitle settles — one hero at a
  // time on the 120ms stagger — while a slow orbit sweep and the
  // breathing glow run as ambient secondary motion. The old linear
  // spinner is gone: a spinner reads as "waiting", an orbit reads as
  // alive. Under Reduce Motion everything renders still — no loops, no
  // sweep, no rises.
  useEffect(() => {
    const running: { stop: () => void }[] = [];
    const start = (anim: Animated.CompositeAnimation) => {
      running.push(anim);
      anim.start();
    };
    if (reduceMotion) {
      bloom.setValue(1);
      wordmarkOpacity.setValue(1);
      wordmarkTranslateY.setValue(0);
      subtitleOpacity.setValue(1);
      subtitleTranslateY.setValue(0);
      glowOpacity.setValue(0.35);
      glowScale.setValue(0.96);
      return () => {
        running.forEach((anim) => anim.stop());
      };
    }

    start(
      Animated.stagger(LAUNCH_STAGGER_MS, [
        Animated.timing(bloom, {
          toValue: 1,
          duration: BOOT_BLOOM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(wordmarkOpacity, {
            toValue: 1,
            duration: BOOT_WORDMARK_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(wordmarkTranslateY, {
            toValue: 0,
            duration: BOOT_WORDMARK_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: BOOT_SUBTITLE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(subtitleTranslateY, {
            toValue: 0,
            duration: BOOT_SUBTITLE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // Light sweep across the wordmark once it lands — a single pass,
    // then gone. The sweep is clipped to the logo bounds by the wrap's
    // overflow.
    start(
      Animated.sequence([
        Animated.delay(BOOT_SWEEP_DELAY_MS),
        Animated.parallel([
          Animated.timing(sweepX, {
            toValue: 1,
            duration: BOOT_SWEEP_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(sweepOpacity, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.delay(BOOT_SWEEP_MS - 320),
            Animated.timing(sweepOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ])
    );

    // Ambient: the orbit arc sweeps out and back (eased, never a linear
    // spin), the core breathes, the glow breathes.
    start(
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbit, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(orbit, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    );
    start(
      Animated.loop(
        Animated.sequence([
          Animated.timing(coreScale, {
            toValue: 1.12,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(coreScale, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    start(
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.02,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.52,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 0.96,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.35,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      )
    );
    return () => {
      running.forEach((anim) => anim.stop());
    };
  }, [bloom, coreScale, glowOpacity, glowScale, orbit, reduceMotion, subtitleOpacity, subtitleTranslateY, sweepOpacity, sweepX, wordmarkOpacity, wordmarkTranslateY]);

  // The orbit arc sweeps out and back (0° → 270° → 0°), never a full
  // linear spin; the sweep band travels once across the wordmark.
  const orbitRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '270deg'],
  });
  const bloomScale = bloom.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });
  const sweepTranslateX = sweepX.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });

  return (
    <View style={styles.bootRoot} testID="app-boot-screen" onLayout={hideSplash}>
      <LinearGradient
        colors={[DarkColors.bgGradient1, DarkColors.bgGradient2, DarkColors.bgGradient3]}
        style={StyleSheet.absoluteFill}
      />
      {/* Glow bloom: the whole glow field fades and grows in once, then
          the breathing loop inside takes over. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: bloom,
            transform: [{ scale: bloomScale }],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bootGlowLarge,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }, { scaleY: 0.62 }],
            },
          ]}
        />
        <View pointerEvents="none" style={styles.bootGlowSmall} />
      </Animated.View>
      <View style={styles.bootContent}>
        <View style={styles.bootMarkWrap}>
          <Animated.View style={[styles.bootOrbitRing, { transform: [{ rotate: orbitRotate }] }]} />
          <Animated.View style={[styles.bootSpinnerCore, { transform: [{ scale: coreScale }] }]} />
        </View>
        <Animated.View
          style={[
            styles.bootLogoWrap,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateY: wordmarkTranslateY }],
            },
          ]}
        >
          <Image
            source={require('../assets/images/triad-prayer-logo.png')}
            style={styles.bootLogo}
            resizeMode="contain"
            accessibilityLabel="TRIAD Prayer"
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bootSweep,
              {
                opacity: sweepOpacity,
                transform: [{ translateX: sweepTranslateX }, { rotate: '18deg' }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(200,137,74,0)', 'rgba(224,168,104,0.5)', 'rgba(200,137,74,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
        <Animated.Text
          style={[
            styles.bootSubtitle,
            {
              opacity: subtitleOpacity,
              transform: [{ translateY: subtitleTranslateY }],
            },
          ]}
        >
          Loading your prayer space
        </Animated.Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  const [appReady, setAppReady] = useState<boolean>(false);
  const [splashHidden, setSplashHidden] = useState<boolean>(false);
  const reduceMotion = useReduceMotion();
  const [bootVisible, setBootVisible] = useState<boolean>(true);
  const bootFade = useState(() => new Animated.Value(1))[0];

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
    // Round-14 M6: soundscape prefetch is Wi-Fi-gated — the URIs are
    // Google Drive downloads, so an any-network prefetch on first
    // frame could burn cellular data and hit Drive quota. Skipping is
    // safe: soundscape playback downloads on demand via
    // AudioManager.getLocalUri. A NetInfo failure also skips (rather
    // than prefetching blind); the prefetch itself already no-ops on
    // web. Drive 403/quota distinct logging lives in audioManager,
    // not here — see the fix report flag.
    void (async () => {
      try {
        const net = await NetInfo.fetch();
        if (net.isConnected && net.type === 'wifi') {
          await AudioManager.prefetchAccessoryAudio();
        } else if (__DEV__) {
          console.log('[RootLayout] Skipping soundscape prefetch (not on Wi-Fi)');
        }
      } catch {
        // NetInfo unavailable — skip; on-demand download still works.
      }
    })();
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

  // Launch handoff: once the app is ready it mounts underneath the boot
  // screen, and the boot veil fades out over it (350ms) instead of the
  // old instant swap — one continuous arc from splash to first paint.
  // Under Reduce Motion the veil lifts instantly. The app is mounted
  // and interactive underneath during the fade, so this costs no time.
  useEffect(() => {
    if (!appReady || !bootVisible) return;
    const fade = Animated.timing(bootFade, {
      toValue: 0,
      duration: bootExitDurationMs(reduceMotion),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) setBootVisible(false);
    });
    return () => fade.stop();
  }, [appReady, bootFade, bootVisible, reduceMotion]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.gestureRoot}>
            {appReady ? (
              <AppProvider>
                <RootLayoutNav />
              </AppProvider>
            ) : null}
            {bootVisible ? (
              <Animated.View
                style={[styles.bootOverlay, { opacity: appReady ? bootFade : 1 }]}
                pointerEvents={appReady ? 'none' : 'auto'}
              >
                <BootScreen />
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
  bootGlowLarge: {
    position: 'absolute',
    top: -136,
    width: 416,
    height: 416,
    borderRadius: 999,
    backgroundColor: DarkColors.accentBg,
  },
  bootGlowSmall: {
    position: 'absolute',
    bottom: 96,
    width: 256,
    height: 256,
    borderRadius: 999,
    backgroundColor: DarkColors.overlayLight,
  },
  bootContent: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  bootMarkWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bootOrbitRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: DarkColors.border,
    borderTopColor: DarkColors.accent,
    borderRightColor: DarkColors.accentDark,
  },
  bootSpinnerCore: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: DarkColors.overlayLight,
    borderWidth: 1,
    borderColor: DarkColors.borderLight,
  },
  bootLogoWrap: {
    width: 196,
    height: 83,
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the light sweep to the logo bounds.
    overflow: 'hidden',
  },
  bootSweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    left: 0,
    width: 90,
  },
  bootOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: DarkColors.background,
  },
  bootLogo: {
    width: '100%',
    height: '100%',
  },
  bootSubtitle: {
    color: DarkColors.textSecondary,
    fontSize: TYPOGRAPHY.sectionTitle.size,
    lineHeight: TYPOGRAPHY.sectionTitle.lineHeight,
    letterSpacing: 0.2,
    fontFamily: 'CormorantGaramond_400Regular_Italic',
  },
});
