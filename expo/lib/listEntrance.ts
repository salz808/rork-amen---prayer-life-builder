// List entrances (M-7): initial mount only. The first five items stagger
// in (index × 50ms), opacity 0 → 1, translateY 8 → 0 over 340ms; index ≥ 5
// or Reduce Motion renders immediately. Pure helpers so the values are
// pinned by tests instead of living as magic numbers at call sites.
export const LIST_ENTRANCE_MS = 340;
export const LIST_ENTRANCE_Y = 8;
export const LIST_ENTRANCE_STAGGER_MS = 50;
export const LIST_ENTRANCE_MAX_INDEX = 5;

export function shouldAnimateListEntrance(index: number, reduceMotion: boolean): boolean {
  return !reduceMotion && index < LIST_ENTRANCE_MAX_INDEX;
}

export function listEntranceDelayMs(index: number): number {
  return index < LIST_ENTRANCE_MAX_INDEX ? index * LIST_ENTRANCE_STAGGER_MS : 0;
}
