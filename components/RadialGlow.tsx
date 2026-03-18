import React, { useId } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

interface RadialGlowProps {
  size: number;
  r?: number;
  g?: number;
  b?: number;
  maxOpacity?: number;
  style?: StyleProp<ViewStyle>;
}

export default function RadialGlow({
  size,
  r = 200,
  g = 137,
  b = 74,
  maxOpacity = 0.18,
  style,
}: RadialGlowProps) {
  const idSeed = useId().replace(/[:]/g, '');
  const primaryGradientId = `radial_glow_primary_${idSeed}`;
  const secondaryGradientId = `radial_glow_secondary_${idSeed}`;
  const tertiaryGradientId = `radial_glow_tertiary_${idSeed}`;
  const color = `rgb(${r}, ${g}, ${b})`;

  return (
    <View style={[styles.container, { width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={primaryGradientId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={Math.min(maxOpacity * 1.2, 1)} />
            <Stop offset="32%" stopColor={color} stopOpacity={maxOpacity * 0.72} />
            <Stop offset="68%" stopColor={color} stopOpacity={maxOpacity * 0.18} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={secondaryGradientId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={maxOpacity * 0.72} />
            <Stop offset="48%" stopColor={color} stopOpacity={maxOpacity * 0.22} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={tertiaryGradientId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={maxOpacity * 0.28} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Ellipse cx={size * 0.5} cy={size * 0.5} rx={size * 0.5} ry={size * 0.5} fill={`url(#${primaryGradientId})`} />
        <Ellipse cx={size * 0.4} cy={size * 0.36} rx={size * 0.34} ry={size * 0.3} fill={`url(#${secondaryGradientId})`} />
        <Ellipse cx={size * 0.64} cy={size * 0.62} rx={size * 0.28} ry={size * 0.24} fill={`url(#${tertiaryGradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
