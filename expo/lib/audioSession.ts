import { setAudioModeAsync } from 'expo-audio';

// Audio must play even with the iPhone silent switch on. iOS mutes the
// app's default audio session when the switch is set — and until this
// module existed, the playback mode was only configured on the paths
// that set it themselves (a session loading its soundscape, a soundscape
// preview). A declaration tapped first played nothing on silent, because
// nothing had configured the session yet. Configure once per launch so
// every audio path — declarations, sessions, soundbeds, Selah — is
// covered regardless of which screen the user reaches first.
//
// The mode persists for the app session once set; the per-path calls in
// session.tsx / SettingsSheet.tsx still run and are harmless.
let configured = false;

export async function ensurePlaybackAudioMode(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    // Duck-others (Gemini R2 motion addition, verified against the
    // installed expo-audio types): other apps lower their volume while
    // TRIAD plays, instead of the default mixWithOthers (full volume
    // under prayer audio) or doNotMix (other audio stops outright).
    // Unified key — works on iOS and Android; interruptionModeAndroid
    // is deprecated in favour of it.
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  } catch (e) {
    // A failed mode call must never block launch or playback: reset so a
    // later call retries, and let the caller fall through to its player.
    configured = false;
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[AudioSession] setAudioModeAsync failed:', e);
  }
}

// Test-only: reset the once-per-launch guard between cases.
export function __resetAudioSessionForTests(): void {
  configured = false;
}
