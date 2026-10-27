import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import * as Speech from 'expo-speech';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { BAKED_BY_HASH, SELAH_LOOPS } from '@/services/narrationIndex';

/**
 * Baked narration (Helio) — Phase 3 wiring.
 *
 * Every fixed spoken line in the app was rendered ahead of time in the
 * Helio voice (`avocado_v2:MAI_03`); see tools/narration/INVENTORY.md.
 * A text is "baked" when sha256(`voice|speed|text`) — the exact hash the
 * bake pipeline computed — appears in the generated index. The public
 * files live in the Supabase Storage bucket `narration` under the
 * manifest's key paths (`{track}/d{NN}/{surface}/{unit}.mp3`,
 * `declarations/{id}.mp3`).
 *
 * Resolution is purely additive: a baked hit returns the Storage URL and
 * the caller plays it; a miss (dynamic text, a future edit not yet
 * re-baked, Supabase unconfigured) returns null and the caller falls
 * back to the previous live path (Google TTS or expo-speech). Nothing
 * here ever throws into a session.
 */
export const NARRATION_VOICE_ID = 'avocado_v2:MAI_03';
export const SPEED_SESSION = 92;
export const SPEED_SELAH = 75;
const NARRATION_BUCKET = 'narration';

export async function narrationTextHash(text: string, speed: number): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${NARRATION_VOICE_ID}|${speed}|${text}`,
  );
}

export function bakedPublicUrl(file: string): string | null {
  if (!isSupabaseConfigured) {
    return null;
  }
  try {
    const { data } = supabase.storage.from(NARRATION_BUCKET).getPublicUrl(file);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the exact spoken text to its baked file URL, or null when the
 * text was not baked (dynamic content → caller falls back).
 */
export async function getBakedAudioUrl(text: string, speed: number): Promise<string | null> {
  if (!text || !text.trim()) {
    return null;
  }
  try {
    const hash = await narrationTextHash(text, speed);
    const file = BAKED_BY_HASH[hash];
    if (!file) {
      // Audit round 13, H13 (mechanical only): distinguish a baked
      // MISS (this exact text was never baked) from a bucket problem
      // (hash hit, but no public URL could be constructed). The caller
      // still falls back exactly as before; this log only names the
      // reason. No bucket policy is claimed, recorded, or changed here.
      if (__DEV__) console.log('[Narration] Baked miss: text hash not in narration index');
      return null;
    }
    const url = bakedPublicUrl(file);
    if (!url) {
      if (__DEV__) console.log('[Narration] Baked lookup hit but no public URL (Supabase unconfigured or bucket URL construction failed)');
    }
    return url;
  } catch {
    if (__DEV__) console.log('[Narration] Baked lookup failed (hash error), falling back');
    return null;
  }
}

/** The assembled Night Selah loop for a track day, or null if not baked. */
export function getSelahLoopUrl(trackId: string, day: number): string | null {
  const key = `${trackId}/d${String(day).padStart(2, '0')}/selah`;
  const file = SELAH_LOOPS[key];
  if (!file) {
    return null;
  }
  return bakedPublicUrl(file);
}

// ── Shared one-shot spoken-audio player ───────────────────────────────
// Used by the surfaces that used to call expo-speech directly (immersive
// narration, the session Declare SPEAK button, the Declarations tab).
// Plays the baked file when one exists; otherwise speaks with the device
// voice exactly as before. Callbacks mirror expo-speech semantics.

type SpeakOptions = {
  /** Playback rate applied to the baked file (user's playback-rate setting). */
  rate?: number;
  /** Rate for the expo-speech fallback — always
   * deviceFallbackSpeechRate(playbackRate); see below. */
  speechRate: number;
  onDone?: () => void;
  onError?: () => void;
};

/** Kai-approved 2026-10-26, unified device-voice fallback rate: the
 * session formula, used identically on every surface (session
 * voiceover / narration / Declare SPEAK and the declarations reader
 * SPEAK). The device voice is slower than the baked voice at the same
 * setting, so the fallback is capped at 1x and floored at 0.4x:
 * playbackRate 1x → 0.6x, 1.5x → 0.9x, 2x → 1x (capped). Baked-file
 * playback still uses the raw playbackRate via `rate` — this formula
 * is for the device-voice fallback only. Previously the surfaces
 * disagreed (session 0.6x, session SPEAK 0.75x, declarations uncapped),
 * so the same setting sounded different on different screens. */
export function deviceFallbackSpeechRate(playbackRate?: number): number {
  return Math.max(0.4, Math.min(1, (playbackRate ?? 1) * 0.6));
}

let spokenPlayer: AudioPlayer | null = null;
let spokenSub: { remove: () => void } | null = null;

function releaseSpokenPlayer(): void {
  try {
    spokenSub?.remove();
  } catch {}
  spokenSub = null;
  try {
    spokenPlayer?.pause();
    spokenPlayer?.release();
  } catch {}
  spokenPlayer = null;
}

/** Stop any one-shot spoken audio, baked or device voice. */
export function stopSpokenAudio(): void {
  releaseSpokenPlayer();
  try {
    Speech.stop();
  } catch {}
}

function speakWithDeviceVoice(text: string, options: SpeakOptions): boolean {
  try {
    Speech.speak(text, {
      language: 'en-US',
      rate: Math.max(0.1, Math.min(2, options.speechRate)),
      pitch: 1.0,
      onDone: () => options.onDone?.(),
      onError: () => options.onError?.(),
    });
    return true;
  } catch {
    options.onError?.();
    return false;
  }
}

/**
 * Speak `text` aloud: baked Helio file first (session speed), device
 * voice as the fallback. Resolves true when a voice actually started.
 * If the baked file fails mid-playback, the device voice takes over
 * from the top — a session never dies because an audio file did.
 */
export async function speakText(text: string, options: SpeakOptions): Promise<boolean> {
  stopSpokenAudio();
  if (!text || !text.trim()) {
    options.onError?.();
    return false;
  }

  const url = await getBakedAudioUrl(text, SPEED_SESSION);
  if (!url) {
    return speakWithDeviceVoice(text, options);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    try {
      const player = createAudioPlayer({ uri: url });
      spokenPlayer = player;
      if (options.rate != null) {
        try {
          player.setPlaybackRate(Math.max(0.5, Math.min(2, options.rate)), 'high');
        } catch {}
      }
      spokenSub = player.addListener('playbackStatusUpdate', (status) => {
        if (settled) return;
        if (status.error) {
          settled = true;
          // Audit round 13, H13: the baked file resolved but failed in
          // playback (bucket unreachable / file missing at playback
          // time) — a different failure from a baked hash miss, which
          // never reaches this listener. Log it as such, then fall back.
          if (__DEV__) console.log('[Narration] Baked playback failed, falling back to device voice');
          releaseSpokenPlayer();
          resolve(speakWithDeviceVoice(text, options));
        } else if (status.didJustFinish) {
          settled = true;
          releaseSpokenPlayer();
          options.onDone?.();
          resolve(true);
        }
      });
      player.play();
      // Playback has started; completion arrives via the listener.
      resolve(true);
    } catch {
      releaseSpokenPlayer();
      resolve(speakWithDeviceVoice(text, options));
    }
  });
}
