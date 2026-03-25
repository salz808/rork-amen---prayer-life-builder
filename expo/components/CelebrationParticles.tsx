import React, { useEffect, useMemo } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 24;

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotation: Animated.Value;
  color: string;
  size: number;
  shape: 'circle' | 'square' | 'diamond';
}

const COLORS = [
  '#C4956A', '#D4A070', '#7DA37A', '#A07548',
  '#E8C870', '#D49A6A', '#C28B8B', '#8A5E35',
  '#5A835A', '#B87D4A', '#DBBFA3', '#C8DCC6',
];

interface CelebrationParticlesProps {
  active: boolean;
}

function CelebrationParticlesComponent({ active }: CelebrationParticlesProps) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(SCREEN_WIDTH / 2),
      y: new Animated.Value(SCREEN_HEIGHT / 2),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      rotation: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 4 + Math.random() * 8,
      shape: (['circle', 'square', 'diamond'] as const)[Math.floor(Math.random() * 3)],
    }));
  }, []);

  useEffect(() => {
    if (!active) return;

    const animations = particles.map((p, i) => {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.8;
      const distance = 80 + Math.random() * 160;
      const targetX = SCREEN_WIDTH / 2 + Math.cos(angle) * distance;
      const targetY = SCREEN_HEIGHT / 2 - 60 + Math.sin(angle) * distance * 0.7;
      const delay = Math.random() * 300;

      p.x.setValue(SCREEN_WIDTH / 2);
      p.y.setValue(SCREEN_HEIGHT / 2 - 40);
      p.opacity.setValue(0);
      p.scale.setValue(0);
      p.rotation.setValue(0);

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(p.x, {
            toValue: targetX,
            duration: 800 + Math.random() * 400,
            useNativeDriver: true,
          }),
          Animated.timing(p.y, {
            toValue: targetY + 100 + Math.random() * 80,
            duration: 1200 + Math.random() * 400,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(p.opacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.delay(600),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.spring(p.scale, {
            toValue: 1,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(p.rotation, {
            toValue: (Math.random() - 0.5) * 6,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });

    Animated.parallel(animations).start();
  }, [active, particles]);

  if (!active) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p, i) => {
        const rotateZ = p.rotation.interpolate({
          inputRange: [-3, 3],
          outputRange: ['-180deg', '180deg'],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                borderRadius: p.shape === 'circle' ? p.size / 2 : p.shape === 'diamond' ? 2 : 1,
                opacity: p.opacity,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { scale: p.scale },
                  { rotate: rotateZ },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default React.memo(CelebrationParticlesComponent);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  particle: {
    position: 'absolute' as const,
  },
});
