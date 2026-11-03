// Wave 2, fix 3 (feedback #6/#43): a baked-player stall must not sit
// silent on "STOP". The baked path resolves true on play() and only
// learns of failure via the playback listener — so a player that emits
// neither an error nor a playing status needs a watchdog that falls
// back to the device voice.
// Production code reads the RN global __DEV__; jest does not define it.
(global as unknown as { __DEV__: boolean }).__DEV__ = true;
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
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
jest.mock('@/services/narrationIndex', () => ({
  BAKED_BY_HASH: { deadbeef: 'track/d01/file.mp3' },
  SELAH_LOOPS: {},
}));

// jest.mock calls above are hoisted, so these imports must follow them.
// eslint-disable-next-line import/first
import { createAudioPlayer } from 'expo-audio';
// eslint-disable-next-line import/first
import * as Speech from 'expo-speech';
// eslint-disable-next-line import/first
import { SPEAK_STALL_TIMEOUT_MS, speakText, stopSpokenAudio } from '../services/narration';

const mockedCreateAudioPlayer = createAudioPlayer as unknown as jest.Mock;
const mockedSpeechSpeak = Speech.speak as unknown as jest.Mock;

type Listener = (status: Record<string, unknown>) => void;

function installFakePlayer() {
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    setPlaybackRate: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  mockedCreateAudioPlayer.mockReturnValue(player);
  return player;
}

function capturedListener(player: { addListener: jest.Mock }): Listener {
  expect(player.addListener).toHaveBeenCalledTimes(1);
  return player.addListener.mock.calls[0][1] as Listener;
}

describe('speakText baked-player stall watchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedCreateAudioPlayer.mockClear();
    mockedSpeechSpeak.mockClear();
  });

  afterEach(() => {
    stopSpokenAudio();
    jest.useRealTimers();
  });

  it('falls back to the device voice when no playing status arrives', async () => {
    const player = installFakePlayer();
    const started = await speakText('I am a beloved child of God.', {
      rate: 1,
      speechRate: 0.6,
    });
    expect(started).toBe(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(mockedSpeechSpeak).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(SPEAK_STALL_TIMEOUT_MS);

    expect(mockedSpeechSpeak).toHaveBeenCalledTimes(1);
    expect(player.release).toHaveBeenCalled();
  });

  it('stands the watchdog down once playback is confirmed playing', async () => {
    const player = installFakePlayer();
    await speakText('I am a beloved child of God.', { rate: 1, speechRate: 0.6 });
    capturedListener(player)({ playing: true, currentTime: 0 });

    await jest.advanceTimersByTimeAsync(SPEAK_STALL_TIMEOUT_MS * 2);

    expect(mockedSpeechSpeak).not.toHaveBeenCalled();
  });

  it('still falls back immediately on a playback error (pre-existing path)', async () => {
    const player = installFakePlayer();
    await speakText('I am a beloved child of God.', { rate: 1, speechRate: 0.6 });
    capturedListener(player)({ error: 'boom' });

    expect(mockedSpeechSpeak).toHaveBeenCalledTimes(1);
  });
});
