import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export function useScreenProtection(enabled: boolean, key: string): void {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') {
      return;
    }

    let mounted = true;

    const protectScreen = async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync(key);

        if (Platform.OS === 'ios') {
          await ScreenCapture.enableAppSwitcherProtectionAsync(0.65);
        }
      } catch {
        if (__DEV__) {
          console.warn('[ScreenProtection] Failed to enable screen protection');
        }
      }
    };

    void protectScreen();

    return () => {
      mounted = false;

      void ScreenCapture.allowScreenCaptureAsync(key).catch(() => {
        if (__DEV__) {
          console.warn('[ScreenProtection] Failed to disable screen protection');
        }
      });

      if (Platform.OS === 'ios') {
        void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {
          if (__DEV__) {
            console.warn('[ScreenProtection] Failed to disable app switcher protection');
          }
        });
      }
    };
  }, [enabled, key]);
}
