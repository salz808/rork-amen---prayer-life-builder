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
      JSON.stringify({ error: 'offline', message: 'Network request failed', code: 'offline' }),
      {
        status: 400,
        statusText: 'Offline',
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
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: safeFetch,
  },
});

// Proactively swallow any unhandled rejection from supabase-js internal init
// (e.g. AuthRetryableFetchError when the device is offline during module load).
try {
  const maybeInit = (supabase.auth as unknown as { initialize?: () => Promise<unknown> }).initialize;
  if (typeof maybeInit === 'function') {
    void maybeInit.call(supabase.auth).catch(() => null);
  }
  void supabase.auth.getSession().catch(() => null);
} catch {
  // ignore
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as unknown as {
    __amenSupabaseRejectionHandlerInstalled?: boolean;
    addEventListener?: (type: string, listener: (e: any) => void) => void;
    process?: { on?: (event: string, listener: (reason: unknown) => void) => void };
  };

  if (!g.__amenSupabaseRejectionHandlerInstalled) {
    const isSupabaseFetchError = (reason: unknown): boolean => {
      if (!reason) return false;
      if (typeof reason === 'object') {
        const name = (reason as { name?: unknown }).name;
        const message = (reason as { message?: unknown }).message;
        if (typeof name === 'string' && name.toLowerCase().includes('authretryablefetcherror')) {
          return true;
        }
        if (typeof message === 'string') {
          const lower = message.toLowerCase();
          if (lower.includes('failed to fetch') || lower.includes('network request failed')) {
            return true;
          }
        }
      }
      return false;
    };

    if (typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (event: any) => {
        const reason = event?.reason;
        if (isSupabaseFetchError(reason)) {
          if (__DEV__) {
            console.warn('[Supabase] Suppressed retryable fetch error');
          }
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
        }
      });
    }

    g.__amenSupabaseRejectionHandlerInstalled = true;
  }
}

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
