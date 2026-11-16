import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { H2, Body } from './Text';
import { PrimaryButton } from './Buttons';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared empty state (arena-audit fix pass, F2, 2026-11-15): centered
 * icon + title + body + optional CTA. Body copy is the Montserrat body
 * token — never italic serif (B2/B3).
 */
export default function EmptyState({ icon, title, body, ctaLabel, onCtaPress, style }: EmptyStateProps) {
  const C = useColors();
  return (
    <View style={[styles.root, style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <H2 style={styles.title}>{title}</H2>
      {body ? (
        <Body color={C.textSecondary} style={styles.body}>
          {body}
        </Body>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <PrimaryButton label={ctaLabel} onPress={onCtaPress} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  icon: {
    marginBottom: 4,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  cta: {
    marginTop: 8,
    minWidth: 200,
  },
});
