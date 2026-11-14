import { AppState } from 'react-native';
import { reportError } from './crashReporter';

// C-4: main-thread heartbeat. #60 (an app freeze) was undiagnosable by
// design — crashReporter only sees thrown errors, and a frozen main
// thread throws nothing. A 1s interval stamps Date.now(); when the next
// tick lands more than ~5s after the previous stamp, the JS thread was
// blocked for that long, and the route at the time is reported so the
// next freeze report names where it happened. Reports are throttled to
// one per minute so a sustained hang cannot burn the 10/session
// reportError budget. Background time is ignored: the OS throttles
// timers there, so a background gap is not a hang. No new dependency;
// no state, no animation, no UI.

const TICK_MS = 1000;
const HANG_THRESHOLD_MS = 5000;
const MIN_REPORT_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastStampMs = 0;
let lastReportMs = 0;
let getRoute: (() => string | null) | null = null;

function tick() {
  const now = Date.now();
  // Timers are throttled while backgrounded — a background gap is the OS,
  // not a hang. Reset the stamp and wait for a foreground tick.
  if (AppState.currentState !== 'active') {
    lastStampMs = now;
    return;
  }
  if (lastStampMs !== 0) {
    const gapMs = now - lastStampMs;
    if (gapMs > HANG_THRESHOLD_MS && now - lastReportMs >= MIN_REPORT_INTERVAL_MS) {
      lastReportMs = now;
      const route = getRoute?.() ?? 'unknown';
      reportError('MainThreadHang', new Error(`Main thread unresponsive for ${gapMs}ms`), {
        flow: route,
      });
    }
  }
  lastStampMs = now;
}

export function startMainThreadHeartbeat(routeFn: () => string | null): void {
  if (intervalId !== null) return;
  getRoute = routeFn;
  lastStampMs = Date.now();
  lastReportMs = 0;
  intervalId = setInterval(tick, TICK_MS);
}

export function stopMainThreadHeartbeat(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  getRoute = null;
  lastStampMs = 0;
}
