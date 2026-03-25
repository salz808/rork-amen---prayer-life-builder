import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const GOOGLE_TTS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_API_KEY;
const API_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;

// In-memory cache for the current session as requested
const audioCache: Record<string, string> = {};

export async function getGoogleTTSAudio(text: string, cacheKey: string): Promise<string | null> {
  try {
    if (!GOOGLE_TTS_API_KEY) {
      if (__DEV__) console.warn('GOOGLE_TTS_API_KEY is missing');
      return null;
    }

    // Return from cache if available
    if (audioCache[cacheKey]) {
      return audioCache[cacheKey];
    }

    // Clean text: remove underscores as requested previously
    const cleanText = text.replace(/_/g, ' ');

    const response = await fetch(API_URL, {
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
    });

    if (!response.ok) {
      if (__DEV__) {
        const err = await response.json();
        console.error('TTS API Error:', err);
      }
      return null;
    }

    const result = await response.json();
    const audioContent = result.audioContent;

    if (!audioContent) return null;

    if (!FileSystem?.Paths?.cache?.uri || !FileSystem?.File) {
      if (__DEV__) console.warn('FileSystem API not available for TTS');
      return null;
    }
    
    const filename = `${FileSystem.Paths.cache.uri}tts_${cacheKey}.mp3`;
    await new FileSystem.File(filename).write(audioContent, {
      encoding: 'base64',
    });

    audioCache[cacheKey] = filename;
    return filename;
  } catch (error) {
    if (__DEV__) console.error('TTS Service Error:', error);
    return null;
  }
}
