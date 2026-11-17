import React, { useCallback, useState, useMemo } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  Platform,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  haptic?: boolean;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  disableGlow?: boolean;
}

function AnimatedPressableComponent({
  scaleValue = 0.95,
  haptic = true,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  onPressIn,
  onPressOut,
  onPress,
  children,
  style,
  hoverStyle,
  disableGlow,
  ...rest
}: AnimatedPressableProps) {
  const scaleAnim = useState(() => new Animated.Value(1))[0]
  const opacityAnim = useState(() => new Animated.Value(1))[0]
  const glowOpacityAnim = useState(() => new Animated.Value(0.18))[0]
  // GPT-6 item 3 (2026-11-16): the glow used to animate shadowOpacity
  // AND shadowRadius with useNativeDriver:true — the native driver
  // cannot animate shadow props at all, so those springs silently did
  // nothing (or warned) on device. The shadow itself is now STATIC
  // (fixed radius 10, fixed opacity 1 — the layer's own opacity
  // supplies the effective 0.18 / 0.08 / 0.28 levels, exactly as
  // before). The bloom is a scale on the glow layer instead:
  // 0.98 pressed, 1 resting, 1.06 hovered (web). Opacity and scale
  // are both native-driver supported. The scale springs stay gated
  // by Reduce Motion like the wrapper scale; the opacity fade stays
  // as the press feedback when Reduce Motion is on.
  const glowScaleAnim = useState(() => new Animated.Value(1))[0]
  const [hovered, setHovered] = useState<boolean>(false);
  // Haptics (d) (2026-11-16): this component fires a Light haptic on
  // every press by default (haptic=true) — and many call sites fire
  // their own Haptics.impactAsync in the same onPress, so those taps
  // buzz twice. The double-buzz call sites live in screens outside
  // this track and are flagged for the coordinator; what this file
  // owns is the gate: with Reduce Motion on, no haptic and no scale
  // spring (the opacity fade stays as the press feedback).
  const reduceMotion = useReduceMotion();

  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  
  // Extract background color dynamically. Ignore transparent/undefined to avoid glowing icons
  const baseColor = flattenedStyle.backgroundColor && 
                    flattenedStyle.backgroundColor !== 'transparent' &&
                    typeof flattenedStyle.backgroundColor === 'string'
    ? flattenedStyle.backgroundColor 
    : null;
    
  const borderRadius = flattenedStyle.borderRadius || 16;
  const isGlowing = !disableGlow && baseColor != null;

  // Arena audit (Profile back bar, 2026-11-15): the outer wrapper is a
  // plain View, so in a column parent it stretches to full width
  // (ScrollView content defaults to stretch) while the Pressable inside
  // keeps its own 44x44. The glow layer is absolute-fill, so it filled
  // the stretched wrapper — a fixed-size button with a background
  // rendered as a full-width bar. Constrain the wrapper to the
  // button's explicit numeric size when it has one; cards (no explicit
  // size) are unaffected, and centering is preserved because an
  // explicit width/height overrides stretch without moving the box.
  const fixedSize = useMemo(() => {
    // Plain mutable accumulator: ViewStyle's props are readonly in
    // this RN type version (TS2540 on direct assignment).
    const size: { width?: number; height?: number } = {};
    if (typeof flattenedStyle.width === 'number') size.width = flattenedStyle.width;
    if (typeof flattenedStyle.height === 'number') size.height = flattenedStyle.height;
    return size;
  }, [flattenedStyle]);

  const handlePressIn = useCallback(
    (e: any) => {
      Animated.parallel([
        ...(reduceMotion
          ? []
          : [
              Animated.spring(scaleAnim, {
                toValue: scaleValue,
                tension: 250,
                friction: 14,
                useNativeDriver: true,
              }),
            ]),
        Animated.timing(opacityAnim, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacityAnim, {
          toValue: 0.08,
          duration: 100,
          useNativeDriver: true,
        }),
        ...(reduceMotion
          ? []
          : [
              Animated.spring(glowScaleAnim, {
                toValue: 0.98,
                tension: 300,
                friction: 20,
                useNativeDriver: true,
              }),
            ]),
      ]).start();
      onPressIn?.(e);
    },
    [opacityAnim, onPressIn, scaleAnim, scaleValue, glowOpacityAnim, glowScaleAnim, reduceMotion]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      Animated.parallel([
        ...(reduceMotion
          ? []
          : [
              Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 250,
                friction: 14,
                useNativeDriver: true,
              }),
            ]),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacityAnim, {
          toValue: hovered ? 0.28 : 0.18,
          duration: 200,
          useNativeDriver: true,
        }),
        ...(reduceMotion
          ? []
          : [
              Animated.spring(glowScaleAnim, {
                toValue: 1,
                tension: 200,
                friction: 14,
                useNativeDriver: true,
              }),
            ]),
      ]).start();
      onPressOut?.(e);
    },
    [opacityAnim, onPressOut, scaleAnim, hovered, glowOpacityAnim, glowScaleAnim, reduceMotion]
  );

  const handlePress = useCallback(
    (e: any) => {
      if (haptic && !reduceMotion) {
        void Haptics.impactAsync(hapticStyle);
      }
      onPress?.(e);
    },
    [haptic, hapticStyle, onPress, reduceMotion]
  );

  const hoverProps = Platform.OS === 'web'
    ? {
        onMouseEnter: () => {
          setHovered(true);
          Animated.parallel([
            ...(reduceMotion
              ? []
              : [
                  Animated.spring(scaleAnim, {
                    toValue: 1.015,
                    tension: 250,
                    friction: 14,
                    useNativeDriver: true,
                  }),
                ]),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.28,
              duration: 200,
              useNativeDriver: true,
            }),
            ...(reduceMotion
              ? []
              : [
                  Animated.spring(glowScaleAnim, {
                    toValue: 1.06,
                    tension: 200,
                    friction: 14,
                    useNativeDriver: true,
                  }),
                ]),
          ]).start();
        },
        onMouseLeave: () => {
          setHovered(false);
          Animated.parallel([
            ...(reduceMotion
              ? []
              : [
                  Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 250,
                    friction: 14,
                    useNativeDriver: true,
                  }),
                ]),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.18,
              duration: 200,
              useNativeDriver: true,
            }),
            ...(reduceMotion
              ? []
              : [
                  Animated.spring(glowScaleAnim, {
                    toValue: 1,
                    tension: 200,
                    friction: 14,
                    useNativeDriver: true,
                  }),
                ]),
          ]).start();
        },
      }
    : {};

  return (
    <Animated.View
      style={[{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }, fixedSize, isGlowing && { zIndex: 1 }]}
      {...(Platform.OS === 'web' ? hoverProps : {})}
    >
      {isGlowing && (
        <Animated.View style={{
          ...absoluteFillObject,
          backgroundColor: baseColor,
          borderRadius,
          // GPT-6 item 3: the shadow is STATIC — fixed radius 10 and
          // opacity 1. The layer's own animated opacity (0.18 resting /
          // 0.08 pressed / 0.28 hovered) sets the effective shadow
          // strength, exactly as before, and the scale bloom replaces
          // the old animated shadowRadius. Both animated props are
          // native-driver supported; shadow props are not.
          shadowColor: baseColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 1,
          shadowRadius: 10,
          opacity: glowOpacityAnim,
          transform: [{ scale: glowScaleAnim }],
          zIndex: -1,
        }} />
      )}
      <Pressable
        accessibilityRole="button"
        style={[style, hovered && hoverStyle, isGlowing && { overflow: 'hidden' }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default React.memo(AnimatedPressableComponent);
