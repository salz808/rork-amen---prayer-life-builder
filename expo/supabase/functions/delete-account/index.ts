import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';
const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000;

async function deleteUserData(userId: string) {
  const supabase = createAdminClient();

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
    'profiles',
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error && !String(error.message ?? '').includes('column user_id does not exist')) {
      throw error;
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

    return json(request, { ok: true, userId: user.id, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[delete-account] request failed');
    return errorResponse(request, message, message === 'Missing bearer token' || message === 'Unauthorized' ? 401 : 500);
  }
});
