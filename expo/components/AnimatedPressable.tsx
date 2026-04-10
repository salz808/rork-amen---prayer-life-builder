import React, { useRef, useCallback, useState, useMemo } from 'react';
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
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const glowOpacityAnim = useRef(new Animated.Value(0.18)).current;
  const glowRadiusAnim = useRef(new Animated.Value(10)).current;
  const [hovered, setHovered] = useState<boolean>(false);

  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  
  // Extract background color dynamically. Ignore transparent/undefined to avoid glowing icons
  const baseColor = flattenedStyle.backgroundColor && 
                    flattenedStyle.backgroundColor !== 'transparent' &&
                    typeof flattenedStyle.backgroundColor === 'string'
    ? flattenedStyle.backgroundColor 
    : null;
    
  const borderRadius = flattenedStyle.borderRadius || 16;
  const isGlowing = !disableGlow && baseColor != null;

  const handlePressIn = useCallback(
    (e: any) => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: scaleValue,
          tension: 250,
          friction: 14,
          useNativeDriver: true,
        }),
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
        Animated.spring(glowRadiusAnim, {
          toValue: 6,
          tension: 300,
          friction: 20,
          useNativeDriver: true,
        }),
      ]).start();
      onPressIn?.(e);
    },
    [opacityAnim, onPressIn, scaleAnim, scaleValue, glowOpacityAnim, glowRadiusAnim]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 250,
          friction: 14,
          useNativeDriver: true,
        }),
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
        Animated.spring(glowRadiusAnim, {
          toValue: hovered ? 14 : 10,
          tension: 200,
          friction: 14,
          useNativeDriver: true,
        }),
      ]).start();
      onPressOut?.(e);
    },
    [opacityAnim, onPressOut, scaleAnim, hovered, glowOpacityAnim, glowRadiusAnim]
  );

  const handlePress = useCallback(
    (e: any) => {
      if (haptic) {
        void Haptics.impactAsync(hapticStyle);
      }
      onPress?.(e);
    },
    [haptic, hapticStyle, onPress]
  );

  const hoverProps = Platform.OS === 'web'
    ? {
        onMouseEnter: () => {
          setHovered(true);
          Animated.parallel([
            Animated.spring(scaleAnim, {
              toValue: 1.015,
              tension: 250,
              friction: 14,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.28,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.spring(glowRadiusAnim, {
              toValue: 14,
              tension: 200,
              friction: 14,
              useNativeDriver: true,
            }),
          ]).start();
        },
        onMouseLeave: () => {
          setHovered(false);
          Animated.parallel([
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 250,
              friction: 14,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.18,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.spring(glowRadiusAnim, {
              toValue: 10,
              tension: 200,
              friction: 14,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }
    : {};

  return (
    <Animated.View
      style={[{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }, isGlowing && { zIndex: 1 }]}
      {...(Platform.OS === 'web' ? hoverProps : {})}
    >
      {isGlowing && (
        <Animated.View style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: baseColor,
          borderRadius,
          shadowColor: baseColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: glowOpacityAnim,
          shadowRadius: glowRadiusAnim,
          zIndex: -1,
        }} />
      )}
      <Pressable
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
