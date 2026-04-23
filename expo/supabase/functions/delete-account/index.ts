import { handleCors } from '../_shared/cors.ts';
import { errorResponse, json } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

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
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { user } = await requireUser(request);
    console.log('[delete-account] deleting user', { userId: user.id });

    await deleteUserData(user.id);

    return json({ ok: true, userId: user.id, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[delete-account] Unexpected error', message);
    return errorResponse(message, message === 'Missing bearer token' || message === 'Unauthorized' ? 401 : 500);
  }
});
