import { handleCors } from '../_shared/cors.ts';
import { errorResponse, isAuthErrorMessage, json, readCappedJson } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';
import {
  canonicalAudioConfig,
  matchBakedSpeed,
  ttsCacheKey,
  validateClientAudioConfig,
} from '../_shared/ttsProxyConfig.ts';
import { BAKED_TEXT_HASHES } from './narrationHashes.ts';

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
//
// P1-1 (2026-11-16): the 300/day per-account cap above is CONFIRMED
// present (this file + the check_tts_rate_limit RPC); it is not new.
// What P1-1 adds on top of it:
//   (a) Entitlement gate — the proxy reads tier_level server-side from
//       the journey_stats webhook mirror (is_subscriber AND
//       tier_level >= 2, i.e. the VOICEOVER bar in
//       expo/services/entitlements.ts: tier >= UserTier.MISSIONS).
//       The UI gate is client-side and therefore forgeable; this is
//       the server-side enforcement. A missing/stale mirror row reads
//       as Free (fail closed, same posture as migration
//       20261025000012 for circle caps).
//   (b) Fixed-text gate — only text whose bake hash
//       sha256(`avocado_v2:MAI_03|<speed>|<text>`) at speed 92 or 75
//       is in BAKED_TEXT_HASHES (generated from
//       expo/services/narrationIndex.ts) is accepted. Any other text
//       is rejected BEFORE the cache lookup (the server cache could
//       otherwise still serve pre-gate arbitrary text) and before
//       any Google call. CONSEQUENCE, stated plainly: the client
//       (expo/services/tts.ts) only calls this proxy for text that
//       MISSED the baked lookup, so post-gate the proxy synthesizes
//       almost nothing — unbaked text (a content edit not yet
//       re-baked, or any dynamic text) now gets a 403 here and the
//       client falls back to device voice (expo/app/session.tsx
//       speakMovementVoiceover fallback). That is the intended
//       trade: the proxy can no longer be used as a free arbitrary-
//       text TTS API. If that fallback is unacceptable for a given
//       text, bake it (re-run gen-index + regenerate
//       narrationHashes.ts) instead of widening this gate.
//   (c) Global daily ceiling — 10,000 cache-miss syntheses/day
//       across ALL accounts (sentinel row in the same
//       check_tts_rate_limit table, zero UUID). The number is a
//       judgment call, not a measured limit: per-account 300/day
//       bounds one account, the global ceiling bounds the total
//       bill. Tune it (MAX_GLOBAL_REQUESTS_PER_DAY) if real volume
//       shows it too tight or too loose. It runs AFTER the cache
//       lookup, so repeat (cached) narration never consumes it.
//
// TTS cache poisoning fix (Tier 1 ship-blocker, 2026-11-16 — see
// backend/functions/_shared/ttsProxyConfig.ts, which owns the logic
// and is unit-tested in expo/__tests__/ttsProxyCacheKey.test.ts):
//   (d) Canonical audio config. The old cache key was
//       sha256(`${text}|${voiceName}|${speakingRate}`) while pitch,
//       volumeGainDb and sampleRateHertz were client-controlled
//       (clamped, not fixed) and passed through to Google — so the
//       same text/voice/rate with different pitch/volume/sampleRate
//       shared one cache row but synthesized different audio, and a
//       caller could seed a row with distorted audio the legitimate
//       client then received. speakingRate was likewise a free float
//       0.25–4.0. Now: the fixed-text gate captures WHICH bake speed
//       matched (92 session / 75 Selah) and the canonical config is
//       derived from it — speakingRate = matchedSpeed / 100, pitch 0,
//       volumeGainDb 0, sampleRateHertz 24000 — and ONLY that config
//       reaches Google. Any client-supplied pitch/volumeGainDb/
//       sampleRateHertz other than the canonical value, or any
//       speakingRate outside {0.75, 0.92}, is a 400 (fail closed).
//       Safe because the only legitimate caller
//       (expo/services/tts.ts) sends speakingRate 0.92 and no
//       pitch/volume/sampleRate at all. The cache key is sha256 over
//       text + voice + the full canonical config, so no client value
//       can ever reach the key or Google.
//       CONSEQUENCE: pre-fix tts_cache rows were keyed
//       `${text}|${voice}|${rate}` and may hold poisoned audio —
//       they must be purged (staging first, then live) with
//       goals/triad-prayer-app-app-store-launch-readiness/hidden_files/
//       tts-cache-purge-2026-11-16.sql before this fix ships, or a
//       poisoned row could still be served. The new key format never
//       collides with the old one (extra fields in the hash input),
//       so purging is a clean cut, not a migration.
const MAX_REQUESTS_PER_MINUTE = 12;
const MAX_REQUESTS_PER_DAY = 300;
const MAX_GLOBAL_REQUESTS_PER_DAY = 10000;
const GLOBAL_TTS_MINUTE_CAP = 100000;
const GLOBAL_TTS_USER_ID = '00000000-0000-0000-0000-000000000000';
// NARRATION_VOICE_ID / BAKED_SPEEDS live in ../_shared/ttsProxyConfig.ts
// (imported above) — the canonical-config module owns them so the gate,
// the canonical config and the cache key can never drift apart.
// Voiceover bar: tier >= UserTier.MISSIONS (2). Legacy 'support' (1)
// does not get voiceover (expo/services/entitlements.ts VOICEOVER).
const MIN_TTS_TIER_LEVEL = 2;
const ALLOWED_VOICES = new Set(['en-US-Studio-Q', 'en-US-Studio-O', 'en-US-Neural2-F', 'en-US-Neural2-J']);
const ALLOWED_GENDERS = new Set(['SSML_VOICE_GENDER_UNSPECIFIED', 'MALE', 'FEMALE', 'NEUTRAL']);

function requireApiKey(): string {
  const apiKey = Deno.env.get('GOOGLE_TTS_API_KEY');
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

    // P1-1 (a): server-side entitlement gate. Voiceover is
    // subscriber-gated in the UI, but the UI check is client-side;
    // the mirror (journey_stats, written only by the RevenueCat
    // webhook) is the server-side source of truth. Partner bar:
    // is_subscriber AND tier_level >= 2 (VOICEOVER in
    // expo/services/entitlements.ts). No row / stale mirror reads as
    // Free (fail closed). Runs before the rate limiter so a
    // non-entitled caller never consumes quota.
    const admin = createAdminClient();
    const { data: entitlement, error: entitlementError } = await admin
      .from('journey_stats')
      .select('is_subscriber, tier_level')
      .eq('user_id', user.id)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (
      !entitlement ||
      entitlement.is_subscriber !== true ||
      typeof entitlement.tier_level !== 'number' ||
      entitlement.tier_level < MIN_TTS_TIER_LEVEL
    ) {
      return errorResponse(request, 'Text-to-speech requires an active Partner subscription', 403);
    }

    // DB-backed limiter (shared across isolates, unlike the old Map).
    // The check runs BEFORE body validation, as before, so invalid
    // requests still consume quota rather than offering a free probe
    // path. An RPC failure fails closed (500, no Google call).
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
    // TTS cache poisoning fix (2026-11-16): pitch, volumeGainDb and
    // sampleRateHertz are NO LONGER client-controlled — the canonical
    // config is derived from the matched bake speed below, and any
    // client-supplied value other than the canonical one is a 400.
    // The only legitimate caller (expo/services/tts.ts) sends
    // speakingRate 0.92 and no pitch/volume/sampleRate, so this
    // rejects nothing legitimate. The supplied speakingRate is
    // validated here but otherwise IGNORED: the rate Google gets
    // comes from the matched bake speed, never from the client.
    const audioConfigError = validateClientAudioConfig(body.audioConfig);
    if (audioConfigError !== null) {
      return errorResponse(request, audioConfigError, 400);
    }

    // P1-1 (b): fixed-text gate. Only narration text the bake
    // pipeline rendered (hash in BAKED_TEXT_HASHES, generated from
    // expo/services/narrationIndex.ts) may be synthesized. The hash
    // input is exactly what the client bakes with
    // (expo/services/narration.ts narrationTextHash):
    // `${NARRATION_VOICE_ID}|${speed}|${text}` at speed 92 (session)
    // or 75 (Selah). Checked BEFORE the cache lookup: the server
    // cache could otherwise still serve pre-gate arbitrary text.
    // Rejected text gets a 403 and the client falls back to device
    // voice — see the header comment for the trade-off.
    //
    // TTS cache poisoning fix (2026-11-16): the gate captures WHICH
    // speed matched, and the canonical audio config is derived from
    // it — the rate Google gets comes from the bake, never from the
    // client (see ../_shared/ttsProxyConfig.ts).
    const matchedSpeed = await matchBakedSpeed(text, BAKED_TEXT_HASHES);
    if (matchedSpeed === null) {
      return errorResponse(request, 'Text-to-speech is available only for the app\u2019s fixed narration text', 403);
    }
    const canonicalConfig = canonicalAudioConfig(matchedSpeed);

    // Audit round 4, fix lane 3 (TTS-1): server-side cache keyed by
    // text+voice+canonical-config hash, so repeat narration never
    // re-bills Google. TTS cache poisoning fix (2026-11-16): the key
    // covers the FULL canonical config (rate, pitch, volume,
    // sampleRate) — no client-supplied value is in the key, so two
    // callers can never diverge into different audio under one row.
    const cacheKey = await ttsCacheKey(text, voiceName, canonicalConfig);
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

    // Audit round 5, lane 4 H4: the server cache table had no TTL, no
    // row cap, and no prune job — every distinct (text, voice, rate)
    // result accumulated forever as base64 Postgres rows. Prune
    // best-effort on the miss path (the only path that grows the
    // table): rows older than 30 days die. A cached clip never goes
    // stale — same input bytes always produce the same audio — so this
    // is purely a storage bound, not a correctness expiry, and a prune
    // failure must never fail an audio response. With the 300/day/user
    // cap, 30 days of distinct texts is also the table's honest upper
    // bound. (No created_at index exists on tts_cache — a future
    // migration could add one; the miss-path delete stays cheap
    // because misses are the low-volume path.)
    try {
      const pruneCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from('tts_cache').delete().lt('created_at', pruneCutoff);
    } catch {
      console.error('[google-tts-proxy] tts_cache prune failed');
    }

    // P1-1 (c): global daily ceiling. Same atomic RPC as the
    // per-account limiter, keyed on a sentinel user id (the zero
    // UUID) so all accounts share one daily bucket. Runs AFTER the
    // cache lookup on purpose: cached (repeat) narration costs
    // nothing and must not consume the global budget — only a real
    // Google synthesis does. The sentinel minute cap is effectively
    // unbounded; the daily cap is the binding one. An RPC failure
    // fails closed (500, no Google call), like the per-account check.
    const { data: globalAllowed, error: globalLimitError } = await admin.rpc('check_tts_rate_limit', {
      p_user_id: GLOBAL_TTS_USER_ID,
      p_minute_cap: GLOBAL_TTS_MINUTE_CAP,
      p_daily_cap: MAX_GLOBAL_REQUESTS_PER_DAY,
    });
    if (globalLimitError) throw globalLimitError;
    if (globalAllowed !== true) {
      return errorResponse(request, 'Too many text-to-speech requests. Please try again later.', 429);
    }

    // TTS cache poisoning fix (2026-11-16): the payload carries ONLY
    // the canonical config derived from the matched bake speed. No
    // client-supplied pitch/volume/sampleRate/speakingRate reaches
    // Google — the request that is cached is exactly the request that
    // was synthesized, so a cache row can never hold audio different
    // from what its key promises.
    const payload = {
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
        ...(ssmlGender ? { ssmlGender } : {}),
      },
      audioConfig: { ...canonicalConfig },
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
