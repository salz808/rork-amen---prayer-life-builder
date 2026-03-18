import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface RadialGlowProps {
  size: number;
  r?: number;
  g?: number;
  b?: number;
  maxOpacity?: number;
  style?: ViewStyle;
}

export default function RadialGlow({
  size,
  r = 200,
  g = 137,
  b = 74,
  maxOpacity = 0.15,
  style,
}: RadialGlowProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `rgba(${r},${g},${b},${maxOpacity})`,
          position: 'absolute',
        },
        styles.glow,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    alignSelf: 'center',
  },
});
