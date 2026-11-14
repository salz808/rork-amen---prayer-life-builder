import {
  BOOT_BLOOM_MS,
  BOOT_EXIT_MS,
  BOOT_SUBTITLE_MS,
  BOOT_SWEEP_DELAY_MS,
  BOOT_SWEEP_MS,
  BOOT_WORDMARK_MS,
  HOME_ENTRANCE_DELAY_MS,
  LAUNCH_STAGGER_MS,
  bootExitDurationMs,
  homeEntranceDelayMs,
} from '@/lib/launchMotion';

// The launch beat is one shared rhythm across the boot screen and the
// Home entrance. These tests pin it so a future edit cannot silently
// change the choreography — a slower stagger or a longer veil changes
// what the first two seconds feel like.
describe('launchMotion', () => {
  it('keeps the shared stagger beat at 120ms', () => {
    expect(LAUNCH_STAGGER_MS).toBe(120);
  });

  it('runs the boot entrance as one arc: bloom, then wordmark, then subtitle, then sweep', () => {
    expect(BOOT_BLOOM_MS).toBe(700);
    expect(BOOT_WORDMARK_MS).toBe(280);
    expect(BOOT_SUBTITLE_MS).toBe(260);
    // The light sweep starts once the wordmark has landed.
    expect(BOOT_SWEEP_DELAY_MS).toBeGreaterThan(BOOT_WORDMARK_MS);
    expect(BOOT_SWEEP_MS).toBe(800);
  });

  it('exits the boot veil in 350ms, instantly under Reduce Motion', () => {
    expect(BOOT_EXIT_MS).toBe(350);
    expect(bootExitDurationMs(false)).toBe(350);
    expect(bootExitDurationMs(true)).toBe(0);
  });

  it('starts the Home cascade while the veil is still lifting, with no delay under Reduce Motion', () => {
    expect(HOME_ENTRANCE_DELAY_MS).toBe(240);
    expect(HOME_ENTRANCE_DELAY_MS).toBeLessThan(BOOT_EXIT_MS);
    expect(homeEntranceDelayMs(false)).toBe(240);
    expect(homeEntranceDelayMs(true)).toBe(0);
  });
});
