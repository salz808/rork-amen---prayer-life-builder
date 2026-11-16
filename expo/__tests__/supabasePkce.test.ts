// P0-6 PKCE + safeFetch (k) (2026-11-16).
// - The Supabase client must be created with flowType 'pkce'
//   (detectSessionInUrl stays false — the app exchanges codes from
//   deep links itself).
// - safeFetch must answer a fetch failure on non-auth traffic with a
//   RETRYABLE 503 (code 'offline'), not a 400 — a 400 reads as a
//   permanent client error, so callers could drop retryable work.
//   Auth traffic (/auth/v1) must still throw natively, never be
//   synthesized.
// Same mock pattern as supabaseUnconfigured.test.ts: the real
// lib/supabase module is under test; react-native, expo/virtual/env,
// secureStorage, and @supabase/supabase-js are mocked, and the
// createClient mock captures the options (including global.fetch) so
// the real safeFetch can be driven through them.
import type { SupabaseClient } from '@supabase/supabase-js';

// RN provides __DEV__ globally; the Jest node env does not, and the
// module under test reads it on the offline path.
(global as unknown as { __DEV__?: boolean }).__DEV__ = false;

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('expo/virtual/env', () => {
  const env: Record<string, string | undefined> = {};
  const def = (suffix: string) => {
    Object.defineProperty(env, 'EXPO_PUBLIC_' + suffix, {
      enumerable: true,
      get: () => process.env['EXPO_PUBLIC_' + suffix],
    });
  };
  def('SUPABASE_URL');
  def('SUPABASE_ANON_KEY');
  return { __esModule: true, env };
});
jest.mock('../lib/secureStorage', () => ({
  supabaseAuthStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockCreateClient = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe('supabase client configuration (P0-6)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    mockCreateClient.mockReset();
    mockCreateClient.mockImplementation((_url: string, _key: string, _options: unknown) => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        startAutoRefresh: async () => {},
        stopAutoRefresh: async () => {},
      },
    }) as unknown as SupabaseClient);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  // require(), not dynamic import(): the latter needs
  // --experimental-vm-modules under this Jest setup.
  function loadSupabase() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../lib/supabase') as typeof import('../lib/supabase');
  }

  it('creates the client with flowType pkce and detectSessionInUrl false', async () => {
    loadSupabase();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const options = mockCreateClient.mock.calls[0][2] as {
      auth: { flowType?: string; detectSessionInUrl?: boolean };
    };
    expect(options.auth.flowType).toBe('pkce');
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it('safeFetch answers an offline PostgREST failure with 503 + code offline, not 400', async () => {
    loadSupabase();
    const options = mockCreateClient.mock.calls[0][2] as {
      global: { fetch: typeof fetch };
    };
    const safeFetch = options.global.fetch;
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await safeFetch('https://example.supabase.co/rest/v1/profiles', {
        method: 'GET',
      });
      expect(response.status).toBe(503);
      expect(response.statusText).toBe('Service Unavailable');
      const body = (await response.json()) as { code?: string; error?: string };
      expect(body.code).toBe('offline');
      expect(body.error).toBe('offline');
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('safeFetch rethrows auth failures instead of synthesizing a response', async () => {
    loadSupabase();
    const options = mockCreateClient.mock.calls[0][2] as {
      global: { fetch: typeof fetch };
    };
    const safeFetch = options.global.fetch;
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(
        safeFetch('https://example.supabase.co/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
        }),
      ).rejects.toThrow('Network request failed');
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('safeFetch passes a successful response through untouched', async () => {
    loadSupabase();
    const options = mockCreateClient.mock.calls[0][2] as {
      global: { fetch: typeof fetch };
    };
    const safeFetch = options.global.fetch;
    const okResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchMock = jest.fn(async () => okResponse);
    const previousFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await safeFetch('https://example.supabase.co/rest/v1/profiles', {});
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      global.fetch = previousFetch;
    }
  });
});
