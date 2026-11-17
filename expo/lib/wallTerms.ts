import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from './database';

/**
 * Prayer Wall Terms of Use acceptance (P1-6, Guideline 1.2,
 * 2026-11-16).
 *
 * What existed: the auth screen footer says "By signing in, you agree
 * to our Terms of Service & Privacy Policy" as plain text (no link,
 * no recorded acceptance), and the wall composer links the wall
 * guidelines sheet (rules text, no Terms link, no acceptance). No
 * explicit Terms acceptance was ever collected for wall posting.
 *
 * What this adds: a first-post gate. Before the first prayer request
 * is shared, the user is shown the Terms of Use and taps "I Agree &
 * Share"; the acceptance is recorded on-device under this key (same
 * device-flag pattern as the 13+ age attestation). It is asked once
 * per device, never again, and declining publishes nothing.
 *
 * D2 (2026-11-17): the acceptance is ALSO recorded server-side
 * (versioned, via DatabaseService.recordWallTermsAcceptance) —
 * best-effort, never throws; the local flag stays the gate.
 */
export const WALL_TERMS_ACCEPTED_KEY = 'triad_wall_terms_accepted_v1';
export const WALL_TERMS_URL = 'https://tearsandoil.com/triadterms';
export const WALL_TERMS_VERSION = 'v1';

export async function hasAcceptedWallTerms(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WALL_TERMS_ACCEPTED_KEY)) === '1';
  } catch {
    // Unknown: gate, don't assume.
    return false;
  }
}

export async function recordWallTermsAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(WALL_TERMS_ACCEPTED_KEY, '1');
  } catch {
    // Best effort — a failed write just re-prompts next time.
  }
  // D2 (2026-11-17): additive server record of the acceptance,
  // versioned so a future Terms revision can re-prompt. Best-effort
  // and never throws — the RPC is staged, so a missing function is
  // tolerated; the local flag above stays the gate.
  // Import direction: database.ts does not import wallTerms.ts, so
  // this import creates no cycle (contrast
  // lib/anonymousAgeAttestation.ts, which database.ts DOES import
  // and therefore must not import database.ts back). The server call
  // lives here — not in the community handler — so every acceptance
  // path records it; the handler already calls this function and
  // needs no change. (Test note: suites importing wallTerms.ts must
  // mock '@/lib/database' — the real module cannot load under this
  // jest config, see wallTerms.test.ts.)
  try {
    await DatabaseService.recordWallTermsAcceptance(WALL_TERMS_VERSION);
  } catch {
    // Best effort — the local flag already landed.
  }
}
