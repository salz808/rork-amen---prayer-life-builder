// Soundscapes load from the public Supabase Storage bucket `soundscapes`,
// never from Google Drive (2026-11-19: the four tracks + two monastic
// bonuses were moved off Drive links). The URLs are built directly from
// the project host so they resolve even when Supabase is not configured
// (local-guest mode) — the bucket is public, no client or key needed.
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const SUPABASE_PUBLIC_PREFIX =
  'https://aexpgrcglddudxxcjlzj.supabase.co/storage/v1/object/public/soundscapes/';

describe('soundscapes come from Supabase, not Google Drive', () => {
  it('every soundscape uri is a Supabase public URL for its own file', () => {
    expect(SOUNDSCAPE_OPTIONS.length).toBe(4);
    for (const option of SOUNDSCAPE_OPTIONS) {
      expect(option.uri).toBe(`${SUPABASE_PUBLIC_PREFIX}${option.id}.mp3`);
      expect(option.uri).not.toContain('drive');
      for (const bonus of option.bonusUris ?? []) {
        expect(bonus.startsWith(SUPABASE_PUBLIC_PREFIX)).toBe(true);
        expect(bonus.endsWith('.mp3')).toBe(true);
        expect(bonus).not.toContain('drive');
      }
    }
  });

  it('the monastic track keeps both bonus tracks on Supabase', () => {
    const monastic = SOUNDSCAPE_OPTIONS.find((option) => option.id === 'monastic');
    expect(monastic?.bonusUris).toEqual([
      `${SUPABASE_PUBLIC_PREFIX}monastic-bonus1.mp3`,
      `${SUPABASE_PUBLIC_PREFIX}monastic-bonus2.mp3`,
    ]);
  });
});
