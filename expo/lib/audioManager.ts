import { File, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const isWeb = Platform.OS === 'web';

// Lazy prefetch runs at most once per app lifetime: the first Sleep
// Prayer open triggers it, and repeat opens are a no-op (the files are
// already cached or the Wi-Fi gate already declined them this launch).
let accessoryPrefetchAttempted = false;

function getAudioDir(): Directory | null {
  if (isWeb) return null;
  try {
    return new Directory(Paths.document, 'amen_audio');
  } catch {
    return null;
  }
}

export class AudioManager {
  static ensureDir(): void {
    const dir = getAudioDir();
    if (!dir) return;
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
  }

  static async getLocalUri(id: string, remoteUri: string): Promise<string> {
    if (isWeb) return remoteUri;
    try {
      AudioManager.ensureDir();
      const dir = getAudioDir();
      if (!dir) return remoteUri;
      const file = new File(dir, `${id}.mp3`);
      if (file.exists) {
        return file.uri;
      }
      const downloaded = await File.downloadFileAsync(remoteUri, file, { idempotent: true });
      return downloaded.uri;
    } catch {
      if (__DEV__) {
        console.warn(`Failed to cache audio track ${id}, falling back to remote`);
      }
      return remoteUri;
    }
  }

  /**
   * Lazy accessory-audio prefetch (2026-11-16): called when the user
   * first opens Sleep Prayer — the only screen that plays soundscapes —
   * never at app launch. Wi-Fi-gated (the files are 4–10 MB each, so an
   * any-network prefetch could burn cellular data); a NetInfo failure
   * skips rather than prefetching blind. Runs at most once per launch.
   * Skipping is safe: soundscape playback downloads on demand via
   * getLocalUri.
   */
  static async ensureAccessoryAudioPrefetched(): Promise<void> {
    if (isWeb || accessoryPrefetchAttempted) return;
    accessoryPrefetchAttempted = true;
    try {
      const net = await NetInfo.fetch();
      if (net.isConnected && net.type === 'wifi') {
        await AudioManager.prefetchAccessoryAudio();
      } else if (__DEV__) {
        console.log('[AudioManager] Skipping soundscape prefetch (not on Wi-Fi)');
      }
    } catch {
      // NetInfo unavailable — skip; on-demand download still works.
    }
  }

  static async prefetchAccessoryAudio(): Promise<void> {
    if (isWeb) return;
    try {
      AudioManager.ensureDir();
      const dir = getAudioDir();
      if (!dir) return;
      for (const option of SOUNDSCAPE_OPTIONS) {
        try {
          const file = new File(dir, `${option.id}.mp3`);
          if (!file.exists) {
            await File.downloadFileAsync(option.uri, file, { idempotent: true });
          }
        } catch {
          if (__DEV__) {
            console.warn(`Background audio prefetch failed for ${option.id}`);
          }
        }
      }
    } catch {
    }
  }
}
