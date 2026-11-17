import type { ViewStyle } from 'react-native';

// Claude audit fix #1 (2026-11-17): AnimatedPressable puts `style` on
// its INNER Pressable while its outer Animated.View received only
// width/height (fixedSize). In a row parent the wrapper shrink-wrapped
// and any flex:1 text inside collapsed to 0pt wide — the Home cloud
// banner rendered as an ~80pt icon-only pill, and the reminder /
// annual / reminderSetup banners shared the latent bug via
// bannerAction flex:1. The flex-axis props of the flattened style
// therefore belong on the outer wrapper too, next to fixedSize.
//
// Pure function (no RN runtime imports — `ViewStyle` is type-only,
// erased by babel) so it is unit-testable in this repo's node-env
// Jest setup, where the Reanimated mock renders nothing and the
// component itself cannot be render-tested. See
// __tests__/animatedPressableFlex.test.ts.
export function outerWrapperFlexStyle(flattenedStyle: ViewStyle): {
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: ViewStyle['alignSelf'];
} {
  // Plain mutable accumulator: ViewStyle's props are readonly in this
  // RN type version (TS2540 on direct assignment) — same pattern as
  // fixedSize in components/AnimatedPressable.tsx.
  const wrapperFlex: {
    flex?: number;
    flexGrow?: number;
    flexShrink?: number;
    alignSelf?: ViewStyle['alignSelf'];
  } = {};
  if (typeof flattenedStyle.flex === 'number') wrapperFlex.flex = flattenedStyle.flex;
  if (typeof flattenedStyle.flexGrow === 'number') wrapperFlex.flexGrow = flattenedStyle.flexGrow;
  if (typeof flattenedStyle.flexShrink === 'number') wrapperFlex.flexShrink = flattenedStyle.flexShrink;
  if (flattenedStyle.alignSelf !== undefined) wrapperFlex.alignSelf = flattenedStyle.alignSelf;
  return wrapperFlex;
}
