import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { AppProvider } from '@/providers/AppProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import DarkColors from '@/constants/darkColors'
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AudioManager } from '@/lib/audioManager';

void SplashScreen.preventAutoHideAsync();

try {
  const Purchases = require('react-native-purchases').default;
  const getRCToken = () => {
    if (__DEV__ || Platform.OS === 'web') return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? '';
    return Platform.select({
      ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
      android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
      default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? '',
    });
  };
  const rcToken = getRCToken();
  if (rcToken) {
    try {
      Purchases.configure({ apiKey: rcToken });
      if (__DEV__) {
        console.log('[RevenueCat] Configured');
      }
    } catch (e) {
      if (__DEV__) {
        console.log('[RevenueCat] Failed to configure:', e);
      }
    }
  }
} catch {
  // Purchases require failed
}

const queryClient = new QueryClient();
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
  return (
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
    </Stack>
  );
}

function BootScreen() {
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslateY = useRef(new Animated.Value(12)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(16)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.96)).current;
  const glowOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.loop(
      Animated.timing(ringRotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

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
    ).start();
  }, [glowOpacity, glowScale, ringRotation, subtitleOpacity, subtitleTranslateY, wordmarkOpacity, wordmarkTranslateY]);

  const rotate = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.bootRoot} testID="app-boot-screen">
      <LinearGradient
        colors={[DarkColors.bgGradient1, DarkColors.bgGradient2, DarkColors.bgGradient3]}
        style={StyleSheet.absoluteFill}
      />
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
      <View style={styles.bootContent}>
        <View style={styles.bootMarkWrap}>
          <Animated.View style={[styles.bootSpinnerRing, { transform: [{ rotate }] }]} />
          <View style={styles.bootSpinnerCore} />
        </View>
        <Animated.Text
          style={[
            styles.bootWordmark,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateY: wordmarkTranslateY }],
            },
          ]}
        >
          Amen
        </Animated.Text>
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
    void AudioManager.prefetchAccessoryAudio();
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

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.gestureRoot}>
            {appReady ? (
              <AppProvider>
                <RootLayoutNav />
              </AppProvider>
            ) : (
              <BootScreen />
            )}
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
  bootSpinnerRing: {
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
  bootWordmark: {
    color: DarkColors.text,
    fontSize: 52,
    fontFamily: 'Montserrat_200ExtraLight',
    letterSpacing: 0.4,
  },
  bootSubtitle: {
    color: DarkColors.textMuted,
    fontSize: 16,
    letterSpacing: 0.2,
    fontFamily: 'CormorantGaramond_400Regular_Italic',
  },
});
