import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import aesjs from 'aes-js';
import { Platform } from 'react-native';

/**
 * Supabase auth storage that keeps tokens encrypted at rest.
 *
 * Why not plain SecureStore: a Supabase session JSON is usually larger than
 * SecureStore's per-value limit, so this follows Supabase's own documented
 * LargeSecureStore pattern — a random 256-bit AES key lives in the Keychain
 * (SecureStore), and the AES-CTR ciphertext lives in AsyncStorage. What
 * AsyncStorage holds is ciphertext, never a usable token.
 *
 * Migration: sessions saved by the old plain-AsyncStorage storage are picked
 * up once, re-stored encrypted, and the plaintext copy is deleted — so an
 * existing user stays signed in across the update and no plaintext token
 * lingers afterwards.
 *
 * Web keeps plain AsyncStorage: browser token storage has no Keychain
 * equivalent, and the app's web surface is a preview aid, not the shipped
 * iOS build.
 */

const ENCRYPTION_KEY_STORE_KEY = 'amen_supabase_encryption_key';
const SECURE_PREFIX = 'amen_secure_';

async function getEncryptionKey(): Promise<Uint8Array | null> {
  try {
    let hex = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY);
    if (!hex) {
      const bytes = await Crypto.getRandomBytesAsync(32);
      hex = aesjs.utils.hex.fromBytes(bytes);
      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, hex);
    }
    return aesjs.utils.hex.toBytes(hex);
  } catch {
    return null;
  }
}

function encrypt(key: Uint8Array, text: string): string {
  const textBytes = aesjs.utils.utf8.toBytes(text);
  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(5));
  return aesjs.utils.hex.fromBytes(aesCtr.encrypt(textBytes));
}

function decrypt(key: Uint8Array, hex: string): string {
  const encryptedBytes = aesjs.utils.hex.toBytes(hex);
  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(5));
  return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(encryptedBytes));
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }

  const encrypted = await AsyncStorage.getItem(SECURE_PREFIX + key);
  if (encrypted) {
    const encryptionKey = await getEncryptionKey();
    if (!encryptionKey) {
      // Keychain unreadable: the ciphertext is useless without its key.
      // Returning null signs the user out rather than leaking or guessing.
      return null;
    }
    try {
      return decrypt(encryptionKey, encrypted);
    } catch {
      return null;
    }
  }

  // One-time migration from the plain-AsyncStorage era.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy) {
    await setItem(key, legacy);
    return legacy;
  }
  return null;
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }

  const encryptionKey = await getEncryptionKey();
  if (!encryptionKey) {
    // SecureStore unavailable (no lock screen, restricted device). Decision:
    // fail OPEN (keep the app working) but telemetered, not silent — a
    // bricked sign-in is worse than a plaintext token on a device whose
    // Keychain is already unusable, and the fallback must be visible in
    // production telemetry, not just a dev warning. The require() is lazy
    // on purpose: a static import would cycle (crashReporter → supabase →
    // this adapter).
    if (__DEV__) {
      console.warn('[SecureStorage] SecureStore unavailable — storing auth value unencrypted');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reportError } = require('./crashReporter') as typeof import('./crashReporter');
      reportError('[SecureStorage]', new Error('SecureStore unavailable — auth value stored unencrypted'), { key });
    } catch {
      // Telemetry must never break sign-in.
    }
    await AsyncStorage.setItem(key, value);
    return;
  }

  await AsyncStorage.setItem(SECURE_PREFIX + key, encrypt(encryptionKey, value));
  // Drop any legacy plaintext copy of the same key.
  await AsyncStorage.removeItem(key);
}

async function removeItem(key: string): Promise<void> {
  await AsyncStorage.multiRemove([SECURE_PREFIX + key, key]);
}

/**
 * Deletes the Keychain encryption key itself. Call on sign-out and account
 * deletion: without it, the next account on the device would reuse the
 * previous account's key scope. The next sign-in generates a fresh key, and
 * any stale ciphertext left behind decrypts to null (treated as no session).
 */
async function deleteStoredEncryptionKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORE_KEY);
  } catch {
    // Best effort — sign-out must not fail on key deletion.
  }
}

/**
 * Removes the stored Supabase session directly from AsyncStorage.
 * supabase-js signOut is NOT guaranteed to do this: its _signOut returns
 * early (verified in the installed auth-js source) when the server-side
 * revoke fails with anything other than 404/401/403 — without calling
 * _removeSession. On a network failure or 500, signOut throws AND the
 * tokens stay. Sign-out and delete-account call this after the signOut
 * attempt so local tokens never survive a failed server round-trip.
 * Suffix-matched, so it covers both the encrypted (SECURE_PREFIX + key)
 * and plaintext-fallback copies, plus the PKCE code verifier.
 */
async function clearStoredAuthSession(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sessionKeys = keys.filter(
      (key) => key.endsWith('-auth-token') || key.endsWith('-auth-token-code-verifier'),
    );
    if (sessionKeys.length > 0) {
      await AsyncStorage.multiRemove(sessionKeys);
    }
  } catch {
    // Best effort — sign-out must not fail on session cleanup.
  }
}

/** Drop-in `storage` adapter for supabase-js `auth.storage`. */
export const supabaseAuthStorage = {
  getItem,
  setItem,
  removeItem,
};

export { deleteStoredEncryptionKey, clearStoredAuthSession };
