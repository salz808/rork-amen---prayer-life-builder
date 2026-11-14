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

// The 24 further PL-H4 divergence lines found by the 4-angle audit
// (2026-11-14, Finding 1), extending the settled PL-H4 ruling (Kai
// 2026-10-25, extended by Justin 2026-11-14) to all 40 lines. These
// lines were never aligned to WEB in the batch pass because they have
// no scripture-bank entry — the batch rule only aligned lines with
// one — so they keep their NIV/ESV/KJV wording under the same
// (excerpt) disclosure as the 16. Each entry pins the exact code text
// the app shows, the day it belongs to, and the absence of a bank
// entry, so a future edit to any of these lines — or an added bank
// entry that should trigger alignment — fails loudly instead of
// silently changing what the ruling covers. Divergence from live WEB
// for each line was verified in the audit report; do NOT reword these
// lines without Justin's go.
const DIVERGENT: {
  day: number;
  ref: string;
  source: 'foundations' | 'freedom';
  text: string;
}[] = [
  // Foundations — 10 clear divergences (content.ts)
  { day: 4, ref: '1 Thessalonians 5:18', source: 'foundations', text: 'Give thanks in all circumstances.' },
  { day: 6, ref: '1 Corinthians 3:16', source: 'foundations', text: "Do you not know that you are God's temple and that God's Spirit dwells in you?" },
  { day: 12, ref: 'James 5:16', source: 'foundations', text: 'The prayer of a righteous person has great power.' },
  { day: 14, ref: 'Lamentations 3:22–23', source: 'foundations', text: "It is because of Yahweh's loving kindnesses that we are not consumed, because his mercies don't fail. They are new every morning. Great is your faithfulness." },
  { day: 15, ref: 'Romans 8:26', source: 'foundations', text: 'The Spirit helps us in our weakness.' },
  { day: 18, ref: '1 Samuel 3:10', source: 'foundations', text: 'Speak, Lord, for your servant is listening.' },
  { day: 23, ref: 'Jeremiah 29:7', source: 'foundations', text: 'Seek the peace of the city and pray to the Lord on its behalf.' },
  { day: 24, ref: 'Isaiah 41:10', source: 'foundations', text: 'Fear not, for I am with you; be not dismayed, for I am your God.' },
  { day: 28, ref: 'Psalm 78:4', source: 'foundations', text: 'We will tell the next generation the glorious deeds of the Lord.' },
  { day: 29, ref: '2 Corinthians 3:18', source: 'foundations', text: 'We are being transformed into his image from one degree of glory to another.' },
  // Freedom — 8 clear divergences (freedom.ts)
  { day: 7, ref: 'Romans 12:2', source: 'freedom', text: 'Do not be conformed to this world, but be transformed by the renewal of your mind.' },
  { day: 12, ref: 'John 14:6', source: 'freedom', text: 'Jesus said to him, "I am the way, and the truth, and the life. No one comes to the Father except through me."' },
  { day: 14, ref: 'John 14:15', source: 'freedom', text: 'If you love me, you will keep my commandments.' },
  { day: 15, ref: 'John 15:4', source: 'freedom', text: 'Remain in me, and I will remain in you.' },
  { day: 17, ref: 'James 1:17', source: 'freedom', text: 'Every good and perfect gift is from above, coming down from the Father of lights.' },
  { day: 18, ref: 'Hebrews 12:2', source: 'freedom', text: 'Let us fix our eyes on Jesus, the author and perfecter of our faith.' },
  { day: 19, ref: 'Joshua 1:8', source: 'freedom', text: 'This Book of the Law shall not depart from your mouth, but you shall meditate on it day and night, so that you may be careful to do according to all that is written in it.' },
  { day: 20, ref: 'Revelation 12:11', source: 'freedom', text: 'They have conquered him by the blood of the Lamb and by the word of their testimony.' },
  // Foundations — 6 minor divergences, single-word drops/insertions (content.ts)
  { day: 3, ref: 'Isaiah 43:1', source: 'foundations', text: 'I have called you by name, you are mine.' },
  { day: 10, ref: 'Psalm 37:4', source: 'foundations', text: 'Delight yourself in Yahweh; And He will give you the desires of your heart.' },
  { day: 16, ref: 'Colossians 3:17', source: 'foundations', text: 'Whatever you do, do it all in the name of the Lord Jesus.' },
  { day: 25, ref: 'Psalm 100:4', source: 'foundations', text: 'Enter his gates with thanksgiving, and his courts with praise.' },
  { day: 27, ref: 'Hebrews 4:12', source: 'foundations', text: 'The word of God is living and active, sharper than any two-edged sword.' },
  { day: 30, ref: 'Colossians 4:2', source: 'foundations', text: 'Continue steadfastly in prayer, being watchful in it with thanksgiving.' },
];

describe('day-verse PL-H4 (excerpt) divergences (audit 2026-11-14)', () => {
  it.each(DIVERGENT)(
    '$ref (day $day) keeps its PL-H4 code text and has no bank entry',
    ({ day, ref, source, text }) => {
      const days = source === 'foundations' ? DAYS : FREEDOM_DAYS;
      const idx = days.findIndex(
        (d) => typeof d.verse === 'string' && d.verse.startsWith(`${ref} — `),
      );
      expect(idx).toBe(day - 1);
      const entry = days[idx];
      expect(entry?.verse).toBe(`${ref} — ${text}`);
      // No scripture-bank entry: this is why the batch pass skipped the
      // line, and why it stays under the PL-H4 (excerpt) treatment.
      expect(SCRIPTURE_TEXT[ref]).toBeUndefined();
    },
  );
});
