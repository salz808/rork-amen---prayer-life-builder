import {
  BOOT_BLOOM_MS,
  BOOT_CONTENT_EXIT_MS,
  BOOT_EXIT_START_MS,
  BOOT_GLOW_PEAK_OPACITY,
  BOOT_ORBIT_MS,
  BOOT_ORBIT_PEAK_OPACITY,
  BOOT_REDUCE_EXIT_MS,
  BOOT_REDUCE_HOLD_MS,
  BOOT_STILL_POINT_MS,
  BOOT_SUBTITLE_MS,
  BOOT_SWEEP_DELAY_MS,
  BOOT_SWEEP_MS,
  BOOT_VEIL_EXIT_DELAY_MS,
  BOOT_VEIL_EXIT_MS,
  BOOT_VEIL_START_MS,
  BOOT_WORDMARK_MS,
  BOOT_WORDMARK_OPACITY_MS,
  BOOT_WORDMARK_SETTLE_MS,
  COMPLETION_CHECK_START,
  COMPLETION_CONFETTI_MS,
  COMPLETION_CTA_DELAY_MS,
  COMPLETION_CTA_MS,
  COMPLETION_LIGHT_AT_MS,
  COMPLETION_RECAP_MS,
  COMPLETION_SILENCE_MS,
  HOME_ENTRANCE_AT_MS,
  HOME_ENTRANCE_MS,
  HOME_STAGGER_MS,
  LAUNCH_STAGGER_MS,
  bootExitDelayMs,
  bootVeilDurationMs,
  homeEntranceDelayForElapsedMs,
  markBootStart,
  msSinceBootStart,
  resetBootStart,
} from '@/lib/launchMotion';

// The launch beat is one shared rhythm across the boot screen and the
// Home entrance. These tests pin it so a future edit cannot silently
// change the choreography — a slower stagger or a longer veil changes
// what the first two seconds feel like. All times are mount-relative
// (t=0 is the boot's first frame); the exit waits for BOTH app-ready
// and the Still Point.
describe('launchMotion', () => {
  afterEach(() => {
    resetBootStart();
  });

  it('keeps the shared stagger beats: boot 120ms, Home tiers 65ms', () => {
    expect(LAUNCH_STAGGER_MS).toBe(120);
    expect(HOME_STAGGER_MS).toBe(65);
  });

  it('runs the boot entrance as one arc: bloom, then wordmark, then subtitle, then sweep', () => {
    expect(BOOT_BLOOM_MS).toBe(680);
    expect(BOOT_WORDMARK_MS).toBe(500);
    expect(BOOT_WORDMARK_OPACITY_MS).toBe(400);
    expect(BOOT_SUBTITLE_MS).toBe(260);
    // The light sweep starts mid wordmark-rise (the 500ms rise lands
    // at t=620, after the 420ms sweep start) and finishes as the
    // wordmark settles — one entrance, not a separate beat.
    expect(BOOT_SWEEP_DELAY_MS).toBeGreaterThan(LAUNCH_STAGGER_MS);
    expect(BOOT_SWEEP_DELAY_MS).toBeLessThan(BOOT_WORDMARK_SETTLE_MS);
    expect(BOOT_SWEEP_MS).toBe(800);
  });

  it('settles the orbit arc once, never a looped spin, with the stroke under the 0.4 cap', () => {
    expect(BOOT_ORBIT_MS).toBe(1100);
    expect(BOOT_ORBIT_PEAK_OPACITY).toBe(0.28);
    expect(BOOT_ORBIT_PEAK_OPACITY).toBeLessThanOrEqual(0.4);
  });

  it('caps the glow bloom at 0.42, never 1.0', () => {
    expect(BOOT_GLOW_PEAK_OPACITY).toBe(0.42);
    expect(BOOT_GLOW_PEAK_OPACITY).toBeLessThan(1);
  });

  it('holds a 140ms Still Point after the wordmark settles before the veil may lift', () => {
    expect(BOOT_WORDMARK_SETTLE_MS).toBe(LAUNCH_STAGGER_MS + BOOT_WORDMARK_MS);
    expect(BOOT_WORDMARK_SETTLE_MS).toBe(620);
    expect(BOOT_STILL_POINT_MS).toBe(140);
    expect(BOOT_EXIT_START_MS).toBe(760);
  });

  it('splits the boot exit: content fades 260ms from t=760, veil lifts 440ms from t=820', () => {
    expect(BOOT_CONTENT_EXIT_MS).toBe(260);
    expect(BOOT_VEIL_EXIT_DELAY_MS).toBe(60);
    expect(BOOT_VEIL_START_MS).toBe(BOOT_EXIT_START_MS + BOOT_VEIL_EXIT_DELAY_MS);
    expect(BOOT_VEIL_START_MS).toBe(820);
    expect(BOOT_VEIL_EXIT_MS).toBe(440);
    // Veil finishes at t=1260.
    expect(BOOT_VEIL_START_MS + BOOT_VEIL_EXIT_MS).toBe(1260);
  });

  it('waits for the Still Point when fonts load fast, and never holds a slow load longer', () => {
    expect(bootExitDelayMs(0, false)).toBe(760);
    expect(bootExitDelayMs(300, false)).toBe(460);
    expect(bootExitDelayMs(760, false)).toBe(0);
    expect(bootExitDelayMs(2000, false)).toBe(0);
  });

  it('starts the Home cascade at t=940, overlapping the veil lift, with no delay under Reduce Motion', () => {
    expect(HOME_ENTRANCE_AT_MS).toBe(940);
    expect(HOME_ENTRANCE_AT_MS).toBeGreaterThan(BOOT_VEIL_START_MS);
    expect(HOME_ENTRANCE_AT_MS).toBeLessThan(BOOT_VEIL_START_MS + BOOT_VEIL_EXIT_MS);
    expect(homeEntranceDelayForElapsedMs(300, false)).toBe(640);
    expect(homeEntranceDelayForElapsedMs(940, false)).toBe(0);
    expect(homeEntranceDelayForElapsedMs(1500, false)).toBe(0);
    expect(homeEntranceDelayForElapsedMs(0, true)).toBe(0);
  });

  it('runs each Home tier 380-420ms', () => {
    expect(HOME_ENTRANCE_MS).toBeGreaterThanOrEqual(380);
    expect(HOME_ENTRANCE_MS).toBeLessThanOrEqual(420);
  });

  it('reduces motion to a 640ms Static Hold + Fade: hold 380ms, fade veil 260ms', () => {
    expect(BOOT_REDUCE_HOLD_MS).toBe(380);
    expect(BOOT_REDUCE_EXIT_MS).toBe(260);
    expect(BOOT_REDUCE_HOLD_MS + BOOT_REDUCE_EXIT_MS).toBe(640);
    expect(bootVeilDurationMs(true)).toBe(260);
    expect(bootVeilDurationMs(false)).toBe(440);
    expect(bootExitDelayMs(0, true)).toBe(380);
    expect(bootExitDelayMs(500, true)).toBe(0);
  });

  it('pins the completion 3-beat choreography (M-5)', () => {
    // Beat 1 Amen Silence 600ms (Light haptic at 150ms, Success at reveal).
    expect(COMPLETION_SILENCE_MS).toBe(600);
    expect(COMPLETION_LIGHT_AT_MS).toBe(150);
    // Beat 2 reveal: checkmark springs from 0.94, recap fades 460ms.
    expect(COMPLETION_CHECK_START).toBe(0.94);
    expect(COMPLETION_RECAP_MS).toBe(460);
    // Beat 3 Inner Seal: action row fades in 80ms after the recap starts.
    expect(COMPLETION_CTA_DELAY_MS).toBe(COMPLETION_SILENCE_MS + 80);
    expect(COMPLETION_CTA_MS).toBe(300);
    // Milestone confetti waits out the silence (600 + 400ms).
    expect(COMPLETION_CONFETTI_MS).toBe(COMPLETION_SILENCE_MS + 400);
  });

  it('tracks the boot clock from the marked start', () => {
    markBootStart(1000);
    expect(msSinceBootStart(1500)).toBe(500);
    expect(msSinceBootStart(900)).toBe(0);
    // Set-once per launch: a second mark does not rewind the clock.
    markBootStart(2000);
    expect(msSinceBootStart(2500)).toBe(1500);
  });
});
