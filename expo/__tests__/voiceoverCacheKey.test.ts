// Audit round 11, H1 regression: the old session cache key was
// `${day}-${movement}` with no track, so Foundations Day 5's voiceover
// URL cached under `5-thank` was returned verbatim for Freedom Day 5's
// different text (getGoogleTTSAudio checks the in-memory cache BEFORE
// the text-hash baked lookup). The key must scope by track.
//
// Only the pure key helper is under test here: services/tts.ts also
// imports expo-file-system / Supabase, which cannot load under the
// node jest environment, so those modules are mocked out below. The
// helper itself has no such dependency.
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: null } }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));
jest.mock('@/services/narration', () => ({ getBakedAudioUrl: jest.fn(), SPEED_SESSION: 92 }));

// jest.mock calls above are hoisted, so this import must follow them.
// eslint-disable-next-line import/first
import { voiceoverCacheKey } from '../services/tts';

describe('voiceoverCacheKey (round 11 H1)', () => {
  it('differs across tracks for the same day and movement', () => {
    expect(voiceoverCacheKey('foundations', 5, 'thank')).not.toBe(
      voiceoverCacheKey('freedom', 5, 'thank'),
    );
  });

  it('differs across days and movements within a track', () => {
    expect(voiceoverCacheKey('freedom', 5, 'thank')).not.toBe(
      voiceoverCacheKey('freedom', 6, 'thank'),
    );
    expect(voiceoverCacheKey('freedom', 5, 'thank')).not.toBe(
      voiceoverCacheKey('freedom', 5, 'ask'),
    );
  });

  it('is stable for the same track, day, and movement', () => {
    expect(voiceoverCacheKey('foundations', 5, 'thank')).toBe(
      voiceoverCacheKey('foundations', 5, 'thank'),
    );
  });
});
