import TodayTruthWidget from '@/widgets/TodayTruthWidget';
import { getActiveTrackId, getTrackDay } from './trackProgress';
import { getTrackDay as getDayContent } from '@/mocks/tracks';

/**
 * Pushes today's truth to the iOS home screen widget.
 * Call this when the app opens and when the day's content is viewed,
 * so the widget always shows the current day's identity statement.
 */
export async function refreshTruthWidget(): Promise<void> {
  try {
    const trackId = await getActiveTrackId();
    const day = await getTrackDay(trackId);
    const content = getDayContent(trackId, day);
    if (!content) return;

    // Widget shows the identity statement (the "truth") + verse reference.
    const truth = content.identity?.trim() || 'You are His beloved.';
    const reference = content.verse?.trim() || 'TRIAD Prayer';

    TodayTruthWidget.updateSnapshot({ truth, reference });
  } catch {
    // Widget updates are best-effort; never break the app over them.
  }
}
