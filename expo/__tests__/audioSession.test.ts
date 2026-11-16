import { setAudioModeAsync } from 'expo-audio';
import { __resetAudioSessionForTests, ensurePlaybackAudioMode } from '../lib/audioSession';

jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn().mockResolvedValue(undefined) }));

const mockedSetAudioMode = setAudioModeAsync as jest.Mock;

describe('ensurePlaybackAudioMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAudioSessionForTests();
  });

  it('sets playsInSilentMode + duckOthers so audio plays on silent and other apps duck under it', async () => {
    await ensurePlaybackAudioMode();
    expect(mockedSetAudioMode).toHaveBeenCalledWith({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  });

  it('configures only once per launch', async () => {
    await ensurePlaybackAudioMode();
    await ensurePlaybackAudioMode();
    expect(mockedSetAudioMode).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of staying unconfigured', async () => {
    mockedSetAudioMode.mockRejectedValueOnce(new Error('no session'));
    await ensurePlaybackAudioMode();
    await ensurePlaybackAudioMode();
    expect(mockedSetAudioMode).toHaveBeenCalledTimes(2);
    expect(mockedSetAudioMode).toHaveBeenLastCalledWith({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  });
});
