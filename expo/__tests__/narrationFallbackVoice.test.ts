// Nice-to-have (i): the device-voice fallback picks an Enhanced voice
// for the app's speech locale via getAvailableVoicesAsync, at pitch
// 0.97 — while the RATE stays the caller's speechRate (the Kai-approved
// 2026-10-26 unified fallback formula), not a fixed 0.90.
// Production code reads the RN global __DEV__; jest does not define it.
(global as unknown as { __DEV__: boolean }).__DEV__ = true;
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(async () => 'deadbeef'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/narration.mp3' } }),
      }),
    },
  },
}));
// Empty baked index: every text misses the baked lookup, so speakText
// falls through to the device voice under test.
jest.mock('@/services/narrationIndex', () => ({
  BAKED_BY_HASH: {},
  SELAH_LOOPS: {},
}));

// jest.mock calls above are hoisted, so these imports must follow them.
// eslint-disable-next-line import/first
import * as Speech from 'expo-speech';
// eslint-disable-next-line import/first
import {
  __resetFallbackVoiceForTests,
  speakText,
  stopSpokenAudio,
} from '../services/narration';

const mockedSpeechSpeak = Speech.speak as unknown as jest.Mock;
const mockedGetVoices = Speech.getAvailableVoicesAsync as unknown as jest.Mock;

type VoiceStub = {
  identifier: string;
  name: string;
  quality: string;
  language: string;
};

function installVoiceMocks(voices: VoiceStub[]) {
  mockedGetVoices.mockResolvedValue(voices);
}

describe('speakText device-voice fallback (Enhanced voice)', () => {
  beforeEach(() => {
    mockedSpeechSpeak.mockClear();
    mockedGetVoices.mockClear();
    __resetFallbackVoiceForTests();
  });

  afterEach(() => {
    stopSpokenAudio();
  });

  it('picks the Enhanced en-US voice at pitch 0.97, keeping the caller rate', async () => {
    installVoiceMocks([
      { identifier: 'default-en-us', name: 'Default', quality: 'Default', language: 'en-US' },
      { identifier: 'enhanced-en-gb', name: 'Enhanced GB', quality: 'Enhanced', language: 'en-GB' },
      { identifier: 'enhanced-en-us', name: 'Enhanced US', quality: 'Enhanced', language: 'en-US' },
    ]);
    const started = await speakText('I am a beloved child of God.', { speechRate: 0.6 });
    expect(started).toBe(true);
    expect(mockedSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockedSpeechSpeak).toHaveBeenCalledWith(
      'I am a beloved child of God.',
      expect.objectContaining({
        voice: 'enhanced-en-us',
        language: 'en-US',
        rate: 0.6,
        pitch: 0.97,
      }),
    );
  });

  it('falls back to a Default voice when no Enhanced voice exists', async () => {
    installVoiceMocks([
      { identifier: 'default-en-us', name: 'Default', quality: 'Default', language: 'en-US' },
    ]);
    const started = await speakText('I am a beloved child of God.', { speechRate: 0.6 });
    expect(started).toBe(true);
    expect(mockedSpeechSpeak).toHaveBeenCalledWith(
      'I am a beloved child of God.',
      expect.objectContaining({ voice: 'default-en-us', pitch: 0.97 }),
    );
  });

  it('speaks with the OS default voice when the voice lookup fails', async () => {
    mockedGetVoices.mockRejectedValue(new Error('no voices'));
    const started = await speakText('I am a beloved child of God.', { speechRate: 0.6 });
    expect(started).toBe(true);
    expect(mockedSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(mockedSpeechSpeak.mock.calls[0][1]).not.toHaveProperty('voice');
    expect(mockedSpeechSpeak.mock.calls[0][1]).toMatchObject({ pitch: 0.97, rate: 0.6 });
  });
});
