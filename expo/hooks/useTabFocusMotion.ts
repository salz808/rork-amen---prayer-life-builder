import { useCallback, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useReduceMotion } from '@/hooks/useReduceMotion';

// Tab cushion (M-8): when a tab screen regains focus, its content
// settles in from 0.84 opacity / +3pt over 200ms — never from 0,
// which flashes. Under Reduce Motion the content is already at rest.
// Returns an Animated style to spread onto the screen's root view.
// Wired into Home only; the other tabs are the coordinator's final pass.
export const TAB_FOCUS_START_OPACITY = 0.84;
export const TAB_FOCUS_START_Y = 3;
export const TAB_FOCUS_MS = 200;

export function useTabFocusMotion() {
  const reduceMotion = useReduceMotion();
  const opacity = useState(() => new Animated.Value(1))[0];
  const translateY = useState(() => new Animated.Value(0))[0];

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      opacity.setValue(TAB_FOCUS_START_OPACITY);
      translateY.setValue(TAB_FOCUS_START_Y);
      const settle = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: TAB_FOCUS_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: TAB_FOCUS_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
      settle.start();
      return () => settle.stop();
    }, [opacity, reduceMotion, translateY])
  );

  return { opacity, transform: [{ translateY }] };
}
