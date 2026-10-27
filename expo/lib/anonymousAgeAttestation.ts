import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSafeSession } from './supabase';

/**
 * Anonymous 13+ attestation, device-local.
 *
 * Why this exists: the signed-in attestation lives server-side
 * (profiles.age_attested_at, set only via the record_age_attestation RPC
 * from migration 00013). An anonymous guest has no usable server record
 * before their first wall write — their session is minted BY that write
 * (DatabaseService.ensureWallUserId), and a seed-post Amen mints no
 * session at all. So the wall-write gates check this local record IN
 * ADDITION to the server record; they never check it INSTEAD of the
 * server record for a signed-in user.
 *
 * Storage shape:
 * - `triad_anon_age_attested_v1`: JSON map { [anonymousUserId]: true }.
 *   Keyed by user id on purpose (the AUTH-3 lesson: a bare device flag
 *   would let the next account on a shared device inherit it). Only ever
 *   written for an anonymous session; a signed-in session never reads
 *   or writes it.
 * - `triad_anon_age_attested_pending_v1`: '1' when the user confirmed
 *   the modal while no session existed yet (first Amen, or a seed
 *   Amen). The gate honors it only while there is still no session;
 *   the confirm flow re-stamps it into the map under the minted user
 *   id as soon as a session exists, and sign-out clears it, so it can
 *   never become a standing pass for a later account.
 *
 * This is self-declared attestation, never age verification — same
 * honest ceiling as the signed-in gate. It is NOT a server check: the
 * server-side Amen age check is drafted (not deployed) as
 * 00021_DRAFT, kept out of the repo migrations dir in
 * goals/triad-prayer-app-app-store-launch-readiness/hidden_files/.
 */

const ANON_AGE_MAP_KEY = 'triad_anon_age_attested_v1';
const ANON_AGE_PENDING_KEY = 'triad_anon_age_attested_pending_v1';

async function readMap(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(ANON_AGE_MAP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
}

/** True only for anonymous guests with a recorded local attestation. Signed-in users always get false here — their gate is the server record. */
export async function getAnonymousAgeAttestation(): Promise<boolean> {
  const session = await getSafeSession();
  const user = session?.user;
  if (user && user.is_anonymous !== true) return false;
  if (!user) {
    try {
      return (await AsyncStorage.getItem(ANON_AGE_PENDING_KEY)) === '1';
    } catch {
      return false;
    }
  }
  const map = await readMap();
  return map[user.id] === true;
}

/**
 * Record a modal confirm for an anonymous guest. With an anonymous
 * session, stamps the map under that user id (and consumes any pending
 * flag). With no session yet, sets the pending flag for the write that
 * follows to stamp under its minted id. No-op for signed-in users.
 */
export async function recordAnonymousAgeAttestation(): Promise<void> {
  const session = await getSafeSession();
  const user = session?.user;
  if (user && user.is_anonymous !== true) return;
  if (!user) {
    await AsyncStorage.setItem(ANON_AGE_PENDING_KEY, '1');
    return;
  }
  const map = await readMap();
  map[user.id] = true;
  await AsyncStorage.setItem(ANON_AGE_MAP_KEY, JSON.stringify(map));
  await AsyncStorage.removeItem(ANON_AGE_PENDING_KEY);
}

/** Defensive clear for decline / sign-out paths: a decline must never leave a pending pass behind. */
export async function clearAnonymousAgeAttestationPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ANON_AGE_PENDING_KEY);
  } catch {
    // Best effort — the gate re-checks the server record and the map,
    // and the pending flag is honored only while no session exists.
  }
}
