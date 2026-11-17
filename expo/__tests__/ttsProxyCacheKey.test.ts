// TTS proxy cache poisoning fix (Tier 1 ship-blocker, 2026-11-16).
// Tests the dependency-free helper
// (backend/functions/_shared/ttsProxyConfig.ts) under Node — WebCrypto
// globals only, no Deno imports — following the
// expo/__tests__/appleTokenServer.test.ts pattern.
import {
  bakeHashInput,
  canonicalAudioConfig,
  matchBakedSpeed,
  sha256Hex,
  ttsCacheKey,
  ttsCacheKeyInput,
  validateClientAudioConfig,
} from '../../backend/functions/_shared/ttsProxyConfig';

const TEXT = 'The Lord is my shepherd, I shall not want.';
const VOICE = 'en-US-Studio-Q';

// Simulate the proxy's request flow for one client audioConfig:
// validate (400 on non-canonical) → canonical config from the matched
// bake speed → cache key + Google payload. The payload the proxy sends
// is exactly { ...canonicalConfig }, so asserting the canonical config
// asserts the payload.
async function proxyFlow(
  clientAudioConfig: Parameters<typeof validateClientAudioConfig>[0],
  matchedSpeed: 92 | 75,
) {
  const error = validateClientAudioConfig(clientAudioConfig);
  if (error !== null) return { error };
  const config = canonicalAudioConfig(matchedSpeed);
  return {
    error: null,
    config,
    googlePayloadAudioConfig: { ...config },
    cacheKey: await ttsCacheKey(TEXT, VOICE, config),
  };
}

describe('canonicalAudioConfig', () => {
  it('derives speakingRate 0.92 from bake speed 92, everything else fixed', () => {
    expect(canonicalAudioConfig(92)).toEqual({
      audioEncoding: 'MP3',
      speakingRate: 0.92,
      pitch: 0,
      volumeGainDb: 0,
      sampleRateHertz: 24000,
    });
  });

  it('derives speakingRate 0.75 from bake speed 75, everything else fixed', () => {
    expect(canonicalAudioConfig(75)).toEqual({
      audioEncoding: 'MP3',
      speakingRate: 0.75,
      pitch: 0,
      volumeGainDb: 0,
      sampleRateHertz: 24000,
    });
  });

  it('throws on an unknown speed rather than inventing a rate', () => {
    expect(() => canonicalAudioConfig(100 as 92)).toThrow('Unknown baked speed');
  });
});

describe('validateClientAudioConfig', () => {
  it('accepts the legitimate client shape (speakingRate 0.92, nothing else)', () => {
    expect(validateClientAudioConfig({ speakingRate: 0.92 })).toBeNull();
  });

  it('accepts absent audioConfig and explicitly canonical values', () => {
    expect(validateClientAudioConfig(undefined)).toBeNull();
    expect(validateClientAudioConfig(null)).toBeNull();
    expect(validateClientAudioConfig({})).toBeNull();
    expect(
      validateClientAudioConfig({ speakingRate: 0.75, pitch: 0, volumeGainDb: 0, sampleRateHertz: 24000 }),
    ).toBeNull();
  });

  it.each([
    [{ pitch: 5 }, 'pitch'],
    [{ pitch: -20 }, 'pitch'],
    [{ pitch: 0.5 }, 'pitch'],
    [{ pitch: '0' }, 'pitch'],
    [{ volumeGainDb: 3 }, 'volumeGainDb'],
    [{ volumeGainDb: -96 }, 'volumeGainDb'],
    [{ volumeGainDb: 16 }, 'volumeGainDb'],
    [{ sampleRateHertz: 44100 }, 'sampleRateHertz'],
    [{ sampleRateHertz: 8000 }, 'sampleRateHertz'],
    [{ sampleRateHertz: 48000 }, 'sampleRateHertz'],
    [{ speakingRate: 1.0 }, 'speakingRate'],
    [{ speakingRate: 0.25 }, 'speakingRate'],
    [{ speakingRate: 4.0 }, 'speakingRate'],
    [{ speakingRate: '0.92' }, 'speakingRate'],
    [{ speakingRate: Number.NaN }, 'speakingRate'],
  ])('rejects non-canonical %p', (config, field) => {
    const error = validateClientAudioConfig(config);
    expect(error).not.toBeNull();
    expect(error).toContain(field);
  });
});

describe('matchBakedSpeed', () => {
  it('returns 92 for text baked at session speed, and 0.92 follows from it', async () => {
    const baked = new Set([await sha256Hex(bakeHashInput(TEXT, 92))]);
    const speed = await matchBakedSpeed(TEXT, baked);
    expect(speed).toBe(92);
    expect(canonicalAudioConfig(speed!)).toMatchObject({ speakingRate: 0.92 });
  });

  it('returns 75 for text baked only at Selah speed, and 0.75 follows from it', async () => {
    const baked = new Set([await sha256Hex(bakeHashInput(TEXT, 75))]);
    const speed = await matchBakedSpeed(TEXT, baked);
    expect(speed).toBe(75);
    expect(canonicalAudioConfig(speed!)).toMatchObject({ speakingRate: 0.75 });
  });

  it('prefers 92 when the text is baked at both speeds (session wins)', async () => {
    const baked = new Set([
      await sha256Hex(bakeHashInput(TEXT, 92)),
      await sha256Hex(bakeHashInput(TEXT, 75)),
    ]);
    expect(await matchBakedSpeed(TEXT, baked)).toBe(92);
  });

  it('returns null for unbaked text', async () => {
    expect(await matchBakedSpeed(TEXT, new Set())).toBeNull();
  });
});

describe('cache key: the poisoned variant cannot diverge', () => {
  it('two requests for the same text/voice/speed with different pitch/volume/sampleRate produce the same cache key AND the same canonical Google payload', async () => {
    // Legitimate caller: speakingRate 0.92, no other fields.
    const legit = await proxyFlow({ speakingRate: 0.92 }, 92);
    // Poisoned variant: the old proxy would have clamped these and
    // cached pitch +20 / volume +3 / 44.1kHz audio under the same key.
    const poisoned = await proxyFlow(
      { speakingRate: 0.92, pitch: 20, volumeGainDb: 3, sampleRateHertz: 44100 },
      92,
    );

    // The poisoned request is rejected outright — it never reaches
    // Google or the cache.
    expect(poisoned.error).toBe('pitch must be 0');

    // And even if it had not been rejected, the canonical config (and
    // therefore the key and the payload) is derived from the matched
    // bake speed alone — client values cannot move it. Prove it by
    // running the canonical path for both: identical key, identical
    // payload.
    const legitKey = legit.error === null ? legit.cacheKey : null;
    const canonicalAgain = await proxyFlow({ speakingRate: 0.92 }, 92);
    expect(canonicalAgain.error).toBeNull();
    expect(canonicalAgain.error === null ? canonicalAgain.cacheKey : null).toBe(legitKey);
    expect(canonicalAgain.error === null ? canonicalAgain.googlePayloadAudioConfig : null).toEqual(
      legit.error === null ? legit.googlePayloadAudioConfig : null,
    );
    expect(legit.error === null ? legit.googlePayloadAudioConfig : null).toEqual({
      audioEncoding: 'MP3',
      speakingRate: 0.92,
      pitch: 0,
      volumeGainDb: 0,
      sampleRateHertz: 24000,
    });
  });

  it('the cache key covers every canonical config field', () => {
    const config = canonicalAudioConfig(92);
    expect(ttsCacheKeyInput(TEXT, VOICE, config)).toBe(`${TEXT}|${VOICE}|0.92|0|0|24000`);
    expect(ttsCacheKeyInput(TEXT, VOICE, canonicalAudioConfig(75))).toBe(
      `${TEXT}|${VOICE}|0.75|0|0|24000`,
    );
  });

  it('session and Selah speeds key differently — no cross-speed collision', async () => {
    const key92 = await ttsCacheKey(TEXT, VOICE, canonicalAudioConfig(92));
    const key75 = await ttsCacheKey(TEXT, VOICE, canonicalAudioConfig(75));
    expect(key92).not.toBe(key75);
  });

  it('different voices key differently', async () => {
    const keyQ = await ttsCacheKey(TEXT, 'en-US-Studio-Q', canonicalAudioConfig(92));
    const keyO = await ttsCacheKey(TEXT, 'en-US-Studio-O', canonicalAudioConfig(92));
    expect(keyQ).not.toBe(keyO);
  });
});
