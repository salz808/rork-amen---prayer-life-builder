import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius } from '@/constants/theme';

interface ProgressBarProps {
  /** 0–1. Clamped. */
  progress: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared progress bar (arena-audit fix pass, F2, 2026-11-15): 2px
 * track, amber fill. For the circular session progress use
 * `ProgressRing` instead.
 */
export default function ProgressBar({ progress, style }: ProgressBarProps) {
  const C = useColors();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, { backgroundColor: C.border }, style]}>
      <View style={[styles.fill, { backgroundColor: C.accent, width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: 2,
    borderRadius: radius.full,
  },
});
