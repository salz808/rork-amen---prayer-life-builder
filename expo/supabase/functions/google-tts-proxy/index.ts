import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { requireUser } from '../_shared/supabase.ts';

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
const MAX_INPUT_LENGTH = 2000;
const MAX_REQUESTS_PER_MINUTE = 12;
const ALLOWED_VOICES = new Set(['en-US-Studio-Q', 'en-US-Studio-O', 'en-US-Neural2-F', 'en-US-Neural2-J']);
const requestWindowByUser = new Map<string, number[]>();

function requireApiKey(): string {
  const apiKey = Deno.env.get('GOOGLE_TTS_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GOOGLE_TTS_API_KEY secret');
  }

  return apiKey;
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const existing = requestWindowByUser.get(userId) ?? [];
  const recent = existing.filter((timestamp) => timestamp >= windowStart);

  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    requestWindowByUser.set(userId, recent);
    return true;
  }

  recent.push(now);
  requestWindowByUser.set(userId, recent);
  return false;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405);
  }

  try {
    const { user } = await requireUser(request);
    if (isRateLimited(user.id)) {
      return errorResponse(request, 'Too many text-to-speech requests. Please try again in a minute.', 429);
    }

    const body = (await request.json()) as GoogleTTSRequest;
    const text = body.text?.trim() ?? '';
    const ssml = body.ssml?.trim() ?? '';

    if (!text && !ssml) {
      return errorResponse(request, 'Either text or ssml is required', 400);
    }

    const source = ssml || text;
    if (source.length > MAX_INPUT_LENGTH) {
      return errorResponse(request, `Text-to-speech input must be ${MAX_INPUT_LENGTH} characters or fewer`, 400);
    }

    const voiceName = body.voice?.name ?? 'en-US-Studio-Q';
    if (!ALLOWED_VOICES.has(voiceName)) {
      return errorResponse(request, 'Selected voice is not allowed', 400);
    }

    const payload = {
      input: ssml ? { ssml } : { text },
      voice: {
        languageCode: body.voice?.languageCode ?? 'en-US',
        name: voiceName,
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
      await response.text();
      console.error('[google-tts-proxy] upstream request failed');
      return errorResponse(request, 'Google TTS request failed', response.status);
    }

    const result = (await response.json()) as GoogleTTSResponse;
    if (!result.audioContent) {
      return errorResponse(request, 'Google TTS returned no audio', 502);
    }

    return json(request, {
      audioContent: result.audioContent,
      mimeType: payload.audioConfig.audioEncoding === 'OGG_OPUS' ? 'audio/ogg' : 'audio/mpeg',
      encoding: payload.audioConfig.audioEncoding,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const isAuthError = message === 'Missing bearer token' || message === 'Unauthorized';
    const isRateLimitError = message.includes('Too many text-to-speech requests');

    console.error('[google-tts-proxy] request failed');
    return errorResponse(
      request,
      isAuthError
        ? message
        : isRateLimitError
          ? 'Too many text-to-speech requests. Please try again in a minute.'
          : 'Unable to generate audio right now',
      isAuthError ? 401 : isRateLimitError ? 429 : 500
    );
  }
});
