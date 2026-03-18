import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initializeSentry() {
  if (!SENTRY_DSN || __DEV__) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    enabled: !__DEV__,
    enableAutoSessionTracking: true,
    enableNative: Platform.OS !== 'web',
    beforeSend(event) {
      if (__DEV__) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
