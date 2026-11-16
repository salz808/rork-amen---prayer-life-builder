/**
 * Journal word-cloud tokenization (c) (2026-11-16).
 *
 * Pure logic, kept out of the component so it is unit-testable (see
 * __tests__/wordCloud.test.ts).
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'i', 'my', 'me', 'we', 'our', 'you', 'your', 'they', 'them',
  'this', 'am', 'do', 'not', 'have', 'but', 'or', 'if', 'what', 'so', 'all',
  'just', 'like', 'about', 'out', 'up', 'down', 'can', 'would', 'could', 'should'
]);

// The divine names dominate every cloud ("god", "lord", "jesus" in
// nearly every reflection), so they are stop words — the cloud should
// surface what the person prayed ABOUT, not who they prayed to.
const DOMAIN_STOP_WORDS = new Set(['god', 'lord', 'jesus']);

/**
 * Light suffix stemmer so inflections count as one word (praying /
 * prayed → pray). Conservative on purpose: only the most common
 * English suffixes, with length guards so short words ("bless",
 * "cross") are never mangled.
 */
function stemWordCloudToken(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/**
 * Tokenize reflection text into word counts for the cloud.
 *
 * The old regex /\b[a-z]{3,}\b/g was ASCII-only — any non-English
 * reflection (accents, Cyrillic, CJK, Arabic) tokenized to nothing.
 * Tokens are now Unicode letters ([\p{L}\p{M}]+ — Hermes and V8 both
 * support \p property escapes), at least 3 code points long,
 * lowercased, stop-word filtered (including the divine names above),
 * and lightly stemmed. A token is filtered both before and after
 * stemming, so "gods" still drops out via the stemmed "god".
 */
export function extractWordCloudCounts(textData: string[]): Record<string, number> {
  const rawText = textData.join(' ').toLowerCase();
  const tokens = rawText.match(/[\p{L}\p{M}]+/gu) ?? [];
  const counts: Record<string, number> = {};
  for (const raw of tokens) {
    const token = raw.replace(/['’]s$/, '');
    if ([...token].length < 3) continue;
    if (STOP_WORDS.has(token) || DOMAIN_STOP_WORDS.has(token)) continue;
    const stemmed = stemWordCloudToken(token);
    if (STOP_WORDS.has(stemmed) || DOMAIN_STOP_WORDS.has(stemmed)) continue;
    counts[stemmed] = (counts[stemmed] ?? 0) + 1;
  }
  return counts;
}
