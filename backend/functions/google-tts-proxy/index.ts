import { handleCors } from '../_shared/cors.ts';
import { errorResponse, isAuthErrorMessage, json, readCappedJson } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

type GoogleTTSRequest = {
  text?: string;
  voice?: {
    languageCode?: string;
    name?: string;
    ssmlGender?: 'SSML_VOICE_GENDER_UNSPECIFIED' | 'MALE' | 'FEMALE' | 'NEUTRAL';
  };
  audioConfig?: {
    audioEncoding?: string;
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
const MAX_BODY_BYTES = 64 * 1024;
// Audit round 4, fix lane 3 (TTS-1): DB-backed caps (migration
// 20261025000014, check_tts_rate_limit RPC) — 12/min as before, plus a
// daily cap. The per-isolate Map is gone: isolates never shared it, so
// the old "cap" was 12/min PER ISOLATE. 300/day is generous for the
// legitimate path (journey narration is mostly pre-baked audio; live TTS
// only covers non-baked text) while bounding the bill per account.
const MAX_REQUESTS_PER_MINUTE = 12;
const MAX_REQUESTS_PER_DAY = 300;
const ALLOWED_VOICES = new Set(['en-US-Studio-Q', 'en-US-Studio-O', 'en-US-Neural2-F', 'en-US-Neural2-J']);
const ALLOWED_GENDERS = new Set(['SSML_VOICE_GENDER_UNSPECIFIED', 'MALE', 'FEMALE', 'NEUTRAL']);

function requireApiKey(): string {
  const apiKey = Deno.env.get('GOOGLE_TTS_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GOOGLE_TTS_API_KEY secret');
  }

  return apiKey;
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
    // Size cap on the declared length before auth/body work.
    const declaredLength = request.headers.get('content-length');
    if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
      return errorResponse(request, 'Request body too large', 413);
    }

    // Audit round 4, fix lane 3 (E-L3): any requireUser failure whose
    // message names an auth problem is a 401 (the old exact-string
    // check turned an expired JWT into a generic 500, so the client
    // showed a retry prompt instead of a re-login prompt). The gateway
    // (verify_jwt = true) usually answers first; this is correctness
    // for any gateway-config change.
    let user: { id: string; is_anonymous?: boolean };
    try {
      ({ user } = await requireUser(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (isAuthErrorMessage(message)) {
        return errorResponse(request, 'Authentication required', 401);
      }
      throw error;
    }

    // Audit round 4, fix lane 3 (TTS-1): anonymous callers are rejected.
    // Anonymous sessions are minted on demand (one tap), so accepting
    // them made the proxy effectively open. Voiceover is already
    // subscriber-gated in the UI, so no legitimate caller is anonymous.
    if (user.is_anonymous === true) {
      return errorResponse(request, 'Anonymous users cannot use text-to-speech', 403);
    }

    // DB-backed limiter (shared across isolates, unlike the old Map).
    // The check runs BEFORE body validation, as before, so invalid
    // requests still consume quota rather than offering a free probe
    // path. An RPC failure fails closed (500, no Google call).
    const admin = createAdminClient();
    const { data: allowed, error: limitError } = await admin.rpc('check_tts_rate_limit', {
      p_user_id: user.id,
      p_minute_cap: MAX_REQUESTS_PER_MINUTE,
      p_daily_cap: MAX_REQUESTS_PER_DAY,
    });
    if (limitError) throw limitError;
    if (allowed !== true) {
      return errorResponse(request, 'Too many text-to-speech requests. Please try again later.', 429);
    }

    let body: GoogleTTSRequest;
    try {
      const parsed = await readCappedJson(request, MAX_BODY_BYTES);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return errorResponse(request, 'Request body must be a JSON object', 400);
      }
      body = parsed as GoogleTTSRequest;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Request body too large') {
        return errorResponse(request, 'Request body too large', 413);
      }
      return errorResponse(request, 'Malformed request JSON', 400);
    }

    // Audit round 4, fix lane 3 (E-M6): runtime validation — TypeScript
    // types are erased at runtime, so every field is checked here.
    // SSML is REJECTED outright: the only client caller sends plain text
    // (expo/services/tts.ts), and raw SSML expands the abuse surface
    // (e.g. long breaks inflating generated audio) for no product use.
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const ssml = (body as { ssml?: unknown }).ssml;
    if (typeof ssml === 'string' && ssml.trim().length > 0) {
      return errorResponse(request, 'SSML input is not accepted', 400);
    }
    if (!text) {
      return errorResponse(request, 'Text is required', 400);
    }
    if (text.length > MAX_INPUT_LENGTH) {
      return errorResponse(request, `Text-to-speech input must be ${MAX_INPUT_LENGTH} characters or fewer`, 400);
    }

    const voiceName = body.voice?.name ?? 'en-US-Studio-Q';
    if (!ALLOWED_VOICES.has(voiceName)) {
      return errorResponse(request, 'Selected voice is not allowed', 400);
    }
    const languageCode = body.voice?.languageCode ?? 'en-US';
    if (languageCode !== 'en-US') {
      return errorResponse(request, 'Only en-US is supported', 400);
    }
    const ssmlGender = body.voice?.ssmlGender;
    if (ssmlGender !== undefined && !ALLOWED_GENDERS.has(ssmlGender)) {
      return errorResponse(request, 'Invalid voice gender', 400);
    }
    // The client sends only MP3 (expo/services/tts.ts); no other
    // encoding is accepted, so the response mime type is always fixed.
    const audioEncoding = body.audioConfig?.audioEncoding ?? 'MP3';
    if (audioEncoding !== 'MP3') {
      return errorResponse(request, 'Only MP3 audio encoding is supported', 400);
    }
    const speakingRate = body.audioConfig?.speakingRate ?? 0.92;
    if (typeof speakingRate !== 'number' || !Number.isFinite(speakingRate) || speakingRate < 0.25 || speakingRate > 4.0) {
      return errorResponse(request, 'speakingRate must be between 0.25 and 4.0', 400);
    }
    const pitch = body.audioConfig?.pitch;
    if (pitch !== undefined && (typeof pitch !== 'number' || !Number.isFinite(pitch) || pitch < -20 || pitch > 20)) {
      return errorResponse(request, 'pitch must be between -20 and 20', 400);
    }
    const volumeGainDb = body.audioConfig?.volumeGainDb;
    if (volumeGainDb !== undefined && (typeof volumeGainDb !== 'number' || !Number.isFinite(volumeGainDb) || volumeGainDb < -96 || volumeGainDb > 16)) {
      return errorResponse(request, 'volumeGainDb must be between -96 and 16', 400);
    }
    const sampleRateHertz = body.audioConfig?.sampleRateHertz;
    if (sampleRateHertz !== undefined && (typeof sampleRateHertz !== 'number' || !Number.isInteger(sampleRateHertz) || sampleRateHertz < 8000 || sampleRateHertz > 48000)) {
      return errorResponse(request, 'sampleRateHertz must be an integer between 8000 and 48000', 400);
    }

    // Audit round 4, fix lane 3 (TTS-1): server-side cache keyed by
    // text+voice+rate hash, so repeat narration never re-bills Google.
    const cacheKey = await sha256Hex(`${text}|${voiceName}|${speakingRate}`);
    const { data: cached, error: cacheError } = await admin
      .from('tts_cache')
      .select('audio_content')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cacheError) throw cacheError;
    if (cached?.audio_content) {
      return json(request, {
        audioContent: cached.audio_content as string,
        mimeType: 'audio/mpeg',
        encoding: 'MP3',
      });
    }

    const payload = {
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
        ...(ssmlGender ? { ssmlGender } : {}),
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        ...(pitch !== undefined ? { pitch } : {}),
        ...(volumeGainDb !== undefined ? { volumeGainDb } : {}),
        ...(sampleRateHertz !== undefined ? { sampleRateHertz } : {}),
      },
    };

    // Audit round 4, fix lane 3 (E-L10): the key travels as the
    // x-goog-api-key header, never as a URL query parameter (query
    // strings land in edge/proxy/Google access logs). The key value is
    // never logged anywhere in this function.
    const response = await fetch(GOOGLE_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': requireApiKey(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Audit round 4, fix lane 3 (E-M6): upstream failures map to a
      // generic 502 regardless of Google's status. Passing a 401
      // through told an attacker the key was invalid/revoked; a 429
      // told them the quota state. The upstream body is discarded.
      await response.text().catch(() => undefined);
      console.error('[google-tts-proxy] upstream request failed');
      return errorResponse(request, 'Google TTS request failed', 502);
    }

    let result: GoogleTTSResponse;
    try {
      result = (await response.json()) as GoogleTTSResponse;
    } catch {
      return errorResponse(request, 'Google TTS returned an invalid response', 502);
    }
    if (!result.audioContent) {
      return errorResponse(request, 'Google TTS returned no audio', 502);
    }

    // Best-effort cache fill: a cache failure must not fail an audio
    // response the user already paid for.
    try {
      await admin.from('tts_cache').insert({ cache_key: cacheKey, audio_content: result.audioContent, encoding: 'MP3' });
    } catch {
      console.error('[google-tts-proxy] tts_cache insert failed');
    }

    return json(request, {
      audioContent: result.audioContent,
      mimeType: 'audio/mpeg',
      encoding: 'MP3',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const isRateLimitError = message.includes('Too many text-to-speech requests');

    console.error('[google-tts-proxy] request failed');
    return errorResponse(
      request,
      isAuthErrorMessage(message)
        ? 'Authentication required'
        : isRateLimitError
          ? 'Too many text-to-speech requests. Please try again later.'
          : 'Unable to generate audio right now',
      isAuthErrorMessage(message) ? 401 : isRateLimitError ? 429 : 500
    );
  }
});
