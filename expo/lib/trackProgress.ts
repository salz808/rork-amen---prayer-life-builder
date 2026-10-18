import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_TRACK_ID, getTrack } from '@/mocks/tracks';

const ACTIVE_TRACK_KEY = '@triad/activeTrackId';
const TRACK_PROGRESS_KEY = '@triad/trackProgress';

/** Per-track day progress: { [trackId]: currentDay } */
type TrackProgress = Record<string, number>;

async function readProgress(): Promise<TrackProgress> {
  try {
    const raw = await AsyncStorage.getItem(TRACK_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as TrackProgress) : {};
  } catch {
    return {};
  }
}

async function writeProgress(p: TrackProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(TRACK_PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Local-only; never block the journey on a storage failure.
  }
}

export async function getActiveTrackId(): Promise<string> {
  try {
    const id = await AsyncStorage.getItem(ACTIVE_TRACK_KEY);
    if (id && getTrack(id)?.status === 'live') return id;
  } catch {
    // fall through to default
  }
  return DEFAULT_TRACK_ID;
}

export async function setActiveTrackId(trackId: string): Promise<void> {
  const track = getTrack(trackId);
  if (!track || track.status !== 'live') return;
  try {
    await AsyncStorage.setItem(ACTIVE_TRACK_KEY, trackId);
  } catch {
    // non-fatal
  }
}

export async function getTrackDay(trackId: string): Promise<number> {
  const progress = await readProgress();
  const day = progress[trackId] ?? 1;
  const track = getTrack(trackId);
  const max = track?.dayCount ?? 30;
  return Math.max(1, Math.min(day, max));
}

export async function setTrackDay(trackId: string, day: number): Promise<void> {
  const track = getTrack(trackId);
  if (!track) return;
  const clamped = Math.max(1, Math.min(day, track.dayCount));
  const progress = await readProgress();
  progress[trackId] = clamped;
  await writeProgress(progress);
}

export async function isTrackComplete(trackId: string): Promise<boolean> {
  const track = getTrack(trackId);
  if (!track) return false;
  const day = await getTrackDay(trackId);
  return day >= track.dayCount;
}
