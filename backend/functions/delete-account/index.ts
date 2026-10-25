import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';
const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000;

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

async function deleteUserData(userId: string) {
  const supabase = createAdminClient();

  // Tables keyed by user_id. 'profiles' is handled separately below (keyed by id).
  // This list must cover every table the app writes user-keyed rows to —
  // an omitted table leaves a deleted user's content behind (the public
  // Prayer Wall testimonies were the original gap here).
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
    'community_amens',
    'community_echoes',
    'community_testimonies',
    'circle_members',
    'circle_journey_members',
    'declaration_favorites',
    'echo_mutes',
    'testimony_mutes',
    'journey_progress',
    'error_reports',
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

  // Audit must-fix #10: HARD delete. The old shouldSoftDelete=true left
  // the auth row — email, metadata, hashed id — behind, and the bell
  // table's ON DELETE CASCADE FKs never fired on a soft delete. A hard
  // delete cascades everything the explicit deletes above may have missed.
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    throw authError;
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
    const { user } = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { confirmationText?: string };
    const confirmationText = body.confirmationText?.trim() ?? '';

    if (confirmationText !== DELETE_ACCOUNT_CONFIRMATION) {
      return errorResponse(request, 'Account deletion confirmation is required', 400);
    }

    const lastSignInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Number.NaN;
    const isRecentLogin = Number.isFinite(lastSignInAt) && Date.now() - lastSignInAt <= RECENT_LOGIN_WINDOW_MS;

    if (!isRecentLogin) {
      return errorResponse(request, 'Please sign in again within the last 10 minutes before deleting your account', 401);
    }

    await deleteUserData(user.id);

    return json(request, { ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const isAuthError = message === 'Missing bearer token' || message === 'Unauthorized';
    console.error('[delete-account] request failed');
    return errorResponse(
      request,
      isAuthError ? message : 'Unable to delete account right now',
      isAuthError ? 401 : 500
    );
  }
});
