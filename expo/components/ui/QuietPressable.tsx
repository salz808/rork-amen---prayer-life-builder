import React, { useCallback, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';

// Shared press feedback (M-4): quiet, always DOWN — never a scale-up.
// Cards press to 0.984, pills/buttons to 0.965, opacity dips to 0.92
// over 100ms; release is a critically damped spring (stiffness 300,
// damping 28, mass 0.9) with zero bounce. Under Reduce Motion the
// scale stays 1 and only the opacity breathes (1 -> 0.88 -> 1).
// Call sites keep their own haptics in onPress, as they do today.
export const QUIET_PRESS_CARD_SCALE = 0.984;
export const QUIET_PRESS_PILL_SCALE = 0.965;
export const QUIET_PRESS_OPACITY = 0.92;
export const QUIET_PRESS_IN_MS = 100;
export const QUIET_PRESS_REDUCED_OPACITY = 0.88;
export const QUIET_PRESS_OUT_SPRING = {
  stiffness: 300,
  damping: 28,
  mass: 0.9,
} as const;

export type QuietPressableVariant = 'card' | 'pill';

interface QuietPressableProps extends Omit<PressableProps, 'style'> {
  variant?: QuietPressableVariant;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

function QuietPressableComponent({
  variant = 'card',
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: QuietPressableProps) {
  const reduceMotion = useReduceMotion();
  const scaleAnim = useState(() => new Animated.Value(1))[0];
  const opacityAnim = useState(() => new Animated.Value(1))[0];
  const pressedScale = variant === 'pill' ? QUIET_PRESS_PILL_SCALE : QUIET_PRESS_CARD_SCALE;

  const handlePressIn = useCallback(
    (e: any) => {
      if (reduceMotion) {
        Animated.timing(opacityAnim, {
          toValue: QUIET_PRESS_REDUCED_OPACITY,
          duration: QUIET_PRESS_IN_MS,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: pressedScale,
            duration: QUIET_PRESS_IN_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: QUIET_PRESS_OPACITY,
            duration: QUIET_PRESS_IN_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
      onPressIn?.(e);
    },
    [opacityAnim, onPressIn, pressedScale, reduceMotion, scaleAnim]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      if (reduceMotion) {
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: QUIET_PRESS_IN_MS,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            stiffness: QUIET_PRESS_OUT_SPRING.stiffness,
            damping: QUIET_PRESS_OUT_SPRING.damping,
            mass: QUIET_PRESS_OUT_SPRING.mass,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: QUIET_PRESS_IN_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
      onPressOut?.(e);
    },
    [opacityAnim, onPressOut, reduceMotion, scaleAnim]
  );

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      <Pressable
        accessibilityRole="button"
        style={style}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default React.memo(QuietPressableComponent);
