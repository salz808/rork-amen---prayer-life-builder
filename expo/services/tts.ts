import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const TTS_REQUEST_TIMEOUT_MS = 12000;

type GoogleTTSResponse = {
  audioContent?: string;
  mimeType?: string;
  encoding?: string;
  error?: string;
};

const audioCache: Record<string, string> = {};
const pendingAudioRequests: Partial<Record<string, Promise<string | null>>> = {};

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function getGoogleTTSAudio(text: string, cacheKey: string): Promise<string | null> {
  if (!isSupabaseConfigured) {
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
        audioCache[cacheKey] = dataUri;
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

      audioCache[cacheKey] = file.uri;
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
