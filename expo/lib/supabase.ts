import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

const SUPABASE_FETCH_TIMEOUT_MS = 15000;

const safeFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  const signal = init?.signal ?? controller.signal;

  try {
    return await fetch(input as RequestInfo, { ...init, signal });
  } catch (error) {
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('abort')) {
        console.warn('[Supabase] fetch failed, returning offline response:', message);
      }
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Network request failed' }),
      {
        status: 503,
        statusText: 'Service Unavailable (offline)',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: isSupabaseConfigured,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: safeFetch,
  },
});

function isFetchFailure(error: unknown): boolean {
  return error instanceof TypeError && error.message.toLowerCase().includes('fetch');
}

function logSupabaseWarning(label: string, error: unknown) {
  if (!__DEV__) {
    return;
  }

  if (isFetchFailure(error)) {
    console.warn(`${label}: offline or backend unavailable, using local fallback`);
    return;
  }

  console.warn(label, error);
}

export async function getSafeSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    if (__DEV__) {
      console.warn('[Supabase] Missing configuration, skipping remote session lookup');
    }
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session ?? null;
  } catch (error) {
    logSupabaseWarning('[Supabase] Session lookup failed', error);
    return null;
  }
}

export async function signInAnonymously(): Promise<User | null> {
  try {
    const session = await getSafeSession();
    if (session?.user) {
      return session.user;
    }

    if (!isSupabaseConfigured) {
      return null;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw error;
    }
    return data.user ?? null;
  } catch (error) {
    logSupabaseWarning('[Supabase] Auth failed', error);
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSafeSession();
  return session?.user ?? null;
}

export async function safeGetCurrentUser(): Promise<User | null> {
  return getCurrentUser();
}
