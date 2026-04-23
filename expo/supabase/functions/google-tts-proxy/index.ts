import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json } from '../_shared/http.ts';

type GoogleTTSRequest = {
  text?: string;
  ssml?: string;
  voice?: {
    languageCode?: string;
    name?: string;
    ssmlGender?: 'SSML_VOICE_GENDER_UNSPECIFIED' | 'MALE' | 'FEMALE' | 'NEUTRAL';
  };
  audioConfig?: {
    audioEncoding?: 'MP3' | 'LINEAR16' | 'OGG_OPUS' | 'MULAW' | 'ALAW';
    speakingRate?: number;
    pitch?: number;
    volumeGainDb?: number;
    sampleRateHertz?: number;
  };
};

type GoogleTTSResponse = {
  audioContent?: string;
};

const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

function requireApiKey(): string {
  const apiKey = Deno.env.get('GOOGLE_TTS_API_KEY') ?? Deno.env.get('EXPO_PUBLIC_GOOGLE_TTS_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GOOGLE_TTS_API_KEY secret');
  }

  return apiKey;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = (await request.json()) as GoogleTTSRequest;
    const text = body.text?.trim() ?? '';
    const ssml = body.ssml?.trim() ?? '';

    if (!text && !ssml) {
      return errorResponse('Either text or ssml is required', 400);
    }

    const payload = {
      input: ssml ? { ssml } : { text },
      voice: {
        languageCode: body.voice?.languageCode ?? 'en-US',
        name: body.voice?.name ?? 'en-US-Studio-Q',
        ...(body.voice?.ssmlGender ? { ssmlGender: body.voice.ssmlGender } : {}),
      },
      audioConfig: {
        audioEncoding: body.audioConfig?.audioEncoding ?? 'MP3',
        speakingRate: body.audioConfig?.speakingRate ?? 0.92,
        ...(typeof body.audioConfig?.pitch === 'number' ? { pitch: body.audioConfig.pitch } : {}),
        ...(typeof body.audioConfig?.volumeGainDb === 'number' ? { volumeGainDb: body.audioConfig.volumeGainDb } : {}),
        ...(typeof body.audioConfig?.sampleRateHertz === 'number' ? { sampleRateHertz: body.audioConfig.sampleRateHertz } : {}),
      },
    };

    const response = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${requireApiKey()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[google-tts-proxy] Google TTS failed', errorText);
      return errorResponse('Google TTS request failed', response.status, errorText);
    }

    const result = (await response.json()) as GoogleTTSResponse;
    if (!result.audioContent) {
      return errorResponse('Google TTS returned no audio', 502);
    }

    return json({
      audioContent: result.audioContent,
      mimeType: payload.audioConfig.audioEncoding === 'OGG_OPUS' ? 'audio/ogg' : 'audio/mpeg',
      encoding: payload.audioConfig.audioEncoding,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[google-tts-proxy] Unexpected error', message);
    return errorResponse(message, 500);
  }
});
