/**
 * Kai-approved items, 2026-10-26 — unit tests for the pure helpers.
 * - isGraduateFromProgress: graduation is sticky across a second pass.
 * - deviceFallbackSpeechRate: one device-voice fallback formula on
 *   every surface (session voiceover/narration, Declare SPEAK, and the
 *   declarations reader SPEAK).
 */
// services/narration.ts imports expo-audio / expo-crypto / expo-speech
// and Supabase, which cannot load under the node jest environment —
// same mocking pattern as voiceoverCacheKey.test.ts. The helper under
// test is pure and has no such dependency.
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-speech', () => ({}));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
jest.mock('@/services/narrationIndex', () => ({ BAKED_BY_HASH: {}, SELAH_LOOPS: {} }));

// jest.mock calls above are hoisted, so these imports must follow them.
// eslint-disable-next-line import/first
import { isGraduateFromProgress } from '@/lib/trackProgress';
// eslint-disable-next-line import/first
import { deviceFallbackSpeechRate } from '@/services/narration';

describe('isGraduateFromProgress', () => {
  const thirty = Array.from({ length: 30 }, () => ({ completed: true }));
  const empty: { completed: boolean }[] = [];

  it('is true when progress shows 30 completed days', () => {
    expect(isGraduateFromProgress(thirty, false)).toBe(true);
  });

  it('is true when journeyComplete is true', () => {
    expect(isGraduateFromProgress(empty, true)).toBe(true);
  });

  it('stays true on a second pass: progress reset, flag kept', () => {
    // Second pass resets progress to [] and journeyComplete to false,
    // but hasGraduated survives — Freedom and Daily Prayer stay open.
    expect(isGraduateFromProgress(empty, false, true)).toBe(true);
  });

  it('is false for a beginner with no flag', () => {
    expect(isGraduateFromProgress(empty, false, false)).toBe(false);
    expect(isGraduateFromProgress(empty, false, undefined)).toBe(false);
  });

  it('is false mid-journey without the flag', () => {
    const ten = Array.from({ length: 10 }, () => ({ completed: true }));
    expect(isGraduateFromProgress(ten, false)).toBe(false);
  });
});

describe('deviceFallbackSpeechRate', () => {
  it('is the session formula: playbackRate * 0.6, floored at 0.4, capped at 1', () => {
    expect(deviceFallbackSpeechRate(1)).toBeCloseTo(0.6);
    expect(deviceFallbackSpeechRate(1.5)).toBeCloseTo(0.9);
    expect(deviceFallbackSpeechRate(2)).toBe(1);
    expect(deviceFallbackSpeechRate(0.5)).toBe(0.4);
    expect(deviceFallbackSpeechRate(undefined)).toBeCloseTo(0.6);
  });
});
