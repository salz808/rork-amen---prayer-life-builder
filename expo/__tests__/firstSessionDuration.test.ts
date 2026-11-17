import * as fs from 'fs';
import * as path from 'path';
import { getDayContent } from '@/mocks/content';
import { FIRST_SESSION_MINUTES } from '@/lib/sessionDuration';

// GPT-6 item 10: the "about three minutes a day" promise is MEASURED from
// the Day 1 session definitions, not a round number. These tests pin the
// measurement so a content edit that pushes Day 1 past the ~3-minute band
// fails loudly instead of silently breaking the promise. See
// lib/sessionDuration.ts for the full derivation (movements, word counts,
// the 60s Selah timer, the 75.3s Day 1 voiceover corroboration).

const NUMBER_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
};

function wordCount(text: string | null | undefined): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

describe('first-session duration (Day 1, Foundations)', () => {
  it('pins the measured number', () => {
    expect(FIRST_SESSION_MINUTES).toBe(3);
  });

  it('measures Day 1 at ~3 minutes prayed as designed', () => {
    const day = getDayContent(1);

    // The only enforced timer in the session: the Selah silence.
    expect(day.silence.durationSeconds).toBe(60);
    // Five TRIAD movements, as the session pager expects.
    expect(day.triad).toHaveLength(5);

    // Every word the user reads/prays on Day 1: settle + focus, the five
    // TRIAD bodies, the silence prompt, Live It, identity, verse.
    const words =
      wordCount(day.settle) +
      wordCount(day.teach) +
      day.triad.reduce((sum, phase) => sum + wordCount(phase.text), 0) +
      wordCount(day.silence.prompt) +
      wordCount(day.act) +
      wordCount(day.identity) +
      wordCount(day.verse);
    expect(words).toBe(213);

    // Read aloud slowly (the app's own Days 1–7 instruction) at ~130 wpm,
    // plus the full Selah minute, plus ~15s of page turns and closing.
    const readAloudSeconds = (words / 130) * 60;
    const estimateSeconds = readAloudSeconds + day.silence.durationSeconds + 15;
    expect(estimateSeconds).toBeGreaterThanOrEqual(150);
    expect(estimateSeconds).toBeLessThanOrEqual(210);
    expect(Math.round(estimateSeconds / 60)).toBe(FIRST_SESSION_MINUTES);
  });

  it('onboarding splash promises the measured number in words', () => {
    // The splash copy moved with the splash motion (GPT-6 splash spec,
    // 2026-11-17): lib/splashMotion.ts holds SPLASH_TAGLINE_AMBER and
    // components/SplashMotion.tsx renders it — onboarding.tsx only
    // mounts the component now.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'splashMotion.ts'),
      'utf8',
    );
    const word = NUMBER_WORDS[FIRST_SESSION_MINUTES];
    expect(src).toContain(`${word} honest minutes a day`);
    expect(src).not.toContain('five honest minutes');
  });

  it('Home reads the same constant, with no hard-coded 5 minutes left', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', '(tabs)', '(home)', 'index.tsx'),
      'utf8',
    );
    expect(src).toContain('FIRST_SESSION_MINUTES');
    expect(src).not.toContain('About 5 minutes');
  });
});
