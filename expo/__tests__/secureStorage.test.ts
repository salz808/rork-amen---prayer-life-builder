// P0-6 (l) (2026-11-16): two concurrent first-time writes used to
// mint DIFFERENT Keychain keys — the second overwrote the first, and
// ciphertext written under the first key became undecryptable. Key
// creation is now memoised (shared in-flight promise + cached key),
// and deleting the key clears the memo so the next account mints
// fresh instead of reusing a deleted key.
const mockKeychainStore = new Map<string, string>();
const mockAsyncStore = new Map<string, string>();
let mockRandomCounter = 0;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeychainStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychainStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychainStore.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (length: number) => {
    mockRandomCounter += 1;
    // Distinct bytes per call, so two mints produce different keys.
    return new Uint8Array(length).fill(mockRandomCounter % 256);
  }),
  digestStringAsync: jest.fn(async (_algorithm: string, message: string) => {
    // require() inside the factory: the top-level createHash import
    // is out of scope for jest.mock factories.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256').update(message).digest('hex');
  }),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => (mockAsyncStore.has(key) ? mockAsyncStore.get(key)! : null),
    setItem: async (key: string, value: string) => {
      mockAsyncStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockAsyncStore.delete(key);
    },
    getAllKeys: async () => [...mockAsyncStore.keys()],
    multiRemove: async (keys: string[]) => {
      keys.forEach((k) => mockAsyncStore.delete(k));
    },
  },
}));

describe('secureStorage key memoisation', () => {
  beforeEach(() => {
    jest.resetModules();
    mockKeychainStore.clear();
    mockAsyncStore.clear();
    mockRandomCounter = 0;
    jest.clearAllMocks();
  });

  // require(), not dynamic import(): the latter needs
  // --experimental-vm-modules under this Jest setup.
  function loadStorage() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../lib/secureStorage') as typeof import('../lib/secureStorage');
  }

  it('mints exactly one Keychain key for two concurrent first-time writes', async () => {
    const { supabaseAuthStorage } = loadStorage();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await Promise.all([
      supabaseAuthStorage.setItem('sb-test-auth-token', 'session-one'),
      supabaseAuthStorage.setItem('sb-test-auth-token', 'session-two'),
    ]);
    // One mint, not two: the second concurrent write reused the
    // in-flight key instead of minting (and overwriting) its own.
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    // The second write wins the value; both writes encrypted under
    // the SAME key, so the stored value decrypts cleanly.
    await expect(supabaseAuthStorage.getItem('sb-test-auth-token')).resolves.toBe('session-two');
  });

  it('keeps values written under the first key readable after concurrent writes', async () => {
    const { supabaseAuthStorage } = loadStorage();
    await Promise.all([
      supabaseAuthStorage.setItem('sb-a-auth-token', 'value-a'),
      supabaseAuthStorage.setItem('sb-b-auth-token', 'value-b'),
    ]);
    await expect(supabaseAuthStorage.getItem('sb-a-auth-token')).resolves.toBe('value-a');
    await expect(supabaseAuthStorage.getItem('sb-b-auth-token')).resolves.toBe('value-b');
  });

  it('mints a fresh key after the stored key is deleted (sign-out)', async () => {
    const storage = loadStorage();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await storage.supabaseAuthStorage.setItem('sb-a-auth-token', 'value-a');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);

    await storage.deleteStoredEncryptionKey();

    await storage.supabaseAuthStorage.setItem('sb-b-auth-token', 'value-b');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
    // The new value decrypts under the new key…
    await expect(storage.supabaseAuthStorage.getItem('sb-b-auth-token')).resolves.toBe('value-b');
    // …and the old ciphertext is unreadable under the new key
    // (tag mismatch → null, treated as no session — never a leak).
    await expect(storage.supabaseAuthStorage.getItem('sb-a-auth-token')).resolves.toBeNull();
  });
});
