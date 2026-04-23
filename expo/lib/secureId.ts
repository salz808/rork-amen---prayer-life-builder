import * as Crypto from 'expo-crypto';

function getRandomBytes(length: number): Uint8Array {
  try {
    const bytes = Crypto.getRandomBytes(length);
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    const g = globalThis as unknown as {
      crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
    };
    if (g.crypto?.getRandomValues) {
      const out = new Uint8Array(length);
      g.crypto.getRandomValues(out);
      return out;
    }
    const fallback = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      fallback[i] = Math.floor(Math.random() * 256);
    }
    return fallback;
  }
}

export function generateSecureId(): string {
  try {
    if (typeof Crypto.randomUUID === 'function') {
      return Crypto.randomUUID();
    }
  } catch {
    // fall through to manual uuid
  }

  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
