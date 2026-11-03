/**
 * Wave 2, fix 1 (feedback #19): Home scroll-to-top event bus.
 *
 * As of Expo SDK 56+, expo-router rejects direct `@react-navigation/*`
 * imports, so the tab bar cannot use `useScrollToTop` and the Home
 * screen cannot hand its ScrollView ref to the navigator. Instead the
 * tab layout emits a plain event on a Home re-tap and the Home screen
 * scrolls its own ScrollView. No navigation imports, no new
 * dependencies — just a listener set. A throwing listener must never
 * break the others (hence the try/catch per listener).
 */

type HomeScrollListener = () => void;

const listeners = new Set<HomeScrollListener>();

/** Subscribe to Home scroll-to-top requests. Returns an unsubscribe. */
export function onHomeScrollToTop(listener: HomeScrollListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the Home screen to scroll to the top. No-op when nobody listens. */
export function requestHomeScrollToTop(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One broken subscriber must not silence the rest.
    }
  });
}
