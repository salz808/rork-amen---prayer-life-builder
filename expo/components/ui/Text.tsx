import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { TYPOGRAPHY } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';

interface TextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
}

/**
 * Shared text primitives (arena-audit fix pass, F2, 2026-11-15). Each
 * one carries its typography token (Larger-Text-aware via the hook),
 * so call sites stop re-declaring fontFamily / size / leading inline.
 * `Eyebrow` is the uppercase label token (tracking 2 after the B1 fix);
 * `H1` is the screen title; `H2` the card/section title; `Body` the
 * Montserrat body token. Pass `color` only to override the default.
 */

export function Eyebrow({ children, style, color }: TextProps) {
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: TYPOGRAPHY.label.family,
          fontSize: T.size.label,
          lineHeight: T.leading.label,
          letterSpacing: TYPOGRAPHY.label.letterSpacing,
          textTransform: 'uppercase',
          color: color ?? C.accent,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H1({ children, style, color }: TextProps) {
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: TYPOGRAPHY.title.family,
          fontSize: T.size.title,
          lineHeight: T.leading.title,
          letterSpacing: TYPOGRAPHY.title.letterSpacing,
          color: color ?? C.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H2({ children, style, color }: TextProps) {
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: TYPOGRAPHY.sectionTitle.family,
          fontSize: T.size.sectionTitle,
          lineHeight: T.leading.sectionTitle,
          letterSpacing: TYPOGRAPHY.sectionTitle.letterSpacing,
          color: color ?? C.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, style, color }: TextProps) {
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: TYPOGRAPHY.body.family,
          fontSize: T.size.body,
          lineHeight: T.leading.body,
          letterSpacing: TYPOGRAPHY.body.letterSpacing,
          color: color ?? C.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
