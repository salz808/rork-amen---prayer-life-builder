/**
 * Google TTS proxy — canonical audio config + cache key (Tier 1
 * ship-blocker fix: TTS proxy cache poisoning, 2026-11-16).
 *
 * THE POISONING: the proxy's cache key was
 * sha256(`${text}|${voiceName}|${speakingRate}`), while pitch,
 * volumeGainDb and sampleRateHertz were client-controlled, validated
 * only by clamping (pitch ±20, volume -96..16, sampleRate 8000–48000)
 * and passed straight through to Google. So two requests for the same
 * text/voice/rate with different pitch/volume/sampleRate hit the SAME
 * cache row but synthesized DIFFERENT audio — whichever variant was
 * cached first was served to every later caller, and a caller could
 * deliberately seed a row with distorted audio (e.g. pitch +20) that
 * the legitimate client then received. speakingRate was likewise a
 * free float 0.25–4.0, so the same text could be cached at an
 * arbitrary rate and served back as the session rate.
 *
 * THE FIX — canonicalisation, derived from the fixed-text gate, not
 * from the client:
 *   1. The fixed-text gate already proves the text is a baked
 *      narration line, at bake speed 92 (session) or 75 (Selah).
 *      matchBakedSpeed() captures WHICH speed matched.
 *   2. canonicalAudioConfig() derives the one allowed config from
 *      that speed: speakingRate = matchedSpeed / 100 (0.92 or 0.75
 *      only), pitch = 0, volumeGainDb = 0, sampleRateHertz = 24000.
 *      The proxy sends ONLY this config to Google.
 *   3. validateClientAudioConfig() fails closed (400) on any
 *      client-supplied pitch/volumeGainDb/sampleRateHertz that is not
 *      the canonical value, or any speakingRate outside {0.75, 0.92}.
 *      This is safe: the only legitimate caller
 *      (expo/services/tts.ts) sends speakingRate 0.92 and no
 *      pitch/volume/sampleRate at all — verified 2026-11-16. A
 *      client value therefore never reaches Google or the cache key.
 *   4. The cache key is sha256 over text + voice + the full canonical
 *      config (`${text}|${voice}|${rate}|${pitch}|${volume}|${rateHz}`).
 *      Config is canonical by construction, so the key cannot
 *      diverge between callers; the fields stay in the key anyway so
 *      a future canonical-config change cannot silently collide with
 *      pre-change rows.
 *
 * Dependency-free by design (WebCrypto globals only, no Deno or npm
 * imports): the pure parts are unit-testable under Node (see
 * expo/__tests__/ttsProxyCacheKey.test.ts). Callers pass values in —
 * this module never reads Deno.env itself.
 */

export const NARRATION_VOICE_ID = 'avocado_v2:MAI_03';
export const BAKED_SPEEDS = [92, 75] as const;
export type BakedSpeed = (typeof BAKED_SPEEDS)[number];

export const CANONICAL_PITCH = 0;
export const CANONICAL_VOLUME_GAIN_DB = 0;
export const CANONICAL_SAMPLE_RATE_HERTZ = 24000;

export type CanonicalAudioConfig = {
  audioEncoding: 'MP3';
  speakingRate: 0.75 | 0.92;
  pitch: 0;
  volumeGainDb: 0;
  sampleRateHertz: 24000;
};

/**
 * Derive the single allowed Google audioConfig from the matched bake
 * speed: 92 → 0.92 (session narration), 75 → 0.75 (Selah). Every
 * other field is fixed; nothing client-supplied survives into the
 * payload.
 */
export function canonicalAudioConfig(matchedSpeed: BakedSpeed): CanonicalAudioConfig {
  if (matchedSpeed !== 92 && matchedSpeed !== 75) {
    throw new Error(`Unknown baked speed: ${matchedSpeed}`);
  }
  return {
    audioEncoding: 'MP3',
    speakingRate: (matchedSpeed / 100) as 0.75 | 0.92,
    pitch: CANONICAL_PITCH,
    volumeGainDb: CANONICAL_VOLUME_GAIN_DB,
    sampleRateHertz: CANONICAL_SAMPLE_RATE_HERTZ,
  };
}

export type ClientAudioConfigInput = {
  speakingRate?: unknown;
  pitch?: unknown;
  volumeGainDb?: unknown;
  sampleRateHertz?: unknown;
};

/**
 * Fail-closed validation of client-supplied audioConfig values.
 * Returns an error string for the first non-canonical value, or null
 * when everything supplied is canonical (or absent — the canonical
 * config comes from the matched bake speed, never from the client, so
 * absence is fine). A non-null return must become a 400; the
 * offending value must never reach Google or the cache key.
 */
export function validateClientAudioConfig(
  audioConfig: ClientAudioConfigInput | undefined | null,
): string | null {
  if (audioConfig === undefined || audioConfig === null) return null;
  const { speakingRate, pitch, volumeGainDb, sampleRateHertz } = audioConfig;
  if (speakingRate !== undefined && speakingRate !== 0.75 && speakingRate !== 0.92) {
    return 'speakingRate must be 0.75 or 0.92';
  }
  if (pitch !== undefined && pitch !== 0) {
    return 'pitch must be 0';
  }
  if (volumeGainDb !== undefined && volumeGainDb !== 0) {
    return 'volumeGainDb must be 0';
  }
  if (sampleRateHertz !== undefined && sampleRateHertz !== 24000) {
    return 'sampleRateHertz must be 24000';
  }
  return null;
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Bake-hash input — exactly what the bake pipeline hashes
 * (expo/services/narration.ts narrationTextHash). */
export function bakeHashInput(text: string, speed: BakedSpeed): string {
  return `${NARRATION_VOICE_ID}|${speed}|${text}`;
}

/**
 * Fixed-text gate, speed-capturing form: returns the bake speed whose
 * hash is in the baked set (92 checked first, then 75 — same order as
 * before, so a text baked at both speeds still resolves to session
 * speed), or null when the text is not baked at either speed.
 */
export async function matchBakedSpeed(
  text: string,
  bakedHashes: ReadonlySet<string>,
): Promise<BakedSpeed | null> {
  for (const speed of BAKED_SPEEDS) {
    const bakeHash = await sha256Hex(bakeHashInput(text, speed));
    if (bakedHashes.has(bakeHash)) {
      return speed;
    }
  }
  return null;
}

/**
 * Pre-hash cache-key input. Every canonical config field is in the
 * key, so a future canonical-config change cannot silently collide
 * with pre-change rows (and the key visibly documents what it covers).
 */
export function ttsCacheKeyInput(
  text: string,
  voiceName: string,
  config: CanonicalAudioConfig,
): string {
  return `${text}|${voiceName}|${config.speakingRate}|${config.pitch}|${config.volumeGainDb}|${config.sampleRateHertz}`;
}

/** Cache key: sha256 over text + voice + the full canonical config. */
export async function ttsCacheKey(
  text: string,
  voiceName: string,
  config: CanonicalAudioConfig,
): Promise<string> {
  return sha256Hex(ttsCacheKeyInput(text, voiceName, config));
}
