/**
 * Prayer-notification copy + milestones for the in-app "someone prayed
 * for you" bell. Pure functions, covered by jest.
 *
 * The pray-er is never named anywhere in this feature: the server row
 * carries no pray-er identity, and the copy below never invents one.
 * Milestones (1, 5, 10, 25, 50, 100) mirror the CHECK constraint in
 * migration 20261025000002_prayer_notifications.sql — keep them in sync.
 */

export const PRAYER_NOTIFICATION_MILESTONES = [1, 5, 10, 25, 50, 100] as const;

export interface PrayerNotification {
  id: string;
  echoId: string;
  echoText: string;
  milestone: number;
  createdAt: string;
  seenAt: string | null;
}

/** Headline for a milestone row. 1 is singular ("someone"); the rest count people. */
export function formatPrayerNotificationHeadline(milestone: number): string {
  if (milestone <= 1) return 'Someone just prayed for you';
  return `${milestone} people have prayed for this`;
}

/** Relative time, reusing the app's existing time-ago wording. */
export function formatPrayerNotificationTimeAgo(createdAt: string, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, nowMs - new Date(createdAt).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString();
}
