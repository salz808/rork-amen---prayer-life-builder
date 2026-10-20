import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_TRACK_ID, getTrack } from '@/mocks/tracks';
import { prayerDayKey } from '@/lib/prayerDay';

const ACTIVE_TRACK_KEY = '@triad/activeTrackId';
const TRACK_PROGRESS_KEY = '@triad/trackProgress';
const TRACK_COMPLETIONS_KEY = '@triad/trackCompletions';

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

/* ── Completion records + pacing ───────────────────────────────────────────
 * Per-track record of the most recent completed day and the prayer day it
 * was completed on. Pacing rule (Kai, 2026-10-20): one day per day — the
 * next uncompleted day unlocks on the next prayer day (4 AM local) after
 * the previous completion. Users who progressed before records existed are
 * grandfathered: with no record, the frontier day is available now and
 * pacing applies from their next completion forward. */

export interface TrackCompletion {
  day: number;
  prayerDay: string;
}

type TrackCompletions = Record<string, TrackCompletion>;

async function readCompletions(): Promise<TrackCompletions> {
  try {
    const raw = await AsyncStorage.getItem(TRACK_COMPLETIONS_KEY);
    return raw ? (JSON.parse(raw) as TrackCompletions) : {};
  } catch {
    return {};
  }
}

export async function recordTrackCompletion(trackId: string, day: number): Promise<void> {
  try {
    const completions = await readCompletions();
    const existing = completions[trackId];
    if (existing && existing.day >= day) return; // replays never move the record backwards
    completions[trackId] = { day, prayerDay: prayerDayKey() };
    await AsyncStorage.setItem(TRACK_COMPLETIONS_KEY, JSON.stringify(completions));
  } catch {
    // Local-only; never block the journey on a storage failure.
  }
}

export async function getLastTrackCompletion(trackId: string): Promise<TrackCompletion | null> {
  const completions = await readCompletions();
  return completions[trackId] ?? null;
}

/**
 * Reliable completion: the final day has an actual completion record.
 * (The legacy frontier value clamps at dayCount, so it cannot distinguish
 * "on the final day" from "finished it" — records can.)
 */
export async function isTrackFullyComplete(trackId: string): Promise<boolean> {
  const track = getTrack(trackId);
  if (!track) return false;
  const last = await getLastTrackCompletion(trackId);
  return last ? last.day >= track.dayCount : false;
}

export interface FrontierStatus {
  /** The next uncompleted day (clamped to the track length). */
  day: number;
  /** Completed days count for progress display. */
  completedDays: number;
  /** Whether the frontier day can be started right now. */
  available: boolean;
  /** Whether the track is fully complete. */
  isComplete: boolean;
  /** The most recent completion, if any. */
  lastCompletion: TrackCompletion | null;
}

export async function getFrontierStatus(trackId: string): Promise<FrontierStatus> {
  const track = getTrack(trackId);
  const dayCount = track?.dayCount ?? 30;
  const frontier = await getTrackDay(trackId);
  const last = await getLastTrackCompletion(trackId);

  const completedDays = Math.max(last?.day ?? 0, frontier - 1);
  const isComplete = (last?.day ?? 0) >= dayCount;

  // Pacing: the frontier is the day after the last completion. It unlocks
  // only when a new prayer day has begun since that completion. No record
  // (grandfathered) or a record behind the frontier → available now.
  let available = true;
  if (!isComplete && last && last.day === frontier - 1) {
    available = prayerDayKey() > last.prayerDay;
  }

  return { day: frontier, completedDays, available, isComplete, lastCompletion: last };
}

/* ── Gating ────────────────────────────────────────────────────────────────
 * Kai's decision (2026-10-20): non-Foundations journeys are visible but
 * LOCKED until Foundations is finished. Once Foundations is complete, every
 * live track unlocks permanently and switching is free. */

/** Foundations completion from AppProvider progress entries. */
export function foundationsCompleteFromProgress(
  progress: { completed: boolean }[],
  journeyComplete: boolean = false,
): boolean {
  if (journeyComplete) return true;
  return progress.filter((p) => p.completed).length >= 30;
}

/** Whether a track is behind the Foundations gate right now. */
export function isTrackGated(trackId: string, foundationsComplete: boolean): boolean {
  if (trackId === DEFAULT_TRACK_ID) return false;
  return !foundationsComplete;
}

/**
 * The track the app should actually run: if the stored active track is
 * gated (e.g. selected before gating shipped), fall back to Foundations
 * until the gate opens.
 */
export function resolveEffectiveTrackId(activeId: string, foundationsComplete: boolean): string {
  return isTrackGated(activeId, foundationsComplete) ? DEFAULT_TRACK_ID : activeId;
}
