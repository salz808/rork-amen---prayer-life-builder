import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

// The arc's strokeDashoffset is an SVG prop, not a style — the plain
// RN Animated API drives it via an animated component (no Reanimated
// in this project). Each progress step animates linearly over the same
// 1s cadence the timers tick at, so the arc sweeps continuously
// instead of jumping once per second.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  backgroundColor?: string;
  children?: React.ReactNode;
}

export default function ProgressRing({
  progress,
  size = 200,
  strokeWidth = 6,
  backgroundColor,
  children,
}: ProgressRingProps) {
  const C = useColors();
  const ringBg = backgroundColor ?? C.border;
  const pulseAnim = useState(() => new Animated.Value(1))[0]
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  // Animated from the first-render progress so the ring never sweeps
  // in from 0 on mount; every later step eases linearly to the new
  // value over the 1s tick, which is what makes the arc continuous.
  const progressAnim = useState(() => new Animated.Value(clampedProgress))[0];
  const dashOffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  useEffect(() => {
    const anim = Animated.timing(progressAnim, {
      toValue: clampedProgress,
      duration: 1000,
      easing: Easing.linear,
      // SVG props cannot use the native driver.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [clampedProgress, progressAnim]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.015,
          duration: 2800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, transform: [{ scale: pulseAnim }] },
      ]}
    >
      <View
        style={[
          styles.glowRing,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: C.accentBg,
          },
        ]}
      />
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.accent} stopOpacity="1" />
            <Stop offset="1" stopColor={C.accentDeep} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringBg}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.5}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth + 0.5}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.content}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute' as const,
    opacity: 0.5,
  },
  svg: {
    position: 'absolute' as const,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
