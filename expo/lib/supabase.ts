import 'react-native-url-polyfill/auto';
import { createClient, Session, User } from '@supabase/supabase-js';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabaseAuthStorage } from './secureStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

const SUPABASE_FETCH_TIMEOUT_MS = 15000;

const safeFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  // A caller-supplied signal must never disable the timeout: forward its
  // abort into our controller and always fetch on the controller's signal.
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input as RequestInfo, { ...init, signal: controller.signal });
  } catch (error) {
    // Audit round 4, L2: the synthetic 400 below must never mask an auth
    // endpoint failure. auth-js reads a 400 from /auth/v1 token refresh
    // as an invalid-grant failure and can drop a valid session while the
    // device is merely offline. Auth traffic throws natively; only
    // PostgREST/storage traffic gets the offline synthesis.
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request)?.url ?? '';
    if (urlString.includes('/auth/v1')) {
      throw error;
    }
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
    storage: supabaseAuthStorage,
    autoRefreshToken: true,
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

if (Platform.OS !== 'web') {
  try {
    const handleAppStateChange = (status: AppStateStatus) => {
      if (status === 'active') {
        void supabase.auth.startAutoRefresh().catch(() => null);
      } else {
        void supabase.auth.stopAutoRefresh().catch(() => null);
      }
    };
    AppState.addEventListener('change', handleAppStateChange);
    if (AppState.currentState === 'active') {
      void supabase.auth.startAutoRefresh().catch(() => null);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[Supabase] Failed to wire AppState auto-refresh:', error);
    }
  }
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

/**
 * True when the current session belongs to an anonymous user. Anonymous users
 * own their wall activity (amens, echoes) and can be upgraded in place by
 * linking an Apple or Google identity at sign-in, or an email identity
 * via updateUser (see lib/emailAuth.ts).
 */
export async function hasAnonymousSession(): Promise<boolean> {
  const session = await getSafeSession();
  return session?.user?.is_anonymous === true;
}

/**
 * GoTrue rejects linking an identity that already belongs to another account.
 * When that happens the caller should fall back to a regular sign-in instead
 * of failing the whole flow.
 */
export function isIdentityConflictError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const lower = message.toLowerCase();
  return (
    lower.includes('already') &&
    (lower.includes('link') || lower.includes('registered') || lower.includes('identity'))
  );
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSafeSession();
  return session?.user ?? null;
}

export async function safeGetCurrentUser(): Promise<User | null> {
  return getCurrentUser();
}
