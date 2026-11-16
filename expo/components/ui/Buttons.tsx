import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import GlowButton from '@/components/GlowButton';

interface ButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  icon?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Shared CTAs (arena-audit fix pass, F2, 2026-11-15). Thin wrappers
 * over `GlowButton` — the primary/ghost treatment lives there and is
 * NOT rebuilt here. Use `PrimaryButton` for the one main action on a
 * screen, `SecondaryButton` for the quiet alternative.
 */
export function PrimaryButton({ label, onPress, style, disabled, icon, testID, accessibilityLabel }: ButtonProps) {
  return (
    <GlowButton
      label={label}
      onPress={onPress}
      variant="primary"
      style={style}
      disabled={disabled}
      icon={icon}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function SecondaryButton({ label, onPress, style, disabled, icon, testID, accessibilityLabel }: ButtonProps) {
  return (
    <GlowButton
      label={label}
      onPress={onPress}
      variant="ghost"
      style={style}
      disabled={disabled}
      icon={icon}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
