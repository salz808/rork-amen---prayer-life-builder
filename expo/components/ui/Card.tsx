import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared card (arena-audit fix pass, F2, 2026-11-15): 20px padding,
 * `lg` radius (16). No `bgCard` token exists in `darkColors.ts`, so the
 * background is the live card surface (`C.surface`, #1A1006) — the same
 * surface the existing card styles use.
 */
export default function Card({ children, style }: CardProps) {
  const C = useColors();
  return <View style={[styles.card, { backgroundColor: C.surface }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    // 20 is not a step on the 8pt space scale; the F2 spec fixes card
    // padding at 20, so it stays a literal here.
    padding: 20,
    borderRadius: radius.lg,
  },
});
