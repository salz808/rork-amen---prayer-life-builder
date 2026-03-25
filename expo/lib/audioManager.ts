import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const isWeb = Platform.OS === 'web';
const AUDIO_DIR = !isWeb ? `${FileSystem.Paths.document.uri}amen_audio/` : '';

export class AudioManager {
  static init() {
    if (isWeb || !AUDIO_DIR) return;
    const dir = new FileSystem.Directory(AUDIO_DIR);
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
  }

  static async getLocalUri(id: string, remoteUri: string): Promise<string> {
    if (isWeb || !AUDIO_DIR) return remoteUri;
    
    this.init();
    const localUri = `${AUDIO_DIR}${id}.mp3`;
    const file = new FileSystem.File(localUri);
    
    // Check if it already exists
    if (file.exists) {
      return localUri;
    }

    // Try downloading if it doesn't
    try {
      const downloadedFile = await FileSystem.File.downloadFileAsync(remoteUri, file, { idempotent: true });
      return downloadedFile.uri;
    } catch (e) {
      console.warn(`Failed to download audio track ${id}, falling back to remote`, e);
      return remoteUri;
    }
  }

  static async prefetchAccessoryAudio() {
    if (isWeb || !AUDIO_DIR) return;
    
    this.init();
    for (const option of SOUNDSCAPE_OPTIONS) {
      const localUri = `${AUDIO_DIR}${option.id}.mp3`;
      const file = new FileSystem.File(localUri);
      if (!file.exists) {
        try {
          // Download in background
          await FileSystem.File.downloadFileAsync(option.uri, file, { idempotent: true });
        } catch (error) {
          console.warn(`Background audio prefetch failed for ${option.id}`, error);
        }
      }
    }
  }
}
