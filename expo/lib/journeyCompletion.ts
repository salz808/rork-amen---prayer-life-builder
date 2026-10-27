/**
 * Partner Library jump-ahead completion rules (pure, tested).
 *
 * The old completeDay advanced unconditionally: currentDay = day + 1.
 * That is only correct when the completed day IS the frontier. A
 * jumped-ahead completion (Partner opening a future day from the
 * Library) must record that day as completed WITHOUT leaping the
 * frontier past uncompleted days — otherwise completing Day 20 while
 * the frontier sits at Day 5 would skip Days 5–19 forever.
 *
 * Rules:
 * - completed day == frontier: advance to day + 1 (capped at 30);
 *   completing Day 30 finishes the journey.
 * - completed day > frontier (jumped ahead): frontier unchanged,
 *   journey-complete unchanged — even for a jumped Day 30, which does
 *   NOT finish the journey (the frontier days are still unprayed).
 * - completed day < frontier (replay / defensive): frontier unchanged
 *   — the old code would have moved currentDay BACKWARDS to day + 1.
 * Pacing is untouched: free users can never open a jumped day (the
 * Library and session gates block them), and a frontier completion
 * still unlocks exactly one next day.
 */

export interface FrontierAfterCompletion {
  currentDay: number;
  journeyComplete: boolean;
}

export function resolveCompletionFrontier(
  currentDay: number,
  completedDay: number,
  journeyComplete: boolean,
): FrontierAfterCompletion {
  if (completedDay === currentDay) {
    return {
      currentDay: Math.min(completedDay + 1, 30),
      journeyComplete: completedDay === 30,
    };
  }
  return { currentDay, journeyComplete };
}

/** True when this session opened a day ahead of the frontier (Partner-only path; gates enforce the tier). */
export function isJumpedAheadDay(day: number, frontierDay: number): boolean {
  return day > frontierDay;
}
