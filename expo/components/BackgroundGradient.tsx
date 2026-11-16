import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import type { StyleProp, ViewStyle } from 'react-native';
import DarkColors from '@/constants/darkColors';

interface BackgroundGradientProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Theme-aware override — pass `[C.bgGradient1, C.bgGradient2,
   * C.bgGradient3]` from a screen that already resolves colors through
   * `useColors()`, so seasonal / monastic themes keep their gradient.
   * Defaults to the live-theme triple (#090603 / #120A05 / #090603).
   * Static default (no hook) on purpose: the boot screen in
   * `app/_layout.tsx` renders outside `AppProvider`, where `useColors()`
   * cannot run, and it already used these exact `DarkColors` values.
   */
  colors?: readonly [string, string, ...string[]];
}

/**
 * Shared screen background (arena-audit fix pass, D1, 2026-11-15).
 * Replaces the per-screen copy-pasted `LinearGradient` backgrounds
 * (two variants: the #090603 triple and background/surface/background).
 * Screens keep their own `RadialGlow` / ambient-veil layers on top —
 * those positions are deliberate and untouched.
 */
export default function BackgroundGradient({ children, style, colors }: BackgroundGradientProps) {
  return (
    <LinearGradient
      colors={colors ?? [DarkColors.bgGradient1, DarkColors.bgGradient2, DarkColors.bgGradient3]}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
