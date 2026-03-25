import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
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
} catch (e) {
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
    </Stack>
  );
}

function BootScreen() {
  return (
    <View style={styles.bootRoot} testID="app-boot-screen">
      <LinearGradient
        colors={['#0A0603', '#140C06', '#0A0603']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bootGlowLarge} />
      <View style={styles.bootGlowSmall} />
      <View style={styles.bootContent}>
        <Text style={styles.bootWordmark}>Amen</Text>
        <Text style={styles.bootSubtitle}>Loading your prayer space</Text>
        <ActivityIndicator color="#C8894A" size="small" />
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
    AudioManager.prefetchAccessoryAudio();
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
    backgroundColor: '#0A0603',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bootGlowLarge: {
    position: 'absolute',
    top: -140,
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: 'rgba(200, 137, 74, 0.12)',
    transform: [{ scaleY: 0.62 }],
  },
  bootGlowSmall: {
    position: 'absolute',
    bottom: 90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(228, 170, 105, 0.08)',
  },
  bootContent: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  bootWordmark: {
    color: '#F4EDE0',
    fontSize: 52.9,
    fontFamily: 'Montserrat_200ExtraLight',
    letterSpacing: 0.4,
  },
  bootSubtitle: {
    color: 'rgba(244,237,224,0.62)',
    fontSize: 17.3,
    letterSpacing: 0.2,
  },
});
