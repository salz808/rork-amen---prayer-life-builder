import {
  PRAYER_NOTIFICATION_MILESTONES,
  formatPrayerNotificationHeadline,
  formatPrayerNotificationTimeAgo,
} from '@/lib/prayerNotifications';

describe('prayer notification milestones', () => {
  it('matches the SQL CHECK constraint milestones', () => {
    expect(PRAYER_NOTIFICATION_MILESTONES).toEqual([1, 5, 10, 25, 50, 100]);
  });
});

describe('formatPrayerNotificationHeadline', () => {
  it('names no one at the first milestone', () => {
    expect(formatPrayerNotificationHeadline(1)).toBe('Someone just prayed for you');
    expect(formatPrayerNotificationHeadline(1)).not.toMatch(/you,|by /);
  });

  it('counts people at later milestones', () => {
    expect(formatPrayerNotificationHeadline(5)).toBe('5 people have prayed for this');
    expect(formatPrayerNotificationHeadline(100)).toBe('100 people have prayed for this');
  });
});

describe('formatPrayerNotificationTimeAgo', () => {
  const now = new Date('2026-10-24T20:00:00.000Z').getTime();

  it('buckets minutes, hours, and days', () => {
    expect(formatPrayerNotificationTimeAgo('2026-10-24T19:59:30.000Z', now)).toBe('Just now');
    expect(formatPrayerNotificationTimeAgo('2026-10-24T19:30:00.000Z', now)).toBe('30m ago');
    expect(formatPrayerNotificationTimeAgo('2026-10-24T15:00:00.000Z', now)).toBe('5h ago');
    expect(formatPrayerNotificationTimeAgo('2026-10-22T20:00:00.000Z', now)).toBe('2d ago');
  });

  it('never goes negative for future timestamps', () => {
    expect(formatPrayerNotificationTimeAgo('2026-10-24T21:00:00.000Z', now)).toBe('Just now');
  });
});
