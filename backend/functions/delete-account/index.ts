import { handleCors } from '../_shared/cors.ts';
import { errorResponse, isAuthErrorMessage, json, readCappedJson } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';
import {
  DEFAULT_APPLE_CLIENT_ID,
  decodeJwtPayload,
  isSessionAuthRecent,
  revokeAppleRefreshToken,
  type AppleSecrets,
} from '../_shared/apple.ts';

const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';
const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Thrown when a stored Apple token exists but cannot be revoked at
 * Apple (or the Apple secrets are missing). The handler maps this to
 * a retryable 503 and the account is NOT deleted (Item 7, 2026-11-16).
 */
class AppleRevocationBlockedError extends Error {}

/** Matches PostgREST/Postgres errors for missing tables or columns. */
function isSchemaNotFoundError(error: { message?: string; code?: string }): boolean {
  const message = String(error.message ?? '');
  return message.includes('does not exist')
    || message.includes('schema cache')
    || error.code === '42P01'
    || error.code === '42703'
    || error.code === 'PGRST204';
}

/**
 * Audit must-fix #10, corrected in round 2: verification-phase tolerance.
 * A missing TABLE is fine (schema may lag), but a missing COLUMN must
 * FAIL LOUDLY — otherwise verifying a column that doesn't exist passes
 * vacuously and hides rows the delete never touched.
 *
 * PostgREST codes (the path these queries actually take): PGRST205 =
 * table not found in the schema cache (tolerate); PGRST204 = COLUMN not
 * found in the schema cache (throw). The first version of this helper had
 * them backwards — tolerating PGRST204 and throwing on PGRST205 — which
 * left the vacuous-pass hole open on the live path. Direct-Postgres codes:
 * 42P01 = undefined table (tolerate), 42703 = undefined column (throw).
 * Bare messages are disambiguated by noun: 'column … schema cache' throws,
 * 'table … schema cache' and 'relation … does not exist' tolerate.
 */
function isMissingTableOnlyError(error: { message?: string; code?: string }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  if (error.code === '42703' || error.code === 'PGRST204') return false;
  const message = String(error.message ?? '');
  if (message.includes('column') && message.includes('schema cache')) return false;
  if (message.includes('table') && message.includes('schema cache')) return true;
  return message.includes('relation') && message.includes('does not exist');
}

/**
 * Kai-approved 2026-10-26 (item 10), implemented by migration 00022
 * (anonymize_wall_content_for_user): on account deletion, Prayer Wall
 * posts are ANONYMIZED, not deleted — echoes get user_id → NULL,
 * testimonies get user_id → NULL and first_name → 'A friend', held
 * rows stay held (the function touches neither hidden_at nor
 * hidden_reason, so it cannot publish a held post), and the posts
 * stay up for intercessors. This matches the delete alert's promise
 * in SettingsSheet ('Your prayer requests and testimonies stay on
 * the Prayer Wall … shown as “A friend”').
 *
 * This MUST run FIRST, before any delete in deleteUserData, and ANY
 * error (including the function not existing yet because 00022 has
 * not been applied) ABORTS the whole deletion: the throw propagates
 * to the handler's 500, the account stays intact, and the user can
 * retry. There is deliberately NO tolerate-missing-function fallback
 * and NO fallback to deleting wall rows — a half-deleted account
 * with un-anonymized posts, or a delete that silently drops the
 * promised posts, is worse than a failed delete. DEPLOY ORDER:
 * apply 00022 BEFORE deploying this version of the function, or
 * every delete-account call will fail closed until 00022 lands.
 *
 * Amens are NOT touched here or by 00022: Kai ruled amens by a
 * deleted user stay and prayer counts are preserved, so
 * community_amens is deleted nowhere in this function (its user_id
 * has no FK to auth.users, so the hard auth delete does not
 * cascade to it either). Testimony reclassification is deliberately
 * out of scope and is NOT done here.
 */
async function anonymizeWallContent(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('anonymize_wall_content_for_user', {
    p_user_id: userId,
  });
  if (error) {
    throw error;
  }
  // Fail closed on an unexpected shape: the function always returns
  // exactly one row (echoes/testimonies counts). Accepting an empty
  // or malformed result would let the delete proceed on unproven
  // anonymization.
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('delete-account: anonymize returned an unexpected result');
  }

  // Verify the author links are actually gone before anything else
  // is deleted: no echo or testimony may still carry this user_id.
  // (The posts themselves must REMAIN — anonymized, not empty — so
  // this checks the author link only, not row absence. A held row
  // cannot be checked this way after its link is gone; held-stays-
  // held is guaranteed by 00022's UPDATE column list and covered
  // by the staging test in TESTING.md, not by this query.)
  // Missing TABLE only is tolerated (no rows can exist in a missing
  // table); a missing column throws, per isMissingTableOnlyError.
  for (const table of ['community_echoes', 'community_testimonies'] as const) {
    const { data: remains, error: verifyError } = await supabase
      .from(table)
      .select('user_id')
      .eq('user_id', userId)
      .limit(1);
    if (verifyError && !isMissingTableOnlyError(verifyError)) {
      throw verifyError;
    }
    if (remains && remains.length > 0) {
      throw new Error(`delete-account: wall rows still linked in ${table} for user`);
    }
  }
}

async function deleteUserData(userId: string) {
  const supabase = createAdminClient();

  // P0-5 Apple token revocation (Guideline 5.1.1(v), 2026-11-16;
  // Item 7, 2026-11-16): this runs FIRST, before any destructive
  // step, because a blocked revocation aborts the whole deletion and
  // a failure here must leave a fully intact, retryable account — in
  // particular it must run BEFORE the deleted_users tombstone below,
  // or a blocked delete would leave a tombstone on a living account.
  // revokeStoredAppleToken throws AppleRevocationBlockedError when a
  // stored token cannot be revoked (Apple failure, or Apple secrets
  // missing); the handler maps that to a retryable 503. No stored
  // token (legacy / email / Google / browser-Apple sign-ins) proceeds.
  // See the JUDGMENT CALL note on revokeStoredAppleToken.
  await revokeStoredAppleToken(userId);

  // Anonymize FIRST (see anonymizeWallContent): any failure aborts
  // before a single row is deleted, so a retry starts from an intact
  // account. Anonymize is idempotent — a retry after a later-step
  // failure simply returns 0/0 for already-anonymized rows.
  await anonymizeWallContent(userId);

  // Tables keyed by user_id. 'profiles' is handled separately below (keyed by id).
  // This list must cover every user-keyed table the app writes to,
  // EXCEPT the deliberately retained ones: community_echoes and
  // community_testimonies are anonymized above, never deleted, and
  // community_amens is retained per Kai's ruling (counts preserved)
  // — none of the three appears here or in the verify loops below.
  const tables = [
    'active_sessions',
    'daily_prayer_log',
    'first_steps_checklist',
    'phase_timings',
    'answered_prayers',
    'prayer_requests',
    'weekly_reflections',
    'day_progress',
    'journey_stats',
    'circle_members',
    'circle_journey_members',
    'declaration_favorites',
    'echo_mutes',
    'testimony_mutes',
    'journey_progress',
    'error_reports',
    // Audit round 4, fix lane 3 (E-M2): the webhook tables were missing
    // entirely — a deleted user's UUID, event ids/types, and watermark
    // survived "permanent" deletion. Both are keyed by user_id.
    'webhook_events',
    'webhook_user_state',
    // Pre-launch audit L1: bug_reports is covered by its ON DELETE
    // CASCADE FK plus the hard auth delete below, but listing it here
    // makes the verification loop check it too (a cascade failure used
    // to pass silently). wall_daily_ledger has NO FK at all, so without
    // this its (user_id, day) rows genuinely survived "permanent"
    // deletion. Both are keyed by user_id, so the shared delete +
    // verify loops cover them; a missing table (migration not yet
    // deployed) is tolerated by the same schema-error helpers.
    'bug_reports',
    'wall_daily_ledger',
  ] as const;

  // Report tables key the reporter, not the content author (verified
  // against the report_* RPC definitions): a deleted user's own reports
  // must go, while reports other users filed stay untouched.
  const reporterTables = [
    'echo_reports',
    'testimony_reports',
  ] as const;

  // Audit must-fix #10: the bell table keys by recipient, not user_id, so
  // it was missing from the delete list entirely — and its ON DELETE
  // CASCADE FKs never fired under the old soft delete, so bell rows for a
  // deleted user survived. (Hard delete below closes the cascade gap;
  // the explicit delete stays as defense.)
  const recipientTables = [
    'prayer_notifications',
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    // Tolerate missing tables/columns (schema may lag behind) but fail on real errors.
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
  }

  for (const table of reporterTables) {
    const { error } = await supabase.from(table).delete().eq('reporter_id', userId);
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
  }

  for (const table of recipientTables) {
    const { error } = await supabase.from(table).delete().eq('recipient_id', userId);
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
  }

  // Audit round 4, fix lane 3 (E-M3): mute tables are (user_id,
  // muted_user_id) pairs. The tables loop above deletes only mutes the
  // deleted user CREATED; rows where OTHER users muted the deleted user
  // (muted_user_id = userId) survived, leaving the deleted user's UUID
  // in other users' mute lists. Delete + verify that side too.
  const mutedTables = [
    'echo_mutes',
    'testimony_mutes',
  ] as const;
  for (const table of mutedTables) {
    const { error } = await supabase.from(table).delete().eq('muted_user_id', userId);
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
  }

  // Audit round 5, lane 9 (personas §4): circle_rpc_attempts is a
  // service-only log (REVOKE ALL, no FK, no prune anywhere) keyed by
  // user_id — without this step a deleted user's preview/join attempt
  // history survived "permanent" deletion permanently. Same
  // tolerate-missing-table pattern as the tables above (the table
  // arrives with migration 20261025000012).
  const { error: rpcAttemptsError } = await supabase
    .from('circle_rpc_attempts')
    .delete()
    .eq('user_id', userId);
  if (rpcAttemptsError && !isSchemaNotFoundError(rpcAttemptsError)) {
    throw rpcAttemptsError;
  }

  // Audit round 4, fix lane 3 (E-L5): a circle_journeys.started_by
  // FK is ON DELETE CASCADE, so the hard auth delete used to delete a
  // SHARED journey (and its members) that the deleter started in a
  // circle they do not own. Reassign those journeys to the circle owner
  // first. Journeys in circles the deleter OWNS are intentionally left
  // alone — the owned-circle branch below dissolves those circles.
  const { data: startedJourneys, error: startedJourneysError } = await supabase
    .from('circle_journeys')
    .select('id, circle_id')
    .eq('started_by', userId);
  if (startedJourneysError && !isSchemaNotFoundError(startedJourneysError)) {
    throw startedJourneysError;
  }
  if (startedJourneys && startedJourneys.length > 0) {
    const journeyCircleIds = Array.from(new Set(startedJourneys.map((row) => row.circle_id as string)));
    const { data: journeyCircles, error: journeyCirclesError } = await supabase
      .from('circles')
      .select('id, owner_id')
      .in('id', journeyCircleIds);
    if (journeyCirclesError && !isSchemaNotFoundError(journeyCirclesError)) {
      throw journeyCirclesError;
    }
    const ownerByCircle = new Map((journeyCircles ?? []).map((row) => [row.id as string, row.owner_id as string]));
    for (const journey of startedJourneys) {
      const ownerId = ownerByCircle.get(journey.circle_id as string);
      if (ownerId && ownerId !== userId) {
        const { error: reassignError } = await supabase
          .from('circle_journeys')
          .update({ started_by: ownerId })
          .eq('id', journey.id as string);
        if (reassignError && !isSchemaNotFoundError(reassignError)) {
          throw reassignError;
        }
      }
    }
  }

  // Circles the user owns dissolve with the account (the existing
  // owner-leaves rule). Drop their journeys and memberships first so a
  // foreign key can't block the circle delete.
  const { data: ownedCircles, error: ownedError } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', userId);
  if (ownedError && !isSchemaNotFoundError(ownedError)) {
    throw ownedError;
  }
  const ownedIds = (ownedCircles ?? []).map((row) => row.id as string);
  if (ownedIds.length > 0) {
    for (const table of ['circle_journey_members', 'circle_journeys', 'circle_members'] as const) {
      const { error } = await supabase.from(table).delete().in('circle_id', ownedIds);
      if (error && !isSchemaNotFoundError(error)) {
        throw error;
      }
    }
    const { error: circlesError } = await supabase.from('circles').delete().eq('owner_id', userId);
    if (circlesError && !isSchemaNotFoundError(circlesError)) {
      throw circlesError;
    }
  }

  // Verify the deletes actually landed before removing the profile and the
  // auth user — a silent partial delete is worse than a retriable failure.
  // The check selects the SAME key the delete used (user_id / reporter_id /
  // recipient_id), not 'id': several of these tables have no id column,
  // and selecting a missing column used to error into the tolerated
  // schema-error branch — which made verification pass vacuously for
  // exactly those tables. Verification now tolerates missing TABLES only;
  // a missing column (42703) throws (see isMissingTableOnlyError).
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('user_id').eq('user_id', userId).limit(1);
    if (error && !isMissingTableOnlyError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for user`);
    }
  }

  for (const table of reporterTables) {
    const { data, error } = await supabase.from(table).select('reporter_id').eq('reporter_id', userId).limit(1);
    if (error && !isMissingTableOnlyError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for user`);
    }
  }

  for (const table of recipientTables) {
    const { data, error } = await supabase.from(table).select('recipient_id').eq('recipient_id', userId).limit(1);
    if (error && !isMissingTableOnlyError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for user`);
    }
  }

  for (const table of mutedTables) {
    const { data, error } = await supabase.from(table).select('muted_user_id').eq('muted_user_id', userId).limit(1);
    if (error && !isMissingTableOnlyError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for muted user`);
    }
  }

  // Audit round 5, lane 9: verify the rpc_attempts delete above (same
  // missing-table-only tolerance as the other verify loops).
  {
    const { data, error } = await supabase.from('circle_rpc_attempts').select('user_id').eq('user_id', userId).limit(1);
    if (error && !isMissingTableOnlyError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error('delete-account: rows remain in circle_rpc_attempts for user');
    }
  }

  // Audit must-fix #10: owned-circle deletes were never verified either.
  if (ownedIds.length > 0) {
    const { data: circleRemains, error: circleError } = await supabase
      .from('circles').select('id').eq('owner_id', userId).limit(1);
    if (circleError && !isMissingTableOnlyError(circleError)) {
      throw circleError;
    }
    if (circleRemains && circleRemains.length > 0) {
      throw new Error('delete-account: owned circles remain for user');
    }
    for (const table of ['circle_journey_members', 'circle_journeys', 'circle_members'] as const) {
      const { data, error } = await supabase.from(table).select('circle_id').in('circle_id', ownedIds).limit(1);
      if (error && !isMissingTableOnlyError(error)) {
        throw error;
      }
      if (data && data.length > 0) {
        throw new Error(`delete-account: rows remain in ${table} for owned circles`);
      }
    }
  }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileError) {
    throw profileError;
  }

  // Audit round 4, fix lane 3 (E-M1): write the delete tombstone AFTER
  // all data deletes + verification + profile delete, but BEFORE the
  // auth delete — so a failed run leaves no tombstone behind to block a
  // still-living account, while a successful run leaves the tombstone in
  // place before the auth row (and its refresh tokens) disappears. The
  // migration-00014 triggers then reject profile/wall INSERTs for this
  // id from the deleted user's unexpired JWT (PostgREST trusts JWT claims
  // without checking the auth row still exists). The tombstone has NO FK
  // to auth.users, so the hard delete below does not cascade-remove it.
  // A missing table (migration not yet deployed) is tolerated with a
  // loud log — deletion must not fail for a hardening table — but any
  // other insert failure aborts before the auth delete. Upsert makes a
  // retry after an auth-delete failure idempotent.
  const { error: tombstoneError } = await supabase
    .from('deleted_users')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });
  if (tombstoneError && !isSchemaNotFoundError(tombstoneError)) {
    throw tombstoneError;
  }
  if (tombstoneError) {
    console.error('[delete-account] deleted_users table missing; tombstone skipped');
  }

  // P0-5 Apple token revocation already ran at the top of this
  // function (Item 7) — see revokeStoredAppleToken. It is deliberately
  // NOT repeated here: a second attempt after the tombstone write
  // could not abort cleanly, and the token row is dropped by the
  // revoke step itself (or by the auth delete's ON DELETE CASCADE).

  // Audit must-fix #10: HARD delete. The old shouldSoftDelete=true left
  // the auth row — email, metadata, hashed id — behind, and the bell
  // table's ON DELETE CASCADE FKs never fired on a soft delete. A hard
  // delete cascades everything the explicit deletes above may have missed.
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    throw authError;
  }
}

/**
 * Item 7 (2026-11-16): treat Apple revocation failure as evidence,
 * not success. The old best-effort version dropped the token row
 * either way and deleted the account — a failed revoke then left a
 * live Apple authorization attached to a deleted account, with no
 * record of the failure. The new rules:
 *
 * - No token row → nothing to revoke; deletion proceeds (legacy /
 *   email / Google / browser-Apple users, and users whose sign-in
 *   never stored a token).
 * - Revoke succeeds, or Apple answers invalid_grant (already
 *   revoked) → drop the row, deletion proceeds.
 * - Any other Apple failure, a token-row read failure, or missing
 *   Apple secrets while a row exists → throw
 *   AppleRevocationBlockedError (handler → retryable 503). The token
 *   row is KEPT and the account is NOT deleted, so a retry can revoke
 *   it. A missing table (migration 00003 not yet deployed) means no
 *   token was ever stored → proceeds as no-token.
 * - A row-delete failure AFTER a successful revoke is logged, not
 *   fatal: the hard auth delete below cascades the row away
 *   (ON DELETE CASCADE), and the next Apple sign-in would upsert
 *   over a lingering row anyway.
 *
 * JUDGMENT CALL (parent agent, 2026-11-16 — open to the owner's
 * correction): deletion STOPS (503) when a token row exists but
 * revocation fails or secrets are missing; deletion PROCEEDS for
 * legacy/no-token users who cannot complete a fresh Apple
 * authorization at delete time (they can revoke in iOS Settings).
 * The client-side fresh-Apple-auth offer for Apple-linked accounts
 * with no stored token is NOT implemented here — see the follow-up
 * note in the final report (AppProvider.deleteAccount /
 * SettingsSheet.handleDeleteAccount).
 *
 * AUDIT LOG (structured JSON, one line per outcome — grep for
 * `"event":"apple_revocation"`): { event, user_id, outcome } where
 * outcome is 'no_token' | 'revoked' | 'already_revoked' | 'failed' |
 * 'not_configured'. The token itself and any PII beyond user_id are
 * NEVER logged.
 */
type AppleRevocationOutcome =
  | 'no_token'
  | 'revoked'
  | 'already_revoked'
  | 'failed'
  | 'not_configured';

function logAppleRevocation(userId: string, outcome: AppleRevocationOutcome): void {
  console.log(JSON.stringify({ event: 'apple_revocation', user_id: userId, outcome }));
}

async function revokeStoredAppleToken(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('apple_refresh_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();
  // A missing table (migration not yet deployed) means no token was
  // ever stored — same tolerate-missing-table pattern as the deletes
  // above. Any other read failure fails CLOSED: we cannot prove
  // there is no token to revoke, so the deletion must not proceed.
  if (error) {
    if (isSchemaNotFoundError(error)) {
      logAppleRevocation(userId, 'no_token');
      return;
    }
    logAppleRevocation(userId, 'failed');
    throw new AppleRevocationBlockedError(
      'delete-account: apple token lookup failed; deletion blocked',
    );
  }
  const refreshToken = (data as { refresh_token?: unknown } | null)?.refresh_token;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    logAppleRevocation(userId, 'no_token');
    return;
  }

  const teamId = Deno.env.get('APPLE_TEAM_ID') ?? '';
  const keyId = Deno.env.get('APPLE_KEY_ID') ?? '';
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY_P8') ?? '';
  const clientId = Deno.env.get('APPLE_CLIENT_ID') ?? DEFAULT_APPLE_CLIENT_ID;
  if (!teamId || !keyId || !privateKey) {
    // Secrets missing while a token row exists: keep the row, block
    // the deletion. The owner must configure the secrets (or revoke
    // in iOS Settings) before this account can be deleted.
    logAppleRevocation(userId, 'not_configured');
    throw new AppleRevocationBlockedError(
      'delete-account: Apple secrets not configured; stored Apple token cannot be revoked',
    );
  }

  const secrets: AppleSecrets = { teamId, keyId, privateKey, clientId };
  let result: { outcome: 'revoked' | 'already_revoked' | 'failed' };
  try {
    result = await revokeAppleRefreshToken(refreshToken, secrets);
  } catch {
    // A client_secret build failure (misconfigured .p8 key) or any
    // other throw from the revoke call is a failure, not a success.
    logAppleRevocation(userId, 'failed');
    throw new AppleRevocationBlockedError(
      'delete-account: Apple token revocation threw; deletion blocked',
    );
  }
  if (result.outcome === 'failed') {
    // Keep the row: the token is still live at Apple and a retry
    // must be able to revoke it.
    logAppleRevocation(userId, 'failed');
    throw new AppleRevocationBlockedError(
      'delete-account: Apple token revocation failed; deletion blocked',
    );
  }
  logAppleRevocation(userId, result.outcome);

  // Drop the row now that Apple has (or had already) revoked the
  // token. A delete failure here is logged, not fatal — the hard
  // auth delete's ON DELETE CASCADE removes the row anyway.
  const { error: deleteError } = await supabase
    .from('apple_refresh_tokens')
    .delete()
    .eq('user_id', userId);
  if (deleteError && !isSchemaNotFoundError(deleteError)) {
    console.error('[delete-account] apple token row delete failed');
  }
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
    // Audit round 4, fix lane 3 (E-L3): any requireUser failure whose
    // message names an auth problem is a 401, not a generic 500 (the old
    // exact-string check turned an expired JWT into a retry prompt
    // instead of a re-login prompt).
    let user: { id: string };
    let authorization: string;
    try {
      ({ user, authorization } = await requireUser(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (isAuthErrorMessage(message)) {
        return errorResponse(request, 'Authentication required', 401);
      }
      throw error;
    }

    // Audit round 4, fix lane 3 (E-L8): size-capped body parse; malformed
    // or non-object bodies are 400, never 500.
    let confirmationText = '';
    try {
      const parsed = await readCappedJson(request, MAX_BODY_BYTES);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rawConfirmation = (parsed as { confirmationText?: unknown }).confirmationText;
        confirmationText = typeof rawConfirmation === 'string' ? rawConfirmation.trim() : '';
      } else {
        return errorResponse(request, 'Request body must be a JSON object', 400);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Request body too large') {
        return errorResponse(request, 'Request body too large', 413);
      }
      return errorResponse(request, 'Malformed request JSON', 400);
    }

    if (confirmationText !== DELETE_ACCOUNT_CONFIRMATION) {
      return errorResponse(request, 'Account deletion confirmation is required', 400);
    }

    // Item 3 (2026-11-16): per-SESSION freshness, not per-user.
    // The old check read user.last_sign_in_at, which is per-user and
    // unreliable as a freshness signal: GoTrue bumps it on sign-in
    // AND on legacy refresh-token swaps (GrantRefreshTokenSwap →
    // createRefreshToken → UpdateLastSignInAt), so a stolen session
    // kept alive by refreshes could pass it indefinitely. The new
    // check decodes the access-token JWT whose signature requireUser
    // already verified (getUser) and requires BOTH a session_id AND a
    // most-recent amr timestamp within 10 minutes. GoTrue's amr
    // timestamps come from auth.mfa_amr_claims.updated_at, set at
    // sign-in and NOT moved by token refresh (RefreshTokenGrant never
    // calls AddClaimToSession), so a refreshed old session goes stale
    // exactly 10 minutes after its last real authentication. Missing
    // or malformed claims fail closed (401, sign in again). See
    // isSessionAuthRecent in _shared/apple.ts for the verified
    // evidence. The client pre-check (lib/deleteAccount.ts
    // isRecentLogin, last_sign_in_at) is kept as an approximation: it
    // can only err toward "fresh", and this server 401 corrects it.
    const claims = decodeJwtPayload(authorization.replace(/^Bearer\s+/i, ''));
    if (!isSessionAuthRecent(claims, Date.now(), RECENT_LOGIN_WINDOW_MS)) {
      return errorResponse(request, 'Please sign in again within the last 10 minutes before deleting your account', 401);
    }

    await deleteUserData(user.id);

    return json(request, { ok: true, deleted: true });
  } catch (error) {
    if (error instanceof AppleRevocationBlockedError) {
      // Item 7: a stored Apple token could not be revoked (or the
      // Apple secrets are missing). Retryable 503 — the account is
      // intact and the token row is kept, so a retry can revoke it.
      // Message kept distinct from the generic 500 so the client can
      // tell this failure apart when the fresh-Apple-auth follow-up
      // lands (AppProvider.deleteAccount).
      return errorResponse(request, 'Apple token revocation failed; please try deleting your account again in a moment', 503);
    }
    console.error('[delete-account] request failed');
    return errorResponse(request, 'Unable to delete account right now', 500);
  }
});
