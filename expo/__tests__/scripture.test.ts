import { DECLARATIONS } from '@/mocks/declarations';
import { getScriptureText, getScriptureVerses, SCRIPTURE_TEXT } from '@/mocks/scriptureText';

describe('getScriptureVerses', () => {
  it('resolves a single citation', () => {
    const verses = getScriptureVerses('Romans 5:8');
    expect(verses).toHaveLength(1);
    expect(verses[0].reference).toBe('Romans 5:8');
    expect(verses[0].text).toBe(SCRIPTURE_TEXT['Romans 5:8']);
  });

  it('resolves each part of a dual citation separately', () => {
    const verses = getScriptureVerses('Romans 5:8 / Ephesians 4:27');
    expect(verses.map((v) => v.reference)).toEqual(['Romans 5:8', 'Ephesians 4:27']);
  });

  it('skips unknown passages instead of failing', () => {
    expect(getScriptureVerses('Romans 5:8 / Not A Verse')).toHaveLength(1);
  });

  it('returns [] for an empty citation', () => {
    expect(getScriptureVerses('')).toEqual([]);
  });
});

describe('getScriptureText', () => {
  it('returns null for an unknown reference', () => {
    expect(getScriptureText('Not A Verse')).toBeNull();
  });
});

describe('declaration citation coverage', () => {
  it('every declaration citation resolves fully in the scripture bank', () => {
    const unresolved: string[] = [];
    for (const declaration of DECLARATIONS) {
      const parts = declaration.scripture.split(' / ');
      const resolved = getScriptureVerses(declaration.scripture);
      if (resolved.length !== parts.length) {
        unresolved.push(`${declaration.id}: ${declaration.scripture}`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('the bank holds the 2026-10-24 rulings (James 4:7, Day 21/22 era texts)', () => {
    expect(getScriptureText('James 4:7')).toMatch(/Resist the devil/);
  });
});
