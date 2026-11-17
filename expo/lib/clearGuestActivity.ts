/**
 * Clear guest Wall activity (GPT-6 item 16, 2026-11-16).
 *
 * Guests who Amen get a server-side anonymous Supabase Auth user, but
 * Settings hides Delete Account for anonymous sessions — so a guest
 * had no way to remove their server-side footprint. This is that
 * path: the clear_guest_wall_activity RPC (migration
 * 20261116000006) deletes the anonymous user's server-side identity
 * and Wall interaction data (amen ledgers, mutes, reports as
 * reporter). It is NOT a sign-out: the RPC runs first, then only the
 * LOCAL session is cleared below.
 *
 * This deliberately does NOT use the provider's signOut /
 * deleteAccount: both wipe local state (SyncService.clearLocalState),
 * which would destroy the guest's only, device-local copy of prayer
 * progress. Local progress is left untouched — the next Amen mints a
 * fresh anonymous session and progress continues from the guest blob.
 * The keep-local marker is what makes that survive the provider's
 * passive sign-out path (AppProvider handleUserUpdate(null) wipes on
 * any session loss); it is set here BEFORE the local sign-out and
 * consumed there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasAnonymousSession, supabase } from './supabase';

/**
 * One-time keep-local marker. Value '1'; consumed (removed) by the
 * AppProvider's passive sign-out path. If the marker is never
 * consumed (app killed between set and sign-out), it sits harmlessly
 * until the next session loss consumes it — that loss would then
 * keep local state instead of wiping it, which is the safe
 * direction for a guest whose server identity is already gone.
 */
export const GUEST_CLEAR_KEEP_LOCAL_KEY = 'triad_guest_clear_keep_local_v1';

export async function consumeGuestClearKeepLocalMarker(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(GUEST_CLEAR_KEEP_LOCAL_KEY);
    if (value !== '1') return false;
    await AsyncStorage.removeItem(GUEST_CLEAR_KEEP_LOCAL_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes the anonymous user's server-side identity + Wall
 * interaction data, then clears ONLY the local session. Throws when
 * there is no Supabase client, no anonymous session, or the RPC
 * fails — in all three cases nothing is deleted and nothing is
 * signed out, so the guest can retry.
 */
export async function clearGuestWallActivity(): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  if (!(await hasAnonymousSession())) {
    throw new Error('No guest session to clear');
  }

  const { error } = await supabase.rpc('clear_guest_wall_activity');
  if (error) throw error;

  // Mark BEFORE the local sign-out: the auth listener's passive
  // sign-out path runs on the SIGNED_OUT event and would otherwise
  // wipe the guest blob. Best-effort — if the set fails, the sign-out
  // still proceeds and the wipe happens (fail-safe toward the old
  // behaviour, not toward a half-cleared state).
  try {
    await AsyncStorage.setItem(GUEST_CLEAR_KEEP_LOCAL_KEY, '1');
  } catch {
    // Best effort — see above.
  }

  // Local scope only: the server-side user is already deleted, so a
  // server sign-out would fail against a missing user. This just
  // drops the local tokens and lets the provider settle to guest.
  await supabase.auth.signOut({ scope: 'local' });
}
