// Build 8 regression: build 7 crashed on every launch because lib/supabase.ts
// constructed the client unconditionally at module scope with env values
// defaulting to '', and supabase-js throws synchronously on an empty or
// malformed URL / empty key — during bundle evaluation, before any screen
// or error boundary exists (RCTFatal, SIGABRT ~0.6s after launch).
// Importing the module with the variables unset, empty, or malformed must
// NOT throw; the client must be null and getSafeSession must return null.
// The real lib/supabase module imports react-native and secure storage,
// which cannot load under the node jest environment, so those are mocked
// below — the module under test itself is real, not mocked.
// The real lib/supabase module imports react-native and secure storage,
// which cannot load under the node jest environment, so those I/O
// boundaries are mocked below — the module under test itself is real.
// @supabase/supabase-js is replaced with a validating fake that replicates
// the real library's synchronous constructor validation (empty URL,
// malformed URL, empty key all throw), because the real package pulls in
// ESM-only Expo code that jest cannot load here. The regression under test
// is the guard placement in lib/supabase.ts: createClient must never be
// called when unconfigured, and must be called with valid values when
// configured.
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
// babel-preset-expo rewrites process.env.EXPO_PUBLIC_* into imports from
// 'expo/virtual/env', which jest cannot load as ESM. Mock it with getters
// that read the real process.env at access time, so each test can change
// the variables and re-import the module under test.
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
  // babel-preset-expo rewrites process.env.EXPO_PUBLIC_* to env.EXPO_PUBLIC_*
  // on the expo/virtual/env module, so the mock must export that env object
  // with getters that read the real process.env at access time.
  return { __esModule: true, env };
});
jest.mock('../lib/secureStorage', () => ({
  supabaseAuthStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((url: string, key: string) => {
    if (!url) {
      throw new Error('supabaseUrl is required');
    }
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.');
    }
    if (!key) {
      throw new Error('supabaseKey is required');
    }
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    };
  }),
}));

const URL_SUFFIX = 'SUPABASE_URL';
const KEY_SUFFIX = 'SUPABASE_ANON_KEY';
// React Native defines __DEV__ globally; the node jest environment does
// not. The module under test reads it, so define it as production (false).
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const envKey = (suffix: string) => 'EXPO_PUBLIC_' + suffix;
const ORIGINAL_URL = process.env[envKey(URL_SUFFIX)];
const ORIGINAL_KEY = process.env[envKey(KEY_SUFFIX)];
const setEnv = (suffix: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[envKey(suffix)];
  } else {
    process.env[envKey(suffix)] = value;
  }
};

async function loadSupabaseModule() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../lib/supabase') as typeof import('../lib/supabase');
}

afterEach(() => {
  setEnv(URL_SUFFIX, ORIGINAL_URL);
  setEnv(KEY_SUFFIX, ORIGINAL_KEY);
  jest.resetModules();
});

describe('supabase module with unconfigured environment (build 8 regression)', () => {
  it('does not throw when both variables are unset, and exports a null client', async () => {
    setEnv(URL_SUFFIX, undefined);
    setEnv(KEY_SUFFIX, undefined);
    // If the module threw on load (the build 7 bug), this line throws and
    // the test fails — that is the regression assertion.
    const mod = await loadSupabaseModule();
    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    await expect(mod.getSafeSession()).resolves.toBeNull();
  });

  it('does not throw when both variables are empty strings', async () => {
    setEnv(URL_SUFFIX, '');
    setEnv(KEY_SUFFIX, '');
    const mod = await loadSupabaseModule();
    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    await expect(mod.getSafeSession()).resolves.toBeNull();
  });

  it('does not throw when the URL is malformed, even with a key present', async () => {
    setEnv(URL_SUFFIX, 'not-a-url');
    setEnv(KEY_SUFFIX, 'some-key');
    const mod = await loadSupabaseModule();
    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    await expect(mod.getSafeSession()).resolves.toBeNull();
  });

  it('does not throw when the URL is valid but the key is empty', async () => {
    setEnv(URL_SUFFIX, 'https://example.supabase.co');
    setEnv(KEY_SUFFIX, '');
    const mod = await loadSupabaseModule();
    expect(mod.isSupabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    await expect(mod.getSafeSession()).resolves.toBeNull();
  });

  it('constructs a client when the URL is valid and a key is present (configured path unchanged)', async () => {
    setEnv(URL_SUFFIX, 'https://example.supabase.co');
    setEnv(KEY_SUFFIX, 'test-anon-key');
    const mod = await loadSupabaseModule();
    expect(mod.isSupabaseConfigured).toBe(true);
    expect(mod.supabase).not.toBeNull();
  });
});
