// Wave 2, fix 1 (feedback #19): the Home scroll-to-top event bus.
// The tab bar emits, the Home screen scrolls — neither side imports
// @react-navigation (forbidden under Expo SDK 56+), so the bus itself
// is the contract under test. Wiring (tabPress listener, Home ref) is
// verified by static trace, not by a component render here.
import { onHomeScrollToTop, requestHomeScrollToTop } from '../lib/homeScroll';

describe('homeScroll bus', () => {
  it('delivers a scroll request to a subscriber', () => {
    const listener = jest.fn();
    const unsubscribe = onHomeScrollToTop(listener);
    requestHomeScrollToTop();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = onHomeScrollToTop(listener);
    unsubscribe();
    requestHomeScrollToTop();
    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op with no subscribers', () => {
    expect(() => requestHomeScrollToTop()).not.toThrow();
  });

  it('a throwing listener does not silence the others', () => {
    const good = jest.fn();
    onHomeScrollToTop(() => {
      throw new Error('boom');
    });
    const unsubscribe = onHomeScrollToTop(good);
    expect(() => requestHomeScrollToTop()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
