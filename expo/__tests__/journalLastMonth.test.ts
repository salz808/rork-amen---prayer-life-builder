import { reflectionsFromLastMonth } from '../lib/journal';

const NOW = new Date('2026-11-16T12:00:00Z');

function reflection(date: string) {
  return { week: 1, q1: 'a', q2: 'b', q3: 'c', date };
}

describe('reflectionsFromLastMonth (arena (c))', () => {
  it('keeps reflections from the last 30 days', () => {
    const rows = [
      reflection('2026-11-16T11:00:00Z'),
      reflection('2026-10-20T12:00:00Z'),
      reflection('2026-10-16T12:00:00Z'),
    ];
    expect(reflectionsFromLastMonth(rows, NOW).map((r) => r.date)).toEqual([
      '2026-11-16T11:00:00Z',
      '2026-10-20T12:00:00Z',
    ]);
  });

  it('drops unparseable dates instead of crashing the cloud', () => {
    const rows = [reflection('not a date'), reflection('2026-11-01T00:00:00Z')];
    expect(reflectionsFromLastMonth(rows, NOW)).toEqual([rows[1]]);
  });

  it('returns an empty list when nothing is recent', () => {
    expect(reflectionsFromLastMonth([reflection('2026-01-01T00:00:00Z')], NOW)).toEqual([]);
  });
});
