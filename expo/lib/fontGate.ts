import { useSyncExternalStore } from 'react';

// Launch-splash font gate (2026-11-17, v2): a module-level boolean that
// is true ONLY once the custom fonts actually loaded. The v1 gate trusted
// appReady, which also flips true on the 3500ms font-load timeout and on
// load error — so the splash's text beats could render in the fallback
// sans. This gate opens only on a successful loadCustomFonts() resolve
// (or the 10s backstop in _layout), never on timeout/error. Starts
// closed; once open it stays open for the session.
let fontGateOpen = false;

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setFontGateOpen(open: boolean): void {
  if (fontGateOpen === open) return;
  fontGateOpen = open;
  listeners.forEach((listener) => listener());
}

export function getFontGateOpen(): boolean {
  return fontGateOpen;
}

export function useFontGateOpen(): boolean {
  return useSyncExternalStore(subscribe, getFontGateOpen);
}
