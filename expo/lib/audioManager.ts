import { File, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const isWeb = Platform.OS === 'web';

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
    } catch (e) {
      console.warn(`Failed to cache audio track ${id}, falling back to remote`, e);
      return remoteUri;
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
        } catch (error) {
          console.warn(`Background audio prefetch failed for ${option.id}`, error);
        }
      }
    } catch {
    }
  }
}
