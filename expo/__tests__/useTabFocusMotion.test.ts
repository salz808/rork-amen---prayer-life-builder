import {
  TAB_FOCUS_MS,
  TAB_FOCUS_START_OPACITY,
  TAB_FOCUS_START_Y,
} from '@/hooks/useTabFocusMotion';

// Node jest cannot load the real react-native or expo-router modules,
// so the only surfaces this file touches are stubbed — the constants
// under test are plain values and never touch Animated at import time.
// (jest.mock is hoisted, so the mocks apply despite sitting below.)
jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(),
    timing: jest.fn(),
    parallel: jest.fn(),
  },
  Easing: {
    out: jest.fn((e: unknown) => e),
    quad: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useReduceMotion', () => ({
  useReduceMotion: () => false,
}));

// Tab cushion (M-8): a tab screen settles in from just under full
// opacity and +3pt — never from 0, which flashes. These tests pin the
// values so a future edit cannot silently reintroduce the flash.
describe('useTabFocusMotion', () => {
  it('starts at 0.84 opacity, never 0', () => {
    expect(TAB_FOCUS_START_OPACITY).toBe(0.84);
    expect(TAB_FOCUS_START_OPACITY).toBeGreaterThan(0);
    expect(TAB_FOCUS_START_OPACITY).toBeLessThan(1);
  });

  it('starts 3pt down and settles over 200ms', () => {
    expect(TAB_FOCUS_START_Y).toBe(3);
    expect(TAB_FOCUS_MS).toBe(200);
  });
});
