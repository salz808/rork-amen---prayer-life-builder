import React, { useRef, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Animated,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
  glowColor,
}: GlowButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.98,
      tension: 220,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      tension: 220,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  const hoverProps = Platform.OS === 'web'
    ? {
        onMouseEnter: () => {
          if (!disabled) {
            setHovered(true);
            Animated.spring(scale, {
              toValue: 1.02,
              tension: 220,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
        onMouseLeave: () => {
          if (!disabled) {
            setHovered(false);
            Animated.spring(scale, {
              toValue: 1,
              tension: 220,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
      }
    : {};

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]} {...hoverProps}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          styles.container,
          variant === 'ghost' && styles.ghostContainer,
          variant === 'amber' && styles.amberContainer,
          pressed && styles.pressed,
          disabled && styles.disabled,
          hovered && styles.hovered,
        ]}
      >


        {variant === 'amber' || variant === 'primary' ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
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
            <Text style={[styles.text, styles.ghostText, textStyle]}>
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
    borderRadius: 100,
    overflow: 'hidden',
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
  },
  ghostContainer: {
    backgroundColor: 'rgba(244, 237, 224, 0.08)', // Refined subtle glassmorphism
    borderWidth: 1,
    borderColor: 'rgba(244, 237, 224, 0.12)', // Subtle premium border
  },
  amberContainer: {
    backgroundColor: '#D49A5A',
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.8, // Reduced opacity for pressed state
    transform: [{ scale: 0.98 }], // Subtle scale down for pressed state
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 12.5,
    letterSpacing: 2,
    textAlign: 'center',
    color: '#180C02', // Dark on light/amber
  },
  ghostText: {
    color: '#F4EDE0',
  },
  amberText: {
    color: '#180C02',
  },
  disabled: {
    opacity: 0.5,
  },
  hovered: {
    shadowColor: '#C89A5A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
});
