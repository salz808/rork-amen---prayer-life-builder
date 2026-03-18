import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const COLORS = ['#C8894A', '#E0A868', '#F4EDE0', '#8EB084', '#D6A060'];
const COUNT = 24;

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
}

function makeParticles(): Particle[] {
  return Array.from({ length: COUNT }, () => ({
    x: new Animated.Value(width / 2),
    y: new Animated.Value(height * 0.4),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(0),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
}

interface Props {
  active: boolean;
}

export default function CelebrationParticles({ active }: Props) {
  const particles = useRef<Particle[]>(makeParticles()).current;

  useEffect(() => {
    if (!active) return;

    const animations = particles.map((p) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 120 + Math.random() * 200;
      const tx = width / 2 + Math.cos(angle) * distance;
      const ty = height * 0.4 + Math.sin(angle) * distance - 80;

      p.x.setValue(width / 2);
      p.y.setValue(height * 0.4);
      p.opacity.setValue(0);
      p.scale.setValue(0);

      return Animated.sequence([
        Animated.delay(Math.random() * 300),
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(p.scale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: tx, duration: 800, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: ty, duration: 800, useNativeDriver: true }),
        ]),
        Animated.timing(p.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]);
    });

    Animated.parallel(animations).start();
  }, [active, particles]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { scale: p.scale },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    left: -4,
    top: -4,
  },
});
