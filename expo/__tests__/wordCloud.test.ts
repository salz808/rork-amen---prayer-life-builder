// Journal themes (c) (2026-11-16): the old /\b[a-z]{3,}\b/g regex was
// ASCII-only (non-English reflections tokenized to nothing), and
// "god" / "lord" / "jesus" dominated every cloud. Tokens are now
// Unicode letters, divine names are stop words, and inflections are
// lightly stemmed so praying/prayed count as one word.
import { extractWordCloudCounts } from '../lib/wordCloud';

describe('extractWordCloudCounts', () => {
  it('counts plain English words', () => {
    expect(extractWordCloudCounts(['peace peace hope'])).toEqual({ peace: 2, hope: 1 });
  });

  it('tokenizes non-English text the old ASCII regex dropped', () => {
    // Accented Latin, Cyrillic, and CJK all produce tokens now.
    expect(extractWordCloudCounts(['oración por mi familia'])).toEqual({
      oración: 1,
      por: 1,
      familia: 1,
    });
    expect(extractWordCloudCounts(['молитва о мире'])).toEqual({ молитва: 1, мире: 1 });
    expect(extractWordCloudCounts(['为家人祷告平安'])).toEqual({ 为家人祷告平安: 1 });
  });

  it('drops god / lord / jesus (and their inflected forms) so they cannot dominate', () => {
    expect(
      extractWordCloudCounts(['Thank you God, Lord Jesus, for peace and hope']),
    ).toEqual({ thank: 1, peace: 1, hope: 1 });
    expect(extractWordCloudCounts(["God's love and the lords mercy"])).toEqual({
      love: 1,
      mercy: 1,
    });
  });

  it('stems inflections together', () => {
    expect(extractWordCloudCounts(['praying prayed prayers'])).toEqual({
      pray: 2,
      prayer: 1,
    });
    expect(extractWordCloudCounts(['answered answering'])).toEqual({ answer: 2 });
  });

  it('keeps ordinary stop words out and drops tokens shorter than 3 letters', () => {
    expect(extractWordCloudCounts(['I am at peace and we are ok'])).toEqual({ peace: 1 });
  });

  it('does not mangle short words ending in s', () => {
    expect(extractWordCloudCounts(['bless cross peace'])).toEqual({
      bless: 1,
      cross: 1,
      peace: 1,
    });
  });

  it('returns empty counts for empty input', () => {
    expect(extractWordCloudCounts([])).toEqual({});
    expect(extractWordCloudCounts([''])).toEqual({});
  });
});
