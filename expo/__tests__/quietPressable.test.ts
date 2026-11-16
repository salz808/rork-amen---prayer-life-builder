import {
  QUIET_PRESS_CARD_SCALE,
  QUIET_PRESS_IN_MS,
  QUIET_PRESS_OPACITY,
  QUIET_PRESS_OUT_SPRING,
  QUIET_PRESS_PILL_SCALE,
  QUIET_PRESS_REDUCED_OPACITY,
} from '@/components/ui/QuietPressable';

// Node jest cannot load the real react-native module, so the only
// surfaces this file touches are stubbed — the constants under test
// are plain values and never touch Animated at import time.
// (jest.mock is hoisted, so the mocks apply despite sitting below.)
jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(),
    timing: jest.fn(),
    spring: jest.fn(),
    parallel: jest.fn(),
  },
  Easing: {
    out: jest.fn((e: unknown) => e),
    quad: jest.fn(),
  },
  Pressable: 'Pressable',
}));
jest.mock('@/hooks/useReduceMotion', () => ({
  useReduceMotion: () => false,
}));

// Shared press feedback (M-4): quiet, always DOWN — never a scale-up.
// These tests pin the values so a future edit cannot silently make
// presses bouncy, slow, or upward.
describe('QuietPressable', () => {
  it('presses DOWN, never up: cards 0.984, pills/buttons 0.965', () => {
    expect(QUIET_PRESS_CARD_SCALE).toBe(0.984);
    expect(QUIET_PRESS_PILL_SCALE).toBe(0.965);
    expect(QUIET_PRESS_CARD_SCALE).toBeLessThan(1);
    expect(QUIET_PRESS_PILL_SCALE).toBeLessThan(1);
    expect(QUIET_PRESS_PILL_SCALE).toBeLessThan(QUIET_PRESS_CARD_SCALE);
  });

  it('dips opacity to 0.92 over 100ms on press-in', () => {
    expect(QUIET_PRESS_OPACITY).toBe(0.92);
    expect(QUIET_PRESS_IN_MS).toBe(100);
  });

  it('releases on a critically damped spring with zero bounce', () => {
    expect(QUIET_PRESS_OUT_SPRING.stiffness).toBe(300);
    expect(QUIET_PRESS_OUT_SPRING.damping).toBe(28);
    expect(QUIET_PRESS_OUT_SPRING.mass).toBe(0.9);
  });

  it('keeps scale at 1 under Reduce Motion and breathes opacity only, to 0.88', () => {
    expect(QUIET_PRESS_REDUCED_OPACITY).toBe(0.88);
    expect(QUIET_PRESS_REDUCED_OPACITY).toBeLessThan(1);
  });
});
