import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const GOOGLE_TTS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_API_KEY;
const API_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;
const TTS_REQUEST_TIMEOUT_MS = 12000;

type GoogleTTSResponse = {
  audioContent?: string;
};

const audioCache: Record<string, string> = {};
const pendingAudioRequests: Partial<Record<string, Promise<string | null>>> = {};

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function getGoogleTTSAudio(text: string, cacheKey: string): Promise<string | null> {
  if (!GOOGLE_TTS_API_KEY) {
    if (__DEV__) console.warn('GOOGLE_TTS_API_KEY is missing');
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
        response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: { text: cleanText },
            voice: {
              languageCode: 'en-US',
              name: 'en-US-Studio-Q',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 0.92,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (__DEV__) {
          const err = await response.text();
          console.error('TTS API Error:', err);
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
    } catch (error) {
      if (__DEV__) console.error('TTS Service Error:', error);
      return null;
    } finally {
      delete pendingAudioRequests[cacheKey];
    }
  })();

  pendingAudioRequests[cacheKey] = request;
  return request;
}
