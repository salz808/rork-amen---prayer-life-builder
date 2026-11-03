// Wave 2, fix 7 (content lane F-1): prompt-only Foundations days
// used to share a generic fallback declaration because the share
// builders read `declare` but never `declarePrompt`. The day's
// declaration content is now plumbed through getDayContent, and the
// builders use getDeclarationText. No declaration wording changes
// here — the assertions compare against the raw day data itself.
import { DAYS, getDayContent, getDeclarationText } from '../mocks/content';

const FALLBACK = 'I am a beloved child of God.';

describe('declarePrompt share plumbing', () => {
  it('exposes declarePrompt on DayContent', () => {
    const raw = DAYS[7]; // Day 8: first prompt-only day
    expect(raw.declare).toBeNull();
    expect(raw.declarePrompt).toBeTruthy();
    expect(getDayContent(8).declarePrompt).toBe(raw.declarePrompt);
  });

  it('shares the day\'s prompt on prompt-only days, never the fallback', () => {
    const promptOnlyDays = DAYS.map((d, i) => ({ day: i + 1, raw: d })).filter(
      ({ raw }) => raw.declare == null && raw.declarePrompt != null,
    );
    // The audit counts 23 prompt-only days (8–30); assert the family,
    // not an exact headcount, so a future content edit fails loudly
    // here instead of silently reintroducing the fallback.
    expect(promptOnlyDays.length).toBeGreaterThan(0);
    for (const { day, raw } of promptOnlyDays) {
      const content = getDayContent(day);
      expect(getDeclarationText(content)).toBe(raw.declarePrompt);
      expect(getDeclarationText(content)).not.toBe(FALLBACK);
    }
  });

  it('keeps scripted declarations on scripted days and the fallback only where neither exists', () => {
    for (let day = 1; day <= 30; day++) {
      const raw = DAYS[day - 1];
      const content = getDayContent(day);
      const expected = raw.declare ?? raw.declarePrompt ?? FALLBACK;
      expect(getDeclarationText(content)).toBe(expected);
      if (raw.declare != null) {
        expect(getDeclarationText(content)).toBe(raw.declare);
      }
    }
  });
});
