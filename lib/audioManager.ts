import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const isWeb = Platform.OS === 'web';
const AUDIO_DIR = !isWeb && (FileSystem as any).documentDirectory ? `${(FileSystem as any).documentDirectory}amen_audio/` : '';

export class AudioManager {
  static async init() {
    if (isWeb || !AUDIO_DIR) return;
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
    }
  }

  static async getLocalUri(id: string, remoteUri: string): Promise<string> {
    if (isWeb || !AUDIO_DIR) return remoteUri;
    
    await this.init();
    const localUri = `${AUDIO_DIR}${id}.mp3`;
    
    // Check if it already exists
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      return localUri;
    }

    // Try downloading if it doesn't
    try {
      const { uri } = await FileSystem.downloadAsync(remoteUri, localUri);
      return uri;
    } catch (e) {
      console.warn(`Failed to download audio track ${id}, falling back to remote`, e);
      return remoteUri;
    }
  }

  static async prefetchAccessoryAudio() {
    if (isWeb || !AUDIO_DIR) return;
    
    await this.init();
    for (const option of SOUNDSCAPE_OPTIONS) {
      const localUri = `${AUDIO_DIR}${option.id}.mp3`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        try {
          // Download in background
          await FileSystem.downloadAsync(option.uri, localUri);
        } catch (error) {
          console.warn(`Background audio prefetch failed for ${option.id}`, error);
        }
      }
    }
  }
}
