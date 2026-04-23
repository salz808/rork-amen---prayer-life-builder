import { Platform } from 'react-native';

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

  if (environment === 'test') {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? '';
  }

  if (environment === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
  }

  return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';
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
          dependencies: revenueCatDependencies.map((dependency) => dependency.path),
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
    }
  }
}
