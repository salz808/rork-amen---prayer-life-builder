import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getBakedAudioUrl, SPEED_SESSION } from '@/services/narration';

const TTS_REQUEST_TIMEOUT_MS = 12000;

type GoogleTTSResponse = {
  audioContent?: string;
  mimeType?: string;
  encoding?: string;
  error?: string;
};

const audioCache: Record<string, string> = {};
const pendingAudioRequests: Partial<Record<string, Promise<string | null>>> = {};

// The cache is per-session but unbounded by default; a long session of
// distinct lines would grow it without limit. Cap it FIFO-style.
const MAX_CACHED_AUDIO_ENTRIES = 50;

function setCachedAudio(cacheKey: string, value: string): void {
  const keys = Object.keys(audioCache);
  while (keys.length >= MAX_CACHED_AUDIO_ENTRIES) {
    const oldest = keys.shift();
    if (oldest === undefined) break;
    delete audioCache[oldest];
  }
  audioCache[cacheKey] = value;
}

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Audit round 11, H1 (voiceover cache-key collision): the old session
// key was `${day}-${movement}`, with no track — Foundations Day 5's
// voiceover URL cached under `5-thank` was returned verbatim for
// Freedom Day 5's different text, because getGoogleTTSAudio checks the
// in-memory cache BEFORE the text-hash baked lookup. The track MUST be
// part of the key: same day + movement on two tracks is different audio.
// Callers must build keys through this helper, never inline.
export function voiceoverCacheKey(trackId: string, day: number, movementId: string): string {
  return `${trackId}-${day}-${movementId}`;
}

// Audit round 3, S3: the in-memory map is capped at 50, but the tts_*.mp3
// files on disk were never deleted — ~300 files per full journey, growing
// forever. Prune after each disk write: keep the newest 100 files, never
// delete a file the in-memory cache still points at (playback reads those
// URIs directly without an existence check). Best-effort: pruning must
// never break playback.
const MAX_TTS_FILES_ON_DISK = 100;

async function pruneTtsCacheDir(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const cacheDirectory = Paths.cache;
    if (!cacheDirectory?.uri) return;
    const dirUri = cacheDirectory.uri;
    const names = await LegacyFileSystem.readDirectoryAsync(dirUri);
    const ttsNames = names.filter((n) => n.startsWith('tts_') && n.endsWith('.mp3'));
    if (ttsNames.length <= MAX_TTS_FILES_ON_DISK) return;
    const liveNames = new Set(
      Object.values(audioCache).map((uri) => uri.slice(uri.lastIndexOf('/') + 1)),
    );
    const candidates: { name: string; uri: string; mtime: number }[] = [];
    for (const name of ttsNames) {
      if (liveNames.has(name)) continue;
      const uri = `${dirUri}${dirUri.endsWith('/') ? '' : '/'}${name}`;
      try {
        const info = await LegacyFileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        // FileInfo is a union: the not-exists variant carries no
        // modificationTime, so read it through a narrow cast.
        const mtime = (info as { modificationTime?: number }).modificationTime ?? 0;
        candidates.push({ name, uri, mtime });
      } catch {
        // Unstatable file: leave it alone.
      }
    }
    const excess = ttsNames.length - MAX_TTS_FILES_ON_DISK;
    candidates.sort((a, b) => a.mtime - b.mtime);
    for (const victim of candidates.slice(0, excess)) {
      try {
        await LegacyFileSystem.deleteAsync(victim.uri, { idempotent: true });
      } catch {
        // One undeletable file must not stop the rest.
      }
    }
  } catch {
    // Pruning is housekeeping; never fail a TTS request over it.
  }
}

export async function getGoogleTTSAudio(text: string, cacheKey: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    if (__DEV__) console.warn('[TTS] Supabase is not configured, skipping voiceover request');
    return null;
  }

  if (audioCache[cacheKey]) {
    return audioCache[cacheKey];
  }

  if (pendingAudioRequests[cacheKey]) {
    return pendingAudioRequests[cacheKey];
  }

  const request = (async (): Promise<string | null> => {
    try {
      // Baked narration first: fixed session text was rendered ahead of
      // time in the Helio voice (see services/narration.ts). A hash hit
      // on the exact text returns the Storage URL; anything else falls
      // through to the live Google TTS path below, unchanged.
      const bakedUrl = await getBakedAudioUrl(text, SPEED_SESSION);
      if (bakedUrl) {
        setCachedAudio(cacheKey, bakedUrl);
        return bakedUrl;
      }
      // Audit round 13, H13: log WHY the baked path was skipped before
      // falling through to live Google TTS. The reason itself (baked
      // hash miss vs bucket URL construction failure) is logged inside
      // getBakedAudioUrl; this line marks the fallback decision point.
      // No bucket policy is claimed or changed here.
      if (__DEV__) console.log('[TTS] Baked lookup missed, falling back to live Google TTS');

      const cleanText = text.replace(/_/g, ' ').trim();
      if (!cleanText) {
        return null;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);

      let response: Response;

      try {
        response = await supabase.functions.invoke('google-tts-proxy', {
          body: {
            text: cleanText,
            voice: {
              languageCode: 'en-US',
              name: 'en-US-Studio-Q',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 0.92,
            },
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }).then(async ({ data, error }) => {
          if (error) {
            throw error;
          }

          return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (__DEV__) {
          console.error('[TTS] Edge Function request failed');
        }
        return null;
      }

      const result = await response.json() as GoogleTTSResponse;
      const audioContent = result.audioContent;

      if (!audioContent) {
        return null;
      }

      if (Platform.OS === 'web') {
        const dataUri = `data:audio/mp3;base64,${audioContent}`;
        setCachedAudio(cacheKey, dataUri);
        return dataUri;
      }

      const cacheDirectory = Paths.cache;
      if (!cacheDirectory?.uri) {
        if (__DEV__) console.warn('FileSystem cache directory unavailable for TTS');
        return null;
      }

      const safeCacheKey = sanitizeCacheKey(cacheKey);
      const file = new File(cacheDirectory, `tts_${safeCacheKey}.mp3`);
      file.write(audioContent, {
        encoding: 'base64',
      });

      setCachedAudio(cacheKey, file.uri);
      void pruneTtsCacheDir();
      return file.uri;
    } catch {
      if (__DEV__) console.error('[TTS] Service request failed');
      return null;
    } finally {
      delete pendingAudioRequests[cacheKey];
    }
  })();

  pendingAudioRequests[cacheKey] = request;
  return request;
}
