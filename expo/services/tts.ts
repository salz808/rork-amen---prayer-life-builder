import * as FileSystem from 'expo-file-system';

const GOOGLE_TTS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_API_KEY;
const API_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;
const TTS_REQUEST_TIMEOUT_MS = 12000;

type GoogleTTSResponse = {
  audioContent?: string;
};

const audioCache: Record<string, string> = {};

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function getGoogleTTSAudio(text: string, cacheKey: string): Promise<string | null> {
  try {
    if (!GOOGLE_TTS_API_KEY) {
      if (__DEV__) console.warn('GOOGLE_TTS_API_KEY is missing');
      return null;
    }

    if (audioCache[cacheKey]) {
      return audioCache[cacheKey];
    }

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

    if (!FileSystem?.Paths?.cache?.uri || !FileSystem?.File) {
      if (__DEV__) console.warn('FileSystem API not available for TTS');
      return null;
    }

    const safeCacheKey = sanitizeCacheKey(cacheKey);
    const filename = `${FileSystem.Paths.cache.uri}tts_${safeCacheKey}.mp3`;
    new FileSystem.File(filename).write(audioContent, {
      encoding: 'base64',
    });

    audioCache[cacheKey] = filename;
    return filename;
  } catch (error) {
    if (__DEV__) console.error('TTS Service Error:', error);
    return null;
  }
}
