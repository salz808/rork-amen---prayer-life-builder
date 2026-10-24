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
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').eq('user_id', userId).limit(1);
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for user`);
    }
  }

  for (const table of reporterTables) {
    const { data, error } = await supabase.from(table).select('id').eq('reporter_id', userId).limit(1);
    if (error && !isSchemaNotFoundError(error)) {
      throw error;
    }
    if (data && data.length > 0) {
      throw new Error(`delete-account: rows remain in ${table} for user`);
    }
  }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileError) {
    throw profileError;
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId, true);
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
