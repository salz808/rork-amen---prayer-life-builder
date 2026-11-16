import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import BackgroundGradient from '@/components/BackgroundGradient';
import { screenPadding } from '@/constants/theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra style on the padded content wrapper (e.g. gap). */
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

/**
 * Shared screen shell (arena-audit fix pass, F2, 2026-11-15): safe area
 * + shared `BackgroundGradient` + 32px horizontal padding. Screens keep
 * their own `RadialGlow` / ambient-veil layers — pass them as children
 * before the scroll content, or wrap content in your own layers.
 * Not yet migrated onto existing screens this pass; new screens start here.
 */
export default function Screen({ children, style, contentStyle, edges }: ScreenProps) {
  return (
    <View style={[styles.root, style]}>
      <BackgroundGradient style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={edges ?? ['top', 'bottom']}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: screenPadding,
  },
});
