import { DAYS } from '@/mocks/content';
import { FREEDOM_DAYS } from '@/mocks/freedom';
import { SCRIPTURE_TEXT } from '@/mocks/scriptureText';

// The 16 PL-H4 divergence lines, WEB-aligned in the batch pass (Kai
// 2026-10-25). Each day-verse text must be a contiguous span of its
// bank WEB text: the full bank text, or a truncation of it. This pins
// the batch rule — retained words must be verbatim WEB — so a future
// edit cannot silently reintroduce other-translation wording.
const EXPECTED: { ref: string; source: 'foundations' | 'freedom' }[] = [
  { ref: 'Psalm 139:1', source: 'foundations' },
  { ref: 'Romans 8:1', source: 'foundations' },
  { ref: 'Colossians 3:13', source: 'foundations' },
  { ref: 'Philippians 1:6', source: 'foundations' },
  { ref: '2 Corinthians 5:7', source: 'foundations' },
  { ref: '1 John 3:1', source: 'foundations' },
  { ref: 'Jeremiah 29:11', source: 'foundations' },
  { ref: '2 Corinthians 5:17', source: 'freedom' },
  { ref: 'John 8:32', source: 'freedom' },
  { ref: '1 John 1:9', source: 'freedom' },
  { ref: 'Luke 10:19', source: 'freedom' },
  { ref: 'Ephesians 3:20', source: 'freedom' },
  { ref: '1 John 4:16', source: 'freedom' },
  { ref: 'Romans 8:31', source: 'freedom' },
  { ref: 'Galatians 3:13', source: 'freedom' },
  { ref: '1 John 3:1', source: 'freedom' },
];

// Day lines may start capitalized where the bank mid-sentence does
// not, and may end where the bank continues — compare case-insensibly
// and ignore trailing sentence punctuation on the day line.
function normalize(s: string): string {
  return s.trim().replace(/[.!]$/, '').toLowerCase();
}

describe('day-verse WEB alignment (batch pass)', () => {
  it.each(EXPECTED)('$ref day line is a span of bank WEB text', ({ ref, source }) => {
    const days = source === 'foundations' ? DAYS : FREEDOM_DAYS;
    const entry = days.find(
      (d) => typeof d.verse === 'string' && d.verse.startsWith(`${ref} — `),
    );
    expect(entry).toBeDefined();
    const verse = entry?.verse ?? '';
    expect(verse.length).toBeGreaterThan(0);
    const text = verse.slice(ref.length + 3);
    const bank = SCRIPTURE_TEXT[ref] ?? '';
    expect(bank.length).toBeGreaterThan(0);
    expect(normalize(bank).includes(normalize(text))).toBe(true);
  });
});
