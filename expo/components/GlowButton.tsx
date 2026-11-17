import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Animated,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { Fonts } from '@/constants/fonts';

interface GlowButtonProps {
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  gradient?: readonly [string, string, ...string[]];
  disabled?: boolean;
  // 4-angle audit 2026-11-14, F-14: `primary` and `amber` rendered
  // identically (the amber background sat behind the same gradient),
  // so they collapse to one variant name. `primary` survives; every
  // `variant="amber"` call site was renamed to `primary`.
  variant?: 'primary' | 'ghost';
  icon?: React.ReactNode;
  glowColor?: { r: number, g: number, b: number };
  // 4-angle audit 2026-11-14, F-14: the in-flow Ask SAVE confirm in
  // session.tsx lives in a flex-end row next to CANCEL, where a
  // full-size CTA does not fit. `compact` renders the same primary
  // treatment as a radius-100 pill (minHeight 44, tighter padding)
  // for that one inline confirm. The gradient/outline children are
  // absolutely positioned, so the button has no intrinsic width in a
  // row — compact callers must give it a minWidth (see session.tsx).
  compact?: boolean;
  // 4-angle audit 2026-11-14 (follow-up): the auto-generated label is
  // the visible label text. Callers whose button needs a richer spoken
  // label (price / period / trial on the purchase CTAs) pass it here;
  // it wins over the generated label. When absent, behaviour is
  // unchanged.
  accessibilityLabel?: string;
  // Lets a caller keep a stable testID (e.g. the Ask SAVE
  // "ask-save-prayer") instead of the generated glow-button-* id.
  testID?: string;
}

export default function GlowButton({
  onPress,
  label,
  style,
  textStyle,
  gradient,
  disabled = false,
  variant = 'primary',
  icon,
  compact = false,
  accessibilityLabel,
  testID,
}: GlowButtonProps) {
  const scale = useState(() => new Animated.Value(1))[0]
  const C = useColors();
  // Haptics (d) (2026-11-16): this button deliberately fires NO haptic
  // of its own — its call sites already fire Haptics.impactAsync in
  // their onPress (e.g. auth sign-in buttons), so adding one here
  // would double-buzz every tap. Haptics stay in AnimatedPressable
  // (the shared pressable) and in the call sites that need them.
  // Reduce Motion gates the scale spring below; the pressed-opacity
  // fade stays as the press feedback.
  const reduceMotion = useReduceMotion();
  // Arena-audit fix pass (D2, 2026-11-15): the default gradient used to
  // be a hardcoded near-duplicate of the accent tokens. It now resolves
  // through C.accent / C.accentDeep so the one amber stays one amber. Callers passing `gradient`
  // explicitly (e.g. the Apple button's cream gradient) are untouched.
  // The default cannot live in the parameter list — C is defined here.
  // GPT-6 item 2 (2026-11-16): every theme's accentDeep is light
  // enough that the dark #180C02 label (styles.text) clears WCAG AA
  // 4.5:1 on BOTH stops — default 6.53:1 / 4.84:1. Pinned by
  // __tests__/buttonContrast.test.ts; if a token changes, the test
  // fails before the button ships unreadable. The ghost variant's
  // accentDark label sits on the dark surface, never on amber
  // (accentDark on accent is 1.40:1 — never use it as text there).
  const resolvedGradient: readonly [string, string, ...string[]] = gradient ?? [C.accent, C.accentDeep];
  // Wave 3: the shared CTA uses the button token (15/20, Larger-aware).
  // No caller passes a fontSize via textStyle (verified by grep over all
  // call sites), so no caller overrides this; callers passing only
  // fontFamily/color still win where they set those, since textStyle is
  // applied after.
  const T = useTypography();

  const handlePressIn = () => {
    if (disabled || reduceMotion) return;
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (disabled || reduceMotion) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        testID={testID ?? `glow-button-${label.toLowerCase().replace(/\s+/g, '-')}`}
        style={({ pressed }) => [
          styles.container,
          compact && styles.compactContainer,
          variant === 'ghost' && [
            styles.ghostContainer,
            { backgroundColor: C.accentBg, borderColor: C.border },
          ],
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {variant !== 'ghost' ? <View pointerEvents="none" style={[styles.outline, compact && styles.compactOutline]} /> : null}
        {variant === 'primary' ? (
          <LinearGradient
            colors={resolvedGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.85 }}
            style={styles.gradientFill}
          >
            <View style={[styles.content, compact && styles.compactContent]}>
              {icon && <View style={styles.icon}>{icon}</View>}
              <Text style={[styles.text, { fontSize: T.size.button, lineHeight: T.leading.button }, textStyle]}>
                {label}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.content, compact && styles.compactContent]}>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text style={[styles.text, { fontSize: T.size.button, lineHeight: T.leading.button }, { color: C.accentDark }, textStyle]}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  compactContainer: {
    borderRadius: 100,
    minHeight: 44,
  },
  ghostContainer: {
    borderWidth: 1,
    borderRadius: 18,
  },
  outline: {
    ...absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    opacity: 0.9,
  },
  compactOutline: {
    borderRadius: 100,
  },
  gradientFill: {
    ...absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  compactContent: {
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  icon: {
    marginRight: 10,
  },
  // NOTE (Wave 3): text size/leading are set inline from the button
  // token in both render branches above, so they respond to Larger Text;
  // they are deliberately absent from this static stylesheet. The
  // fontFamily IS set here (finding 29): GlowButton used to set no
  // fontFamily at all, so callers that didn't pass one got the iOS
  // system font instead of Montserrat (CAPTURE DAILY REFLECTION
  // rendered in a different typeface from the adjacent SHARE TRUTH,
  // which passes titleMedium). The default is titleMedium — the same
  // face SHARE TRUTH passes — and any caller's textStyle still wins,
  // since it is applied after this style in both branches.
  text: {
    fontFamily: Fonts.titleMedium,
    letterSpacing: 1.5,
    textAlign: 'center',
    color: '#180C02',
  },
  disabled: {
    opacity: 0.5,
  },
});
