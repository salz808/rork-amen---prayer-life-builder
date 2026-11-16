import {
  LIST_ENTRANCE_MAX_INDEX,
  LIST_ENTRANCE_MS,
  LIST_ENTRANCE_STAGGER_MS,
  LIST_ENTRANCE_Y,
  listEntranceDelayMs,
  shouldAnimateListEntrance,
} from '../lib/listEntrance';

describe('listEntrance (M-7)', () => {
  it('pins the entrance values', () => {
    expect(LIST_ENTRANCE_MS).toBe(340);
    expect(LIST_ENTRANCE_Y).toBe(8);
    expect(LIST_ENTRANCE_STAGGER_MS).toBe(50);
    expect(LIST_ENTRANCE_MAX_INDEX).toBe(5);
  });

  it('staggers only the first five', () => {
    expect(listEntranceDelayMs(0)).toBe(0);
    expect(listEntranceDelayMs(1)).toBe(50);
    expect(listEntranceDelayMs(4)).toBe(200);
    expect(listEntranceDelayMs(5)).toBe(0);
    expect(listEntranceDelayMs(20)).toBe(0);
  });

  it('animates only index < 5 and only without Reduce Motion', () => {
    expect(shouldAnimateListEntrance(0, false)).toBe(true);
    expect(shouldAnimateListEntrance(4, false)).toBe(true);
    expect(shouldAnimateListEntrance(5, false)).toBe(false);
    expect(shouldAnimateListEntrance(0, true)).toBe(false);
  });
});
