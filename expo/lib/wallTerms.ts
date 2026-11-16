import AsyncStorage from '@react-native-async-storage/async-storage';

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
 */
export const WALL_TERMS_ACCEPTED_KEY = 'triad_wall_terms_accepted_v1';
export const WALL_TERMS_URL = 'https://tearsandoil.com/triadterms';

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
}
