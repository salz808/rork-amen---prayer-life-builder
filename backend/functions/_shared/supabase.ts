import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export function createUserClient(authorization: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
}

export async function requireUser(request: Request): Promise<{ user: User; authorization: string }> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }

  const supabase = createUserClient(authorization);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Unauthorized');
  }

  return { user: data.user, authorization };
}
