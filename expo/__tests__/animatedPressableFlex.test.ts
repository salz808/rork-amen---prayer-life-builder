import { outerWrapperFlexStyle } from '../lib/animatedPressableFlex';

// Claude audit fix #1 (2026-11-17): the flex-axis props of an
// AnimatedPressable style must reach its outer Animated.View wrapper.
// The helper is pure (type-only RN import), so it runs in node env —
// the component itself cannot be render-tested here (Reanimated mock
// renders nothing; the real RN tree dies without the RN jest preset).
describe('outerWrapperFlexStyle', () => {
  it('forwards flex from a banner style (cloudPromptAction / bannerAction)', () => {
    expect(outerWrapperFlexStyle({ flex: 1 })).toEqual({ flex: 1 });
  });

  it('forwards flexGrow / flexShrink / alignSelf', () => {
    expect(
      outerWrapperFlexStyle({ flexGrow: 2, flexShrink: 0, alignSelf: 'center' })
    ).toEqual({ flexGrow: 2, flexShrink: 0, alignSelf: 'center' });
  });

  it('returns an empty object when no flex-axis props are present', () => {
    expect(outerWrapperFlexStyle({ width: 44, height: 44 })).toEqual({});
    expect(outerWrapperFlexStyle({})).toEqual({});
  });

  it('does not leak unrelated props (background, padding, borderRadius)', () => {
    expect(
      outerWrapperFlexStyle({
        flex: 1,
        backgroundColor: 'red',
        paddingHorizontal: 16,
        borderRadius: 12,
      })
    ).toEqual({ flex: 1 });
  });

  it('ignores non-numeric flex values', () => {
    // @ts-expect-error deliberate misuse: flex must be a number.
    expect(outerWrapperFlexStyle({ flex: 'auto' })).toEqual({});
  });
});
