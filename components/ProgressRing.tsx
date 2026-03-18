import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

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

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: hovered ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [hovered, glowAnim]);

  const hoverProps = Platform.OS === 'web'
    ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      }
    : {};

  const interpolatedOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0.8],
  });

  const interpolatedSize = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [size + 20, size + 32],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, transform: [{ scale: pulseAnim }] },
      ]}
      {...hoverProps}
    >
      <Animated.View
        style={[
          styles.glowRing,
          {
            width: interpolatedSize,
            height: interpolatedSize,
            borderRadius: interpolatedSize,
            backgroundColor: C.accentBg,
            opacity: interpolatedOpacity,
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
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth + 0.5}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clampedProgress)}
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
