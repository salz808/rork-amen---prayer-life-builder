import { Platform } from 'react-native';
import { reportError } from '@/lib/crashReporter';

export type RevenueCatEnvironment = 'test' | 'ios' | 'android';

export type RevenueCatDependency = {
  path: string;
  purpose: string;
};

const revenueCatDependencies: RevenueCatDependency[] = [
  {
    path: 'expo/app/_layout.tsx',
    purpose: 'Top-level SDK configuration during app startup.',
  },
  {
    path: 'expo/providers/AppProvider.tsx',
    purpose: 'Customer identity sync, entitlement refresh, and subscription listener handling.',
  },
  {
    path: 'expo/app/paywall.tsx',
    purpose: 'Primary paywall offerings, purchase flow, and restore purchases flow.',
  },
  {
    path: 'expo/app/(tabs)/give/index.tsx',
    purpose: 'Giving screen offerings, purchase flow, and restore purchases flow.',
  },
  {
    path: 'expo/services/entitlements.ts',
    purpose: 'Trusted entitlement normalization and premium feature gating.',
  },
  {
    path: 'expo/supabase/functions/revenuecat-webhook/index.ts',
    purpose: 'Server-side webhook handling for entitlement and subscriber sync.',
  },
  {
    path: 'expo/supabase/config.toml',
    purpose: 'Supabase Edge Function registration for the RevenueCat webhook.',
  },
  {
    path: 'expo/package.json',
    purpose: 'Client SDK dependency declaration for react-native-purchases.',
  },
];

let hasConfiguredRevenueCat = false;

export function getRevenueCatEnvironment(): RevenueCatEnvironment {
  if (__DEV__ || Platform.OS === 'web') {
    return 'test';
  }

  if (Platform.OS === 'ios') {
    return 'ios';
  }

  if (Platform.OS === 'android') {
    return 'android';
  }

  return 'test';
}

export function getRevenueCatApiKey(): string {
  const environment = getRevenueCatEnvironment();
  const testApiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? '';
  const iosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
  const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';

  if (environment === 'test') {
    // Audit round 4, fix lane 3 (D-M-4): a missing test key used to
    // silently configure the PRODUCTION RevenueCat project in dev/web.
    // That made test purchases indistinguishable from production ones at
    // the SDK layer. Now a missing test key returns '' and configure()
    // fails loudly (missing-key log in dev, error report in production)
    // instead of silently using the production project.
    return testApiKey;
  }

  if (environment === 'ios') {
    return iosApiKey;
  }

  return androidApiKey;
}

export function getRevenueCatDependencies(): RevenueCatDependency[] {
  return revenueCatDependencies;
}

export function configureRevenueCat(): void {
  if (hasConfiguredRevenueCat) {
    return;
  }

  try {
    const Purchases = require('react-native-purchases').default;
    const apiKey = getRevenueCatApiKey();
    const environment = getRevenueCatEnvironment();

    if (!apiKey) {
      if (__DEV__) {
        console.log('[RevenueCat] Missing API key', {
          environment,
          platform: Platform.OS,
          expectedEnvironmentVariables: [
            'EXPO_PUBLIC_REVENUECAT_TEST_API_KEY',
            'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
            'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY',
          ],
          dependencies: revenueCatDependencies.map((dependency) => dependency.path),
        });
      } else {
        // Production must not fail silently here: without a key every user
        // stays FREE with no signal anywhere. The error report is the signal.
        reportError('RevenueCatMissingKey', new Error('RevenueCat API key missing in production'), {
          environment,
          platform: Platform.OS,
        });
      }
      return;
    }

    Purchases.configure({ apiKey });
    hasConfiguredRevenueCat = true;

    if (__DEV__) {
      console.log('[RevenueCat] Configured', {
        environment,
        dependencyCount: revenueCatDependencies.length,
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[RevenueCat] Failed to configure', error);
    } else {
      // Production must not fail silently here: without a configured
      // SDK every user stays FREE with no signal anywhere. The error
      // report is the signal (mirrors the missing-key path above).
      reportError('RevenueCatConfigureFailed', error, {
        environment: getRevenueCatEnvironment(),
        platform: Platform.OS,
      });
    }
  }
}
