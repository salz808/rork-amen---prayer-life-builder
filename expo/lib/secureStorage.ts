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
 * Audit must-fix #11 (2026-10-24): the original encryption used AES-CTR
 * with a FIXED counter (5) and the same per-device key for every value, so
 * the session token and the PKCE verifier shared a keystream prefix — XOR
 * of two ciphertexts equals XOR of the plaintexts, and CTR is malleable
 * (no authentication). Every value now gets a fresh random 16-byte counter
 * IV and a SHA-256 keyed tag over iv+ciphertext, stored as
 * `v2:<ivHex>:<ctHex>:<tagHex>`. Legacy values (fixed counter, no tag) and
 * plaintext values are decrypted once and re-stored in the v2 format, so
 * an existing user stays signed in across the update and no weak copy
 * lingers afterwards.
 *
 * SecureStore-unavailable fallback is MEMORY-ONLY (never plaintext): the
 * session survives while the app runs and is lost on restart, which forces
 * one re-login instead of writing a usable token to unencrypted storage.
 *
 * Web keeps plain AsyncStorage: browser token storage has no Keychain
 * equivalent, and the app's web surface is a preview aid, not the shipped
 * iOS build.
 */

const ENCRYPTION_KEY_STORE_KEY = 'amen_supabase_encryption_key';
const SECURE_PREFIX = 'amen_secure_';

// Memory-only fallback store, used only when SecureStore is unavailable
// (no lock screen / restricted device). Never persisted anywhere.
const memoryStore = new Map<string, string>();

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

async function computeTag(key: Uint8Array, ivHex: string, ctHex: string): Promise<string> {
  const keyHex = aesjs.utils.hex.fromBytes(key);
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${keyHex}:${ivHex}:${ctHex}`,
  );
}

async function encrypt(key: Uint8Array, text: string): Promise<string> {
  const iv = await Crypto.getRandomBytesAsync(16);
  const ivHex = aesjs.utils.hex.fromBytes(iv);
  const textBytes = aesjs.utils.utf8.toBytes(text);
  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const ctHex = aesjs.utils.hex.fromBytes(aesCtr.encrypt(textBytes));
  const tag = await computeTag(key, ivHex, ctHex);
  return `v2:${ivHex}:${ctHex}:${tag}`;
}

async function decrypt(key: Uint8Array, stored: string): Promise<string> {
  if (stored.startsWith('v2:')) {
    const [, ivHex, ctHex, tag] = stored.split(':');
    if (!ivHex || !ctHex || !tag) throw new Error('Malformed v2 ciphertext');
    const expectedTag = await computeTag(key, ivHex, ctHex);
    if (expectedTag !== tag) throw new Error('Ciphertext tag mismatch');
    const iv = aesjs.utils.hex.toBytes(ivHex);
    const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(aesjs.utils.hex.toBytes(ctHex)));
  }
  // Legacy format: fixed counter, no tag. Decrypted once, then re-stored
  // in v2 format by the getItem caller below.
  const encryptedBytes = aesjs.utils.hex.toBytes(stored);
  const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(5));
  return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(encryptedBytes));
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }

  // Memory-only fallback value (SecureStore was unavailable at write time).
  if (memoryStore.has(key)) {
    return memoryStore.get(key) ?? null;
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
      const plaintext = await decrypt(encryptionKey, encrypted);
      if (!encrypted.startsWith('v2:')) {
        // One-time upgrade: legacy fixed-counter value -> v2 format.
        await setItem(key, plaintext);
      }
      return plaintext;
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
    // SecureStore unavailable (no lock screen, restricted device). Audit
    // must-fix #11 decision: MEMORY-ONLY, never plaintext. The session
    // works while the app runs and is lost on restart (one re-login),
    // which is strictly better than a usable token in unencrypted
    // storage. Telemetered, not silent. The require() is lazy on purpose:
    // a static import would cycle (crashReporter → supabase → this adapter).
    if (__DEV__) {
      console.warn('[SecureStorage] SecureStore unavailable — holding auth value in memory only');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reportError } = require('./crashReporter') as typeof import('./crashReporter');
      reportError('[SecureStorage]', new Error('SecureStore unavailable — auth value held in memory only'), { key });
    } catch {
      // Telemetry must never break sign-in.
    }
    memoryStore.set(key, value);
    // Make sure no plaintext copy lingers anywhere.
    await AsyncStorage.multiRemove([SECURE_PREFIX + key, key]);
    return;
  }

  await AsyncStorage.setItem(SECURE_PREFIX + key, await encrypt(encryptionKey, value));
  // Drop any legacy plaintext copy — and any stale memory-only copy, so a
  // later getItem can never return a superseded session.
  memoryStore.delete(key);
  await AsyncStorage.removeItem(key);
}

async function removeItem(key: string): Promise<void> {
  memoryStore.delete(key);
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
    // Memory-only copies first (a SecureStore-less session lives here).
    for (const key of [...memoryStore.keys()]) {
      if (key.endsWith('-auth-token') || key.endsWith('-auth-token-code-verifier')) {
        memoryStore.delete(key);
      }
    }
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
