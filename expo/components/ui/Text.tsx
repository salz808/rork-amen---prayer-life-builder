import React from 'react';
import { Text, type AccessibilityRole, type StyleProp, type TextStyle } from 'react-native';
import { MAX_FONT_SIZE_MULTIPLIER, TYPOGRAPHY } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';

interface TextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  /** Dynamic Type (audit items 7 + 8, 2026-11-16): forwarded to the native Text. */
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number;
  /** Accessibility (audit item 7): forwarded to the native Text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessible?: boolean;
  testID?: string;
  numberOfLines?: number;
}

/**
 * Forwards the Dynamic Type + accessibility props every primitive accepts.
 * Callers override `maxFontSizeMultiplier` / `accessibilityRole` after the
 * spread where a primitive carries its own default (H1/H2 below).
 */
function a11yProps(p: TextProps) {
  return {
    allowFontScaling: p.allowFontScaling,
    maxFontSizeMultiplier: p.maxFontSizeMultiplier,
    accessibilityLabel: p.accessibilityLabel,
    accessibilityHint: p.accessibilityHint,
    accessibilityRole: p.accessibilityRole,
    accessible: p.accessible,
    testID: p.testID,
    numberOfLines: p.numberOfLines,
  };
}

/**
 * Shared text primitives (arena-audit fix pass, F2, 2026-11-15). Each
 * one carries its typography token (Larger-Text-aware via the hook),
 * so call sites stop re-declaring fontFamily / size / leading inline.
 * `Eyebrow` is the uppercase label token (tracking 2 after the B1 fix);
 * `H1` is the screen title; `H2` the card/section title; `Body` the
 * Montserrat body token. Pass `color` only to override the default.
 *
 * Dynamic Type (audit item 8): H1/H2 cap at the documented 1.25
 * (`MAX_FONT_SIZE_MULTIPLIER.title`) so Larger Text cannot blow a heading
 * out of its container; Body (and Eyebrow) carry no cap so the text reflows.
 * H1/H2 also carry `accessibilityRole="heading"` unless overridden.
 */

export function Eyebrow(props: TextProps) {
  const { children, style, color } = props;
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      {...a11yProps(props)}
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

export function H1(props: TextProps) {
  const { children, style, color } = props;
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      {...a11yProps(props)}
      maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER.title ?? 1.25}
      accessibilityRole={props.accessibilityRole ?? 'heading'}
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

export function H2(props: TextProps) {
  const { children, style, color } = props;
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      {...a11yProps(props)}
      // Section titles follow the documented title cap (1.25): the policy
      // map only names display/title, and sectionTitle is a title token.
      maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER.title ?? 1.25}
      accessibilityRole={props.accessibilityRole ?? 'heading'}
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

export function Body(props: TextProps) {
  const { children, style, color } = props;
  const T = useTypography();
  const C = useColors();
  return (
    <Text
      {...a11yProps(props)}
      // No maxFontSizeMultiplier cap here by design (audit item 8): body
      // text reflows at any Dynamic Type size. An explicit prop still wins.
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
