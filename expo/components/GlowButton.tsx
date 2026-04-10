import React, { useRef } from 'react';
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

interface GlowButtonProps {
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  gradient?: readonly [string, string, ...string[]];
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'amber';
  icon?: React.ReactNode;
  glowColor?: { r: number, g: number, b: number };
}

export default function GlowButton({
  onPress,
  label,
  style,
  textStyle,
  gradient = ['#D49A5A', '#A06228'],
  disabled = false,
  variant = 'primary',
  icon,
}: GlowButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const C = useColors();

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        testID={`glow-button-${label.toLowerCase().replace(/\s+/g, '-')}`}
        style={({ pressed }) => [
          styles.container,
          variant === 'ghost' && [
            styles.ghostContainer,
            { backgroundColor: C.accentBg, borderColor: C.border },
          ],
          variant === 'amber' && styles.amberContainer,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {variant !== 'ghost' ? <View pointerEvents="none" style={styles.outline} /> : null}
        {variant === 'amber' || variant === 'primary' ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.85 }}
            style={styles.gradientFill}
          >
            <View style={styles.content}>
              {icon && <View style={styles.icon}>{icon}</View>}
              <Text style={[styles.text, variant === 'amber' && styles.amberText, textStyle]}>
                {label}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={styles.content}>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text style={[styles.text, { color: C.accentDark }, textStyle]}>
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
  ghostContainer: {
    borderWidth: 1,
    borderRadius: 18,
  },
  amberContainer: {
    backgroundColor: '#D49A5A',
  },
  outline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    opacity: 0.9,
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
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
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 14.4,
    letterSpacing: 1.2,
    textAlign: 'center',
    color: '#180C02',
  },
  amberText: {
    color: '#180C02',
  },
  disabled: {
    opacity: 0.5,
  },
});
