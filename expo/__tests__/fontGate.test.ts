import { getFontGateOpen, setFontGateOpen } from '../lib/fontGate';

// Launch-splash font gate (2026-11-17, v2): pins the module-level store.
// The hook (useFontGateOpen) is a thin useSyncExternalStore wrapper over
// these same functions; the _layout wiring is verified by code reading +
// bundle markers, not by unit tests. Tests run in declaration order and
// share the module state, so the "starts closed" case runs first.
describe('font gate store', () => {
  it('starts closed', () => {
    expect(getFontGateOpen()).toBe(false);
  });

  it('opens on setFontGateOpen(true)', () => {
    setFontGateOpen(true);
    expect(getFontGateOpen()).toBe(true);
  });

  it('stays open on a repeated open (idempotent)', () => {
    setFontGateOpen(true);
    setFontGateOpen(true);
    expect(getFontGateOpen()).toBe(true);
  });

  it('getFontGateOpen reflects the value', () => {
    setFontGateOpen(true);
    expect(getFontGateOpen()).toBe(true);
  });
});
