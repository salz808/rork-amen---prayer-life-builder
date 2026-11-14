// Launch motion — the shared choreography for app launch (BootScreen ->
// first paint) and the Home mount entrance.
//
// One beat everywhere: entrances stagger 120ms apart and ease out cubic,
// and the Home cascade starts while the boot veil is still lifting, so
// the greeting lands just as the veil clears. All durations are caps on
// work already happening, not minimums — the boot exits the moment the
// app is ready and is never held for animation's sake, and time-to-
// interactive does not grow: the app mounts underneath the fading boot.

export const LAUNCH_STAGGER_MS = 120;
export const BOOT_BLOOM_MS = 700;
export const BOOT_WORDMARK_MS = 280;
export const BOOT_SUBTITLE_MS = 260;
export const BOOT_SWEEP_DELAY_MS = 420;
export const BOOT_SWEEP_MS = 800;
export const BOOT_EXIT_MS = 350;
export const HOME_ENTRANCE_DELAY_MS = 240;

/** Boot overlay exit duration — instant when Reduce Motion is on. */
export function bootExitDurationMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : BOOT_EXIT_MS;
}

/**
 * Delay before the Home entrance cascade starts. The cascade begins
 * while the boot veil is still lifting (240ms < 350ms exit) so the
 * greeting lands just as the veil clears. No delay under Reduce Motion
 * — the content simply appears.
 */
export function homeEntranceDelayMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : HOME_ENTRANCE_DELAY_MS;
}
