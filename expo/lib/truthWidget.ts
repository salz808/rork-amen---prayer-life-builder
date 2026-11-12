import { requireOptionalNativeModule } from 'expo-modules-core';
import { getActiveTrackId, getTrackDay } from './trackProgress';
import { getTrackDay as getDayContent } from '@/mocks/tracks';

/**
 * Pushes today's truth to the iOS home screen widget.
 * Call this when the app opens and when the day's content is viewed,
 * so the widget always shows the current day's identity statement.
 *
 * Safe to call in Expo Go: the widget module is loaded dynamically and
 * all failures are swallowed — the widget simply won't update.
 */
export async function refreshTruthWidget(): Promise<void> {
  try {
    const trackId = await getActiveTrackId();
    const day = await getTrackDay(trackId);
    const content = getDayContent(trackId, day);
    if (!content) return;

    const truth = content.identity?.trim() || 'You are His beloved.';
    // PL-H4 (round-3 B-H2): the widget is a disclosure surface too.
    // Split exactly as app/session.tsx does; shapeless lines stay
    // unmarked, as in-session. No verse reworded, no citation changed.
    const rawVerse = content.verse?.trim() || '';
    const verseIdx = rawVerse.indexOf(' — ');
    const reference = !rawVerse
      ? 'TRIAD Prayer'
      : verseIdx > 0
        ? `${rawVerse.slice(0, verseIdx)} (excerpt) — ${rawVerse.slice(verseIdx + 3)}`
        : rawVerse;

    // Dynamic import: expo-widgets has no native module in Expo Go.
    // NOTE (2026-11-10, launch crash): the dynamic import alone does
    // NOT contain the failure. Evaluating the widget module throws
    // inside requireNativeModule, and on native that throw is reported
    // as an uncaught fatal error before the import's .catch can run —
    // that is the red screen Justin hit on launch. So check for the
    // native module first and never import the widget file when it is
    // absent. In a production build the module is present and the
    // widget updates exactly as before.
    if (!requireOptionalNativeModule('ExpoWidgets')) return;
    const mod = await import('@/widgets/TodayTruthWidget').catch(() => null);
    const widget = (mod as any)?.default;
    if (widget && typeof widget.updateSnapshot === 'function') {
      widget.updateSnapshot({ truth, reference });
    }
  } catch {
    // Widget updates are best-effort; never break the app over them.
  }
}
