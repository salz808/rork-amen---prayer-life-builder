import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Alert, AppState as RNAppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AppState, UserProfile, DayProgress, Soundscape, FontSize, WeeklyReflection, AnsweredPrayer, PrayerRequest, DailyPrayerLogEntry, PhaseLogEntry, ThemePreference, ConnectionCheckin, CarriedPrayer , UserTier } from '@/types';
import { generateSecureId } from '@/lib/secureId';
import { DEFAULT_SOUNDSCAPE } from '@/constants/soundscapes';
import { CHECKLIST_ITEMS } from '@/mocks/checklist';
import { getJourneyEncouragementNotification, getWinbackMessage } from '@/mocks/encouragements';
import { AppSync } from '@/lib/sync/appSync';
import { DatabaseService } from '@/lib/database';
import { isHeldWallPost, supportCardVariantForHold } from '@/lib/moderation';
import type { SupportCardVariant } from '@/lib/moderation';
import { getSafeSession, supabase } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';
import { computeReminderTriggers, parseReminderTime } from '@/lib/reminderSchedule';
import { getTierFromEntitlements, hasFeature, normalizeEntitlements } from '@/services/entitlements';
import { getWriteReviewUrl, showAppReviewPrompt } from '@/lib/appStoreReview';
import { prayerDayKey, shiftPrayerDayKey, prayerDayDifference, countCoveredStreak } from '@/lib/prayerDay';
import { publishFoundationsProgress } from '@/lib/journeyTogether';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteStoredEncryptionKey, clearStoredAuthSession } from '@/lib/secureStorage';
import { clearAppQueryCache } from '@/lib/appQueryClient';
import { reportError } from '@/lib/crashReporter';
import { refreshTruthWidget } from '@/lib/truthWidget';



// Pre-launch audit M-3: journey-derived First Steps auto-marks — the
// 30-day completion mark (awarded in completeDay when day 30 lands) and
// the streak-derived peace mark (awarded at a 3+ day streak). Both claims
// are false on a fresh journey / new pass until re-earned, so reset and
// second pass drop exactly these two. Everything else is kept: genuinely
// user-ticked items, and single-day auto-marks (looked-up / saved verse,
// prayed out loud) that a new pass re-earns on its very first completed
// day. The fresh firstStepsUpdatedAt stamp matters: checklist merge is
// last-write-wins by stamp (syncService SYNC-6), so without it the cloud's
// stale list would win back the dropped marks on the next sync.
const JOURNEY_DERIVED_CHECKLIST_IDS = ['prayer-completed-30-days', 'inner-experienced-peace'];
const dropJourneyDerivedChecklistMarks = (ids: string[] | undefined, now: string) => ({
  firstStepsCompletedIds: (ids ?? []).filter((id) => !JOURNEY_DERIVED_CHECKLIST_IDS.includes(id)),
  firstStepsUpdatedAt: now,
});

const defaultState: AppState = {
  user: null,
  currentDay: 1,
  progress: [],
  streakCount: 0,
  lastCompletedDate: null,
  journeyComplete: false,
  ambientMuted: false,
  soundscape: DEFAULT_SOUNDSCAPE,
  darkMode: true,
  fontSize: 'normal',
  lastOpenedDate: null,
  openStreakCount: 0,
  reflections: [],
  phaseTimings: {},
  phaseLog: [],
  answeredPrayers: [],
  prayerRequests: [],
  dailyPrayerLog: [],
  journeyPass: 1,
  isSubscriber: false,
  entitlements: [],
  tierLevel: UserTier.FREE,
  voiceoverEnabled: false,
  playbackRate: 1,
  monaticTheme: false,
  themePreference: 'fireside',
  declarationFavorites: [],
  firstStepsCompletedIds: [],
  // Audit round 4, SYNC-3/SYNC-5/SYNC-6: tombstones, reset/clear
  // markers, and the checklist last-write stamp (see types/index.ts).
  syncTombstones: [],
  journeyResetAt: null,
  completionClearedAt: null,
  firstStepsUpdatedAt: null,
  graceDaysUsed: [],
  connectionCheckins: [],
  carriedPrayers: [],
  wallAmenedLocal: [],
  prayerStartTimes: [],
  adaptiveReminderEnabled: true,
  subscribedSinceMonthly: null,
  hasRatedPrompted: false,
  lastActivityAt: null,
  activeSession: null,
};

/**
 * The app's one and only "what day is it" — the prayer day (4 AM local,
 * lib/prayerDay.ts), the same boundary the journey tracks use. Foundations
 * gating, streaks, grace days, check-ins, and the daily prayer log all key
 * off this. (Before the unification this was the UTC calendar date, which
 * flipped the day in the middle of the evening for most users.)
 */
function getDateString(date: Date = new Date()): string {
  return prayerDayKey(date);
}

function areStatesEqual(left: AppState, right: AppState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canUseGraceDay(graceDaysUsed: string[]): boolean {
  // 1 grace day per calendar month
  const thisMonth = getDateString().slice(0, 7);
  return !graceDaysUsed.some((d) => d.startsWith(thisMonth));
}

/** Journey days on which the "how connected do you feel" check-in is offered. */
const CHECKIN_DAYS = [1, 5, 10, 15, 21, 26, 30];

/* ── Adaptive reminders ────────────────────────────────────────────────────
 * The reminder drifts toward when the user genuinely prays: a rolling mean
 * of recent session START times, clamped to a sane window. The user's manual
 * time is always respected — adaptive only moves when real prayer times have
 * drifted well past it (45+ minutes), and the Settings toggle turns it off.
 * Notifications themselves are free and never paywalled.
 */
const ADAPTIVE_WINDOW_MINUTES = 5 * 60;        // 5:00 AM floor
const ADAPTIVE_CEILING_MINUTES = 23 * 60 + 30; // 11:30 PM ceiling
const ADAPTIVE_MIN_SESSIONS = 5;
const ADAPTIVE_SHIFT_THRESHOLD_MINUTES = 45;
const ADAPTIVE_MAX_SESSIONS = 30;
const ADAPTIVE_RECENT_DAYS = 14;

function clampAdaptiveMinutes(minutes: number): number {
  return Math.min(Math.max(minutes, ADAPTIVE_WINDOW_MINUTES), ADAPTIVE_CEILING_MINUTES);
}

/** Parses "8:00 PM" into minutes since midnight; null when unparseable. */
function parseReminderToMinutes(reminderTime: string): number | null {
  const [timePart, period] = reminderTime.trim().split(' ');
  if (!timePart || (period !== 'AM' && period !== 'PM')) return null;
  const [hourRaw, minuteRaw] = timePart.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour % 12 * 60 + (period === 'PM' ? 720 : 0) + minute;
}

/** Formats minutes since midnight back into "8:00 PM" style. */
function formatReminderMinutes(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Rolls the reminder toward recent prayer-session start times.
 * Returns a new reminderTime only when there are enough recent sessions and
 * the mean has drifted at least 45 minutes from the current time.
 */
function computeAdaptiveReminderTime(startTimes: string[], currentReminderTime: string): string | null {
  const cutoff = Date.now() - ADAPTIVE_RECENT_DAYS * 86400000;
  const minutesOfDay = startTimes
    .filter((iso) => {
      const t = Date.parse(iso);
      return Number.isFinite(t) && t >= cutoff;
    })
    .map((iso) => {
      const d = new Date(iso);
      return clampAdaptiveMinutes(d.getHours() * 60 + d.getMinutes());
    });

  if (minutesOfDay.length < ADAPTIVE_MIN_SESSIONS) return null;

  const mean = minutesOfDay.reduce((sum, m) => sum + m, 0) / minutesOfDay.length;
  const current = parseReminderToMinutes(currentReminderTime);
  if (current === null) return null;

  if (Math.abs(mean - current) < ADAPTIVE_SHIFT_THRESHOLD_MINUTES) return null;
  return formatReminderMinutes(mean);
}


function calculateStreak(progress: DayProgress[], lastCompletedDate: string | null, graceDaysUsed: string[] = []): number {
  if (!lastCompletedDate) return 0;

  // Audit round 4, SYNC-9: a future lastCompletedDate (device clock
  // ahead, or a direct-API write) used to fall in the "not recent"
  // branch and zero the displayed streak until a newer real completion
  // landed. Treat the future as today.
  const today0 = getDateString();
  if (lastCompletedDate > today0) {
    lastCompletedDate = today0;
  }

  const today = getDateString();
  const yesterday = shiftPrayerDayKey(today, -1);
  const twoDaysAgo = shiftPrayerDayKey(today, -2);

  // Grace day: extend window if available
  const graceAvailable = canUseGraceDay(graceDaysUsed);
  const threeDaysAgo = shiftPrayerDayKey(today, -3);

  if (lastCompletedDate !== today && lastCompletedDate !== yesterday && lastCompletedDate !== twoDaysAgo && !(graceAvailable && lastCompletedDate === threeDaysAgo)) {
    return 0;
  }

  let streak = 0;
  const completedDayKeys = [...progress]
    .filter(p => p.completed && p.completedAt)
    // Bucket by the prayer's own prayer day — completion instants are
    // absolute, so historical entries land on their true prayer day.
    .map(p => prayerDayKey(new Date(p.completedAt!)));

  if (completedDayKeys.length === 0) return 0;

  const checkDate = lastCompletedDate === today ? today : lastCompletedDate;
  // Round-5 lane-3 H2: the old loop walked progress entries only, so a
  // grace day (which has no progress entry) broke the chain and the
  // first completion after it collapsed the streak to the post-gap run.
  // The shared walk counts grace days as coverage (see countCoveredStreak:
  // a grace day banks one forgiveness for a missing older day, it does
  // not itself add to the total), so Mon complete → Tue missed → Wed
  // grace → Thu complete preserves the run instead of resetting it.
  streak = countCoveredStreak(completedDayKeys, graceDaysUsed, checkDate);

  return Math.max(streak, 1);
}

/**
 * One-time re-base of stored day-keys from UTC calendar dates to prayer
 * days (4 AM local). Everything derivable is rebuilt from the records'
 * own timestamps, so history is preserved exactly — a completion counts
 * on the prayer day it actually happened, and no streak can reset
 * because of the switch itself. Records without timestamps (grace days,
 * phase log) keep their stored keys; they age out naturally and the
 * difference is at most the old UTC offset. Idempotent.
 */
function migrateToPrayerDayBoundary(loaded: AppState): AppState {
  if (loaded.prayerDayBoundaryMigrated) return loaded;

  // lastCompletedDate: re-derive from the newest completion instant.
  // Audit round 4, SYNC-9: future instants are ignored here, so a
  // clock-ahead device cannot push lastCompletedDate into the future.
  const completedInstants = (loaded.progress ?? [])
    .filter((p) => p.completed && p.completedAt)
    .map((p) => new Date(p.completedAt!).getTime())
    .filter((t) => Number.isFinite(t) && t <= Date.now());
  let lastCompletedDate = completedInstants.length > 0
    ? prayerDayKey(new Date(Math.max(...completedInstants)))
    : loaded.lastCompletedDate;
  // A grace day can push lastCompletedDate past the last real completion
  // (a covered day with no progress entry). Preserve that gap as a day
  // count in the new system rather than snapping back to the completion,
  // so a grace-held streak survives the switch untouched.
  if (lastCompletedDate && loaded.lastCompletedDate) {
    const gap = prayerDayDifference(lastCompletedDate, loaded.lastCompletedDate);
    if (gap > 0) {
      lastCompletedDate = shiftPrayerDayKey(lastCompletedDate, gap);
    }
  }

  // Daily prayer log: re-key each entry to its completion's prayer day,
  // then restore the one-entry-per-day shape (newest wins), newest first.
  const seenDates = new Set<string>();
  const dailyPrayerLog = [...(loaded.dailyPrayerLog ?? [])]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .reduce<DailyPrayerLogEntry[]>((acc, entry) => {
      const date = prayerDayKey(new Date(entry.completedAt));
      if (seenDates.has(date)) return acc;
      seenDates.add(date);
      acc.push({ ...entry, date });
      return acc;
    }, []);

  // Connection check-ins: same re-key, one per prayer day, newest first.
  const seenCheckinDates = new Set<string>();
  const connectionCheckins = [...(loaded.connectionCheckins ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .reduce<ConnectionCheckin[]>((acc, checkin) => {
      const date = prayerDayKey(new Date(checkin.createdAt));
      if (seenCheckinDates.has(date)) return acc;
      seenCheckinDates.add(date);
      acc.push({ ...checkin, date });
      return acc;
    }, []);

  // lastOpenedDate has no timestamp of its own — anchor it to the most
  // recent known activity so the open-streak comparison stays honest.
  const activityInstants = [
    ...completedInstants,
    ...(loaded.dailyPrayerLog ?? []).map((e) => new Date(e.completedAt).getTime()),
  ].filter((t) => Number.isFinite(t));
  const lastOpenedDate = loaded.lastOpenedDate && activityInstants.length > 0
    ? prayerDayKey(new Date(Math.max(...activityInstants)))
    : loaded.lastOpenedDate;

  return {
    ...loaded,
    lastCompletedDate,
    dailyPrayerLog,
    connectionCheckins,
    lastOpenedDate,
    prayerDayBoundaryMigrated: true,
  };
}

// Audit must-fix #7: cancel every scheduled notification EXCEPT the
// neglected-phase one-off (data.kind === 'neglected_phase'). The old
// cancelAll wiped that reminder on every daily-reminder reschedule
// (completeDay, Daily Prayer completion, sign-in). New daily reminders are
// tagged data.kind === 'daily' below; legacy daily reminders (scheduled
// before tagging) have no kind, so they are still cancelled here — only
// the neglected-phase reminder is preserved.
async function cancelAllExceptNeglectedPhase() {
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind !== 'neglected_phase')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function scheduleReminderNotificationInner(reminderTime: string, nextDay: number = 1) {
  if (Platform.OS === 'web') return;

  try {
    const Notifications = await import('expo-notifications');

    if (!reminderTime.trim()) {
      await cancelAllExceptNeglectedPhase();
      if (__DEV__) {
        console.log('[Notifications] Reminder time cleared, cancelled scheduled notifications');
      }
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) {
        console.log('[Notifications] Permission not granted. Reminders will not be scheduled.');
      }
      return;
    }

    await cancelAllExceptNeglectedPhase();

    // Date math lives in lib/reminderSchedule (pure + unit-tested); the
    // copy and scheduling below are unchanged from the original loop.
    const triggers = computeReminderTriggers(reminderTime, nextDay);
    if (triggers.length === 0 && !parseReminderTime(reminderTime)) {
      if (__DEV__) {
        console.log('[Notifications] Invalid reminder time, skipping schedule', { reminderTime });
      }
      return;
    }

    let scheduledCount = 0;

    for (const trigger of triggers) {
      // Lapsed-user winback: after 3 consecutive days of unanswered
      // reminders we layer in winback copy.
      const winback = getWinbackMessage(scheduledCount + 1, trigger.journeyDay);
      const body = winback ?? getJourneyEncouragementNotification(trigger.journeyDay).message;
      const title = winback ? 'We saved your spot' : 'TRIAD Prayer';

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data: { kind: 'daily' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger.date,
        },
      });

      scheduledCount += 1;
    }

    if (__DEV__) {
      console.log('[Notifications] Scheduled daily encouragement notifications', {
        reminderTime,
        nextDay,
        scheduledCount,
      });
    }
  } catch (e) {
    if (__DEV__) {
      console.log('[Notifications] Failed to schedule:', e);
    }
  }
}

// Round-2 H2: serialize reminder scheduling through one promise chain.
// scheduleReminderNotificationInner cancels then awaits ~60 sequential
// schedules; concurrent fire-and-forget callers (hydration, sign-in,
// completion, manual edit) used to interleave cancel/schedule windows
// and double-book 60 days of reminders. Queued runs execute in order;
// the chain itself never sticks on a failure, and callers keep their
// fire-and-forget call shape (they await nothing).
let reminderScheduleChain: Promise<void> = Promise.resolve();
function scheduleReminderNotification(reminderTime: string, nextDay: number = 1): Promise<void> {
  const run = reminderScheduleChain.then(() => scheduleReminderNotificationInner(reminderTime, nextDay));
  reminderScheduleChain = run.catch(() => {});
  return run;
}

export { scheduleReminderNotification };

// Round-3 A-L2: drain helper for sign-out / delete-account. Awaiting
// the chain tail lets an in-flight scheduling run finish before the
// cancel below, so it cannot re-schedule after the wipe. (The chain
// tail never rejects: it is run.catch(() => {}).)
function drainReminderScheduleChain(): Promise<void> {
  return reminderScheduleChain;
}

// Round-2 M1/M2 foreground-reschedule bookkeeping: last permission state
// seen on foreground, and the last foreground reschedule instant. A
// foreground reschedule fires when permission flipped to granted (the
// heal path for a grant made in Settings) or when the schedule is stale
// (>10 min), which also re-anchors wall-clock drift after travel/DST.
let lastForegroundPermission: string | null = null;
let lastForegroundRescheduleAt = 0;

// Round-3 A-M1: direct-write profile/preferences to the cloud from
// the edit setters, serialized through a module-level promise chain
// exactly as H2 does for reminders, so concurrent pushes execute in
// order. Profile edits are per-field updates (see
// DatabaseService.updateProfileFields), NOT full-row upserts: two
// edits queued before a re-render used to carry stale closure
// snapshots, and the last writer overwrote the other's field.
// RESIDUAL WINDOW (corrected round-3 rule — the round-2 report's
// recovery claim was wrong): this push is NOT under SyncService's
// isSyncing lock, so a direct-write landing between a sync's cloud
// load and its upload is overwritten once by that in-flight upload.
// Only a FRESH EDIT heals that overwrite (it re-direct-writes);
// autosync does NOT heal it — it re-merges cloud-wins against the
// old cloud row and re-uploads the old value, so the edit visibly
// reverts on the next launch until edited again. Bounded to one
// in-flight sync and one edit. Gated on a live, matching session
// user so a guest toggle can never mint an anonymous profile row;
// failures report to crash reporting and fall back to autosync.
let profilePushChain: Promise<void> = Promise.resolve();
// Round-5 lane-3 M5: ids of answered prayers whose testimony-share state
// has already been reconciled against the server (see
// reconcileTestimonyShares). Capped at the newest 500 on write.
const TESTIMONY_RECONCILE_CHECKED_KEY = '@triad/testimonyShareReconciledIds';
async function pushProfileAndPreferencesToCloud(
  userPatch: {
    displayName?: string | null;
    reminderTime?: string;
  } | null | undefined,
  preferences: {
    fontSize?: 'normal' | 'large';
    ambientMuted?: boolean;
    soundscape?: string;
    themePreference?: string;
    voiceoverEnabled?: boolean;
    adaptiveReminderEnabled?: boolean;
    playbackRate?: number;
  } | undefined,
): Promise<void> {
  const run = profilePushChain.then(() => pushProfileAndPreferencesInner(userPatch, preferences));
  profilePushChain = run.catch(() => {});
  return run;
}
async function pushProfileAndPreferencesInner(
  userPatch: {
    displayName?: string | null;
    reminderTime?: string;
  } | null | undefined,
  preferences: {
    fontSize?: 'normal' | 'large';
    ambientMuted?: boolean;
    soundscape?: string;
    themePreference?: string;
    voiceoverEnabled?: boolean;
    adaptiveReminderEnabled?: boolean;
    playbackRate?: number;
  } | undefined,
): Promise<void> {
  try {
    const session = await getSafeSession();
    if (!session?.user || session.user.is_anonymous === true) return;
    // Round-5 lane-3 M2: record the user edit BEFORE the network
    // attempt (awaited, so a kill after this line still leaves the
    // record), so an offline failure or a kill mid-push leaves a pending
    // record the next merge applies instead of cloud-wins reverting an
    // edit the UI already showed as saved. mergeStates drops the record
    // once a cloud load shows the edit landed.
    if (userPatch) {
      await SyncService.recordPendingProfileEdit(session.user.id, userPatch);
    }
    if (userPatch) {
      try {
        await DatabaseService.updateProfileFields(userPatch);
      } catch (error) {
        reportError('ProfileDirectWrite', error instanceof Error ? error : new Error(String(error)), { label: 'updateProfileFields' });
      }
    }
    if (preferences !== undefined) {
      try {
        await DatabaseService.updatePreferences(preferences);
      } catch (error) {
        reportError('ProfileDirectWrite', error instanceof Error ? error : new Error(String(error)), { label: 'updatePreferences' });
      }
    }
  } catch (error) {
    // Round-3 A-L5: report session-read failures only. The silent
    // guest/anonymous/mismatch returns above stay silent by design;
    // a transient session-read failure degrading to autosync-only
    // deserves a crash-reporting signal.
    reportError('ProfileDirectWrite', error instanceof Error ? error : new Error(String(error)), { label: 'getSafeSession' });
  }
}

function getDayDifference(fromDateString: string, toDateString: string): number {
  return prayerDayDifference(fromDateString, toDateString);
}

function getMostRecentDailyPrayerEntry(entries: DailyPrayerLogEntry[]): DailyPrayerLogEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => (
    new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
  ))[0] ?? null;
}

function getDailyPrayerDayForDate(date: string, entries: DailyPrayerLogEntry[]): number {
  const existingEntry = entries.find((entry) => entry.date === date);
  if (existingEntry) {
    return existingEntry.day;
  }

  const previousDay = getMostRecentDailyPrayerEntry(entries)?.day ?? null;
  const seed = date.split('').reduce((total, character, index) => {
    return total + character.charCodeAt(0) * (index + 1);
  }, 0);

  let nextDay = (seed % 30) + 1;
  if (previousDay !== null && nextDay === previousDay) {
    nextDay = (nextDay % 30) + 1;
  }

  return nextDay;
}

export const [AppProvider, useApp] = createContextHook(() => {
  const [state, setState] = useState<AppState>(defaultState);

  // Support card (wall moderation, 00019 holds): one card rendered
  // once from the root layout, driven by this context state, so the
  // community composer, the session Ask share, and the journal
  // testimony share/retry all surface the same card. AppProvider
  // itself renders no JSX (context hook only); the modal lives in
  // RootLayoutNav, which sits inside this provider. Requesting a
  // card never publishes anything — the held post stays held.
  const [supportCardVariant, setSupportCardVariant] = useState<SupportCardVariant | null>(null);
  const requestSupportCard = useCallback((variant: SupportCardVariant) => {
    setSupportCardVariant(variant);
  }, []);
  const dismissSupportCard = useCallback(() => {
    setSupportCardVariant(null);
  }, []);

  // Audit round 3, J-S13: set when the cloud load failed, so the screen
  // never presents a defaulted state as the user's real state — no
  // persistence, no onboarding redirect, no cloud upload while set. The
  // ref mirrors it for callbacks that can't depend on state identity.
  const stateLoadFailedRef = useRef(false);
  const [stateLoadFailed, setStateLoadFailed] = useState(false);
  const flagStateLoadFailed = useCallback(() => {
    stateLoadFailedRef.current = true;
    setStateLoadFailed(true);
  }, []);
  // Audit round 4, SYNC-4/Low L3: cloud failure blocks UPLOADS only
  // (stateLoadFailedRef), never local persistence — the old code used
  // one flag for both, so one offline sign-in suppressed every local
  // save for the session. syncFailed is the user-visible sync-failure
  // signal, fed by SyncService and folded into stateLoadError below.
  const [syncFailed, setSyncFailed] = useState(false);
  useEffect(() => {
    return SyncService.onSyncFailureChange((failed) => setSyncFailed(failed));
  }, []);

  const stateQuery = useQuery({
    queryKey: ['appState'],
    queryFn: async (): Promise<AppState> => {
      // Audit round 4, SYNC-4: reset the failure flags per query run —
      // the old code never cleared them, so one transient failure
      // poisoned every later sign-in in the same session.
      stateLoadFailedRef.current = false;
      setStateLoadFailed(false);
      try {
        // Round-2 L3: a kill between the server delete and local wipe
        // leaves a blob + session behind. deleteAccount writes this
        // marker BEFORE invoking the server function (and clears it on
        // both failure and completed cleanup), so a marker present at
        // launch means exactly that kill window: wipe local state and
        // session without syncing, then clear the marker.
        try {
          const pendingDelete = await AsyncStorage.getItem('triad_delete_pending_v1');
          if (pendingDelete) {
            AppSync.suppressSync = true;
            try {
              await SyncService.clearLocalState();
            } catch {
              // Best effort — the session clear below is the guarantee.
            }
            try {
              await clearStoredAuthSession();
            } catch {
              // Best effort.
            }
            try {
              await AsyncStorage.removeItem('triad_delete_pending_v1');
            } catch {
              // Best effort.
            }
          }
        } catch {
          // Best effort — normal initialization continues below.
        }
        // 1. Core initialization (AsyncStorage load + Full Cloud Sync)
        const initialState = await SyncService.initialize(defaultState);

        // 2. Orchestrated Sync Logic (Supabase + Anonymous Login)
        const finalInitialState = await AppSync.initializeSync(initialState);

        // Audit round 3, J-S13: initializeSync returns the local state
        // (unpushed) when the cloud load failed — flag it so the session
        // never persists or uploads that defaulted state.
        if (DatabaseService.lastLoadFailed) {
          flagStateLoadFailed();
        }

        if (finalInitialState !== defaultState) {
          // Re-base legacy UTC day-keys onto prayer days before anything
          // computes with them (one-time, timestamp-derived, idempotent).
          const migratedState = migrateToPrayerDayBoundary(finalInitialState);
          const streak = calculateStreak(migratedState.progress, migratedState.lastCompletedDate, migratedState.graceDaysUsed ?? []);

          const themePreference = migratedState.themePreference ?? (migratedState.monaticTheme ? 'monastic' : 'fireside');

          return {
            ...defaultState,
            ...migratedState,
            darkMode: true,
            themePreference,
            monaticTheme: themePreference === 'monastic',
            streakCount: streak,
          };
        }
        return defaultState;
      } catch (error) {
        if (__DEV__) {
          console.error('[AppProvider] Failed to load state:', error);
        }
        // Audit round 3, J-S13: any query failure presents as a
        // brand-new user — flag it like a cloud load failure.
        flagStateLoadFailed();
        return defaultState;
      }
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (newState: AppState) => {
      try {
        await SyncService.saveLocalState(newState);
        void AppSync.backgroundSync(newState);
        return newState;
      } catch (error) {
        if (__DEV__) {
          console.error('[AppProvider] Failed to save state:', error);
        }
        return newState;
      }
    },
  });
  // Audit round 4, SYNC-4: persistence is NEVER blocked by a cloud
  // failure. The round-3 rule (a defaulted state must never overwrite
  // local storage) is now enforced where it belongs: saveLocalState
  // refuses unstamped persists with no live session, and uploads are
  // gated separately by stateLoadFailedRef (see the RevenueCat listener
  // and syncToCloud's load-failure skip). Blocking local saves on a
  // cloud error lost real in-memory progress on kill.
  const { mutate: saveState } = saveMutation;
  const persistState = useCallback((next: AppState) => {
    saveState(next);
  }, [saveState]);

  const hasHydratedRef = useRef(false);
  const stateRef = useRef(state);
  // Audit round 4, SYNC-7: hydration generation. A slow query for user
  // A resolving after the SIGNED_IN refetch for user B started used to
  // poison B's session for its lifetime (the effect never verified
  // data.user.id vs the live session, and bailed forever after one run).
  const hydrationGenerationRef = useRef(0);

  useEffect(() => {
    if (!stateQuery.data || hasHydratedRef.current) {
      return;
    }
    const generation = ++hydrationGenerationRef.current;
    // Verify against the LIVE session before applying: stale data for
    // another user is ignored, not hydrated. Settlement (below) still
    // clears the gate for the current generation on failure — a failed
    // hydration falls back to local-only mode with uploads blocked by
    // stateLoadFailedRef, not bricked by a stuck hydrationPending.
    void (async () => {
      const session = await getSafeSession();
      if (generation !== hydrationGenerationRef.current) return;
      const dataUserId = stateQuery.data?.user?.id ?? null;
      if (dataUserId && session?.user?.id && dataUserId !== session.user.id) {
        return;
      }
      setState((prev) => {
        if (areStatesEqual(prev, stateQuery.data)) {
          return prev;
        }

        return stateQuery.data;
      });
      hasHydratedRef.current = true;
      // Audit round 4, SYNC-4: clear on SETTLEMENT, not only on
      // success. The upload block for a failed load is
      // stateLoadFailedRef / syncToCloud's load-failure skip, not a
      // permanently stuck hydrationPending.
      SyncService.hydrationPending = false;
      SyncService.hydrationUserId = stateQuery.data?.user?.id ?? session?.user?.id ?? null;
      // Audit round 3, J-B14 (kept): re-schedule the daily reminder
      // from the hydrated preference — permission checked, never
      // requested, here.
      const hydrated = stateQuery.data;
      if (hydrated?.user?.reminderTime && Platform.OS !== 'web') {
        void (async () => {
          try {
            const Notifications = await import('expo-notifications');
            const { status } = await Notifications.getPermissionsAsync();
            if (status === 'granted') {
              await scheduleReminderNotification(hydrated.user!.reminderTime!, hydrated.currentDay);
            }
          } catch {
            // Best effort — the reminder settings flow re-schedules.
          }
        })();
      }
    })();
  }, [stateQuery.data]);

  // Audit round 4, SYNC-4: refetch on foreground + reconnect when the
  // load failed. The old code had retry:false and no refetch anywhere,
  // so a user who signed in offline stayed bricked until restart.
  useEffect(() => {
    const onForeground = (nextState: string) => {
      if (nextState === 'active' && stateLoadFailedRef.current) {
        void refetchRef.current();
      }
      // Round-2 M1/M2: foreground reschedule. The old listener only
      // refetched on load failure, so a timezone/DST move kept firing at
      // old absolute instants, and a permission granted in Settings
      // never healed reminders until the next completion or manual edit.
      // Runs through the H2 lock, so it cannot double-book.
      if (nextState === 'active') {
        void (async () => {
          try {
            if (Platform.OS === 'web') return;
            const s = stateRef.current;
            if (!s.user?.reminderTime) return;
            const Notifications = await import('expo-notifications');
            const { status } = await Notifications.getPermissionsAsync();
            const flippedToGranted = status === 'granted' && lastForegroundPermission !== 'granted';
            const stale = Date.now() - lastForegroundRescheduleAt > 10 * 60 * 1000;
            lastForegroundPermission = status;
            if (status === 'granted' && (flippedToGranted || stale)) {
              lastForegroundRescheduleAt = Date.now();
              await scheduleReminderNotification(s.user.reminderTime, s.currentDay);
            }
          } catch {
            // Best effort — the reminder settings flow re-schedules.
          }
        })();
      }
    };
    const appStateSub = RNAppState.addEventListener('change', onForeground);
    const netUnsubscribe = NetInfo.addEventListener((net) => {
      if (net.isConnected && stateLoadFailedRef.current) {
        void refetchRef.current();
      }
    });
    return () => {
      appStateSub.remove();
      netUnsubscribe();
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Foundations Together: keep a tiny published progress summary fresh for
  // prayer circles — on load (app open) and whenever a completed day moves
  // the numbers. The publisher dedupes unchanged summaries and quietly
  // no-ops until the journey-progress migration has run.
  const progressPublishSignature = `${state.progress.filter((p) => p.completed).length}|${state.currentDay}|${state.streakCount}|${state.lastCompletedDate ?? ''}`;
  useEffect(() => {
    if (stateQuery.isLoading || !hasHydratedRef.current) return;
    void publishFoundationsProgress({
      currentDay: state.currentDay,
      lastCompletedPrayerDay: state.lastCompletedDate,
      currentStreak: state.streakCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressPublishSignature, stateQuery.isLoading]);

  useEffect(() => {
    if (!state.user?.id) return;

    const getCurrentState = () => stateRef.current;
    SyncService.startAutoSync(getCurrentState);

    return () => {
      SyncService.stopAutoSync();
    };
  }, [state.user?.id]);

  useEffect(() => {
    if (stateQuery.isLoading) return;
    const today = getDateString();
    if (state.lastOpenedDate === today) return;

    const dayDiff = state.lastOpenedDate ? getDayDifference(state.lastOpenedDate, today) : 1;
    const nextOpenStreakCount = dayDiff === 1 ? state.openStreakCount + 1 : 1;

    setState(prev => {
      const nextState: AppState = {
        ...prev,
        lastOpenedDate: today,
        openStreakCount: nextOpenStreakCount,
      };
      setTimeout(() => persistState(nextState), 0);
      return nextState;
    });
  }, [state.lastOpenedDate, state.openStreakCount, stateQuery.isLoading, persistState]);

  // Audit round 3, J-S18: journal/favorite mutations used to compute the
  // next list from render-closure state, so two rapid taps before a
  // re-render computed from the same snapshot and the second overwrote
  // the first. updateState now also accepts a function, so mutations can
  // compute from the true previous state (React applies functional
  // updaters in order). Object updates are unchanged.
  const updateState = useCallback((updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => {
    setState(prev => {
      const resolved = typeof updates === 'function'
        ? (updates as (prev: AppState) => Partial<AppState>)(prev)
        : updates;
      const next = { ...prev, ...resolved };
      if (areStatesEqual(prev, next)) {
        return prev;
      }
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  // Round-5 lane-3 M5: reconcile kill-mid-testimony-share limbo. If the
  // app was killed after createTestimony inserted server-side but before
  // the success handler ran, the entry is left with NEITHER shared NOR
  // testimonyShareFailed set — the post exists publicly, the journal
  // shows no share state and offers no retry. On hydration (once per
  // user), unmarked entries are checked against the server dedup lookup;
  // entries with a matching post are marked shared (no duplicate post:
  // a later retry would hit the J-S17 dedup anyway). Entries already
  // checked are remembered in AsyncStorage, so each launch only queries
  // NEW unmarked entries instead of re-querying every never-shared
  // entry forever. A failed lookup never marks an entry checked, so it
  // is retried on the next launch. Silent and best-effort: reconcile
  // must never break launch. Residual (unrecoverable locally): killed
  // after the share fired but before the local record's persist flush —
  // the public post exists with no local answered-prayer record at all.
  const testimonyReconcileUserRef = useRef<string | null>(null);
  const reconcileTestimonyShares = useCallback(async () => {
    try {
      const session = await getSafeSession();
      if (!session?.user || session.user.is_anonymous === true) return;
      const entries = stateRef.current.answeredPrayers ?? [];
      const unmarked = entries.filter((p) => p.shared !== true && p.testimonyShareFailed !== true);
      if (unmarked.length === 0) return;
      let checkedIds: string[] = [];
      try {
        const raw = await AsyncStorage.getItem(TESTIMONY_RECONCILE_CHECKED_KEY);
        checkedIds = raw ? (JSON.parse(raw) as string[]) : [];
      } catch {
        checkedIds = [];
      }
      const checked = new Set(checkedIds);
      const candidates = unmarked.filter((p) => !checked.has(p.id));
      if (candidates.length === 0) return;
      const results = await Promise.all(candidates.map(async (entry) => {
        try {
          const found = await DatabaseService.hasOwnTestimony(entry.request, entry.answer);
          return { id: entry.id, found, ok: true };
        } catch {
          return { id: entry.id, found: false, ok: false };
        }
      }));
      const confirmedIds = new Set(results.filter((r) => r.found).map((r) => r.id));
      const newlyChecked = results.filter((r) => r.ok).map((r) => r.id);
      if (confirmedIds.size > 0) {
        updateState((prev) => ({
          answeredPrayers: (prev.answeredPrayers ?? []).map((p) =>
            confirmedIds.has(p.id) ? { ...p, shared: true, testimonyShareFailed: false } : p),
        }));
      }
      if (newlyChecked.length > 0) {
        try {
          const next = Array.from(new Set([...checkedIds, ...newlyChecked])).slice(-500);
          await AsyncStorage.setItem(TESTIMONY_RECONCILE_CHECKED_KEY, JSON.stringify(next));
        } catch {
          // Best effort — the next launch simply re-checks.
        }
      }
    } catch {
      // Best effort — reconcile must never break launch.
    }
  }, [updateState]);

  useEffect(() => {
    const userId = state.user?.id ?? null;
    if (!userId) {
      testimonyReconcileUserRef.current = null;
      return;
    }
    if (!hasHydratedRef.current) return;
    if (testimonyReconcileUserRef.current === userId) return;
    testimonyReconcileUserRef.current = userId;
    void reconcileTestimonyShares();
  }, [state.user?.id, reconcileTestimonyShares]);

  // Audit round 3, J-B2: tracks the last auth user id across events so
  // a fresh SIGNED_IN can be told apart from a session restore. The ref
  // (not prev.user) is the signal: during hydration prev.user is still
  // null for a restored veteran session.
  const lastAuthUserIdRef = useRef<string | null>(null);

  // Audit round 3, J-B1: refetch via a ref so the auth subscription
  // below never re-subscribes (the query result object is not a stable
  // effect dep).
  const refetchRef = useRef(stateQuery.refetch);
  useEffect(() => {
    refetchRef.current = stateQuery.refetch;
  });

  useEffect(() => {
    const syncRevenueCatIdentity = async (userId: string | null) => {
      try {
        if (userId) {
          // Audit must-fix #2: NEVER log in with the Supabase user id —
          // that id is published on the public wall, so anyone could claim
          // another subscriber's entitlements. Use the opaque per-profile
          // alias id instead (minted by migration 20261025000004). If no
          // alias can be established, stay FREE rather than leak the id.
          const aliasId = await DatabaseService.getRevenueCatAliasId();
          await Purchases.logIn(aliasId);
          const customerInfo = await Purchases.getCustomerInfo();
          const activeEntitlements = normalizeEntitlements(Object.keys(customerInfo.entitlements.active));
          const tier = getTierFromEntitlements(activeEntitlements);
          updateState({
            isSubscriber: activeEntitlements.length > 0,
            entitlements: activeEntitlements,
            tierLevel: tier,
            voiceoverEnabled: activeEntitlements.length > 0 ? stateRef.current.voiceoverEnabled : false,
            // Seasonal theme is available to everyone — only Monastic needs Partner.
            themePreference: stateRef.current.themePreference === 'monastic' && tier < UserTier.PARTNER ? 'fireside' : (stateRef.current.themePreference ?? 'fireside'),
            monaticTheme: tier >= UserTier.PARTNER && stateRef.current.themePreference === 'monastic',
          });
          return;
        }

        await Purchases.logOut();
        updateState({
          isSubscriber: false,
          entitlements: [],
          tierLevel: UserTier.FREE,
          voiceoverEnabled: false,
          themePreference: 'fireside',
          monaticTheme: false,
        });
      } catch (error) {
        // Audit: a silent identity-sync failure used to leave a paying user
        // at FREE for a whole session. Report it so it is visible in
        // production (the next auth-state change retries the sync).
        reportError('RevenueCatIdentitySync', error instanceof Error ? error : new Error(String(error)));
        if (__DEV__) {
          console.log('[AppProvider] RevenueCat identity sync failed', error);
        }
        // Audit round 4, fix lane 3 (D-M-5): a failed sync must never
        // leave the PREVIOUS account's tier in place. Without this reset,
        // a sign-in over a previous session (no intervening sign-out)
        // plus a transient alias-RPC failure left the RC SDK logged in
        // as the old account and the UI showing the old tier — and a
        // purchase made in that window was attributed to the wrong RC
        // customer. Reset to FREE and detach the SDK identity
        // (best-effort: the FREE reset is the guarantee, logOut is
        // belt-and-braces).
        updateState({
          isSubscriber: false,
          entitlements: [],
          tierLevel: UserTier.FREE,
          voiceoverEnabled: false,
        });
        try {
          await Purchases.logOut();
        } catch {
          // Best effort — the state reset above already fail-closed.
        }
      }
    };



    const handleUserUpdate = (sessionUser: any, event?: string) => {
      if (!sessionUser) {
        // Audit round 4, lane 2 (M3): passive sign-out (expiry / remote
        // revocation) must wipe local disk state like explicit sign-out
        // does — a user whose session expired reasonably believes they
        // are signed out. The getSafeSession re-check guards against
        // wiping on a transient blip that merely looks like a sign-out;
        // a surviving session cancels the wipe.
        const hadUser = stateRef.current.user?.id ?? null;
        if (hadUser) {
          void (async () => {
            try {
              const live = await getSafeSession();
              if (live?.user) return;
            } catch {
              // Session unreadable: do not wipe on an unverified signal.
              return;
            }
            try {
              await SyncService.clearLocalState();
            } catch {
              // Best effort — the in-memory reset below still runs.
            }
            try {
              await AsyncStorage.removeItem('triad_age_attested_v1');
            } catch {
              // Best effort.
            }
            clearAppQueryCache();
          })();
        }
        lastAuthUserIdRef.current = null;
        SyncService.hydrationUserId = null;
        void syncRevenueCatIdentity(null);
        setState(prev => {
          if (prev.user?.id) {
            const next = { ...prev, user: null };
            setTimeout(() => persistState(next), 0);
            return next;
          }
          return prev;
        });
        return;
      }

      // A fresh sign-in (different id than the last auth event, or no
      // prior event) must NOT inherit "onboarding complete" — the old
      // `?? true` default let a brand-new account skip onboarding
      // entirely, because handleUserUpdate runs before hydration loads
      // the cloud profile. A restore (same id, INITIAL_SESSION, or the
      // launch-time session check) keeps the previous value, so veterans
      // never flash the onboarding screen; the J-B1 reload then restores
      // their true flag from the cloud profile.
      const isFreshSignIn = event === 'SIGNED_IN' && lastAuthUserIdRef.current !== sessionUser.id;
      const authUserChanged = lastAuthUserIdRef.current !== null && lastAuthUserIdRef.current !== sessionUser.id;
      lastAuthUserIdRef.current = sessionUser.id;

      // Audit round 4, fix lane 3 (D-M-5): a different account signing in
      // must not briefly inherit the previous account's tier. Reset to
      // FREE here, BEFORE the async identity sync starts, so no UI or
      // purchase path can ever observe the old tier under the new user
      // (the sync overwrites with the new account's real tier on success,
      // and its catch now also resets to FREE on failure).
      if (authUserChanged) {
        updateState({
          isSubscriber: false,
          entitlements: [],
          tierLevel: UserTier.FREE,
          voiceoverEnabled: false,
        });
      }

      // Audit round 4, lane 2 (AUTH-3): a fresh sign-in must not inherit
      // the device attestation flag from the previous account. Clear it
      // unless this new account's server record is already set (in which
      // case the server-first startup gate passes without the flag) or
      // the flag is stamped with this user's own id (this session's own
      // modal confirm, RPC still in flight).
      if (isFreshSignIn) {
        void (async () => {
          try {
            const attested = await DatabaseService.getAgeAttested();
            if (attested) return;
            const flag = await AsyncStorage.getItem('triad_age_attested_v1');
            if (flag !== `1:${sessionUser.id}`) {
              await AsyncStorage.removeItem('triad_age_attested_v1');
            }
          } catch {
            // Attestation unreadable: leave the flag; the server-first
            // startup gate still prompts before any wall write is gated
            // on it, and the wall-write gate checks the server record.
          }
        })();
      }

      void syncRevenueCatIdentity(sessionUser.id);

      setState(prev => {
        const currentUser = prev.user;
        const nextUser: UserProfile = {
          id: sessionUser.id,
          firstName: sessionUser.user_metadata?.first_name || currentUser?.firstName || '',
          displayName: currentUser?.displayName || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name,
          onboardingComplete: isFreshSignIn ? false : (currentUser?.onboardingComplete ?? true),
          prayerLife: currentUser?.prayerLife || 'new',
          reminderTime: currentUser?.reminderTime || sessionUser.user_metadata?.reminder_time,
          blocker: currentUser?.blocker || sessionUser.user_metadata?.blocker,
        };
        const next = { ...prev, user: nextUser };
        if (areStatesEqual(prev, next)) {
          return prev;
        }
        setTimeout(() => persistState(next), 0);
        return next;
      });
    };

    // Audit round 4, lane 2 (M4): retry a pending server-side sign-out
    // revoke from a previous failed sign-out — but only if the surviving
    // session belongs to the same user the marker names. Otherwise the
    // marker just clears (a new account must never be signed out by an
    // old account's retry).
    void (async () => {
      try {
        const pendingUid = await AsyncStorage.getItem('triad_signout_revoke_pending_v1');
        if (!pendingUid) return;
        const live = await getSafeSession();
        if (live?.user?.id === pendingUid) {
          try {
            await supabase.auth.signOut();
          } catch {
            // Keep the marker: a later launch retries again.
            return;
          }
        }
        await AsyncStorage.removeItem('triad_signout_revoke_pending_v1');
      } catch {
        // Best effort — revocation retry must never block launch.
      }
    })();

    void getSafeSession().then((session) => {
      if (session?.user) {
        handleUserUpdate(session.user);
      }
    });

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const result = supabase.auth.onAuthStateChange((event, session) => {
        handleUserUpdate(session?.user, event);
        // Audit round 3, J-B1: a sign-out → sign-in used to leave the
        // provider on the previous session's state forever (hydration
        // bails after its first run) while sync uploaded that stale
        // state over the new user's cloud stats. Re-run hydration for
        // the new user, with uploads gated until it lands. Skipped
        // before the first hydration (launch restore) — the initial
        // query already covers that session.
        if (event === 'SIGNED_IN' && session?.user && hasHydratedRef.current) {
          SyncService.hydrationPending = true;
          SyncService.hydrationUserId = null;
          AppSync.suppressSync = true;
          hasHydratedRef.current = false;
          void refetchRef.current();
        }
      });
      subscription = result.data.subscription;
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] onAuthStateChange unavailable:', error);
      }
    }

    return () => {
      try {
        subscription?.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [updateState, persistState]);

  // RevenueCat Subscription Listener
  useEffect(() => {
    const handleCustomerInfo = (info: CustomerInfo) => {
      const activeEntitlements = normalizeEntitlements(Object.keys(info.entitlements.active));
      const isSubbed = activeEntitlements.length > 0;
      const tier = getTierFromEntitlements(activeEntitlements);

      updateState({
        isSubscriber: isSubbed,
        entitlements: activeEntitlements,
        tierLevel: tier,
        voiceoverEnabled: isSubbed ? stateRef.current.voiceoverEnabled : false,
        // Seasonal theme is available to everyone — only Monastic needs Partner.
        themePreference: stateRef.current.themePreference === 'monastic' && tier < UserTier.PARTNER ? 'fireside' : (stateRef.current.themePreference ?? 'fireside'),
        monaticTheme: tier >= UserTier.PARTNER && stateRef.current.themePreference === 'monastic',
        // Audit round 3, J-S20: a lapsed user (no active entitlement) also
        // drops back to the free soundscape and default playback speed —
        // the old code left a premium soundscape and a custom speed
        // active after the subscription ended. Lower tiers keep their own
        // unlocked soundscapes; only the fully-lapsed case resets.
        ...(isSubbed ? {} : { soundscape: DEFAULT_SOUNDSCAPE, playbackRate: 1 }),
      });

      // Sync to Supabase if logged in (use ref to avoid stale closure).
      // Audit round 3, J-S13: never upload while the load failed — the
      // ref state may be a defaulted stand-in, not the user's state.
      if (stateRef.current.user?.id && !stateLoadFailedRef.current) {
        void SyncService.syncToCloud({
          ...stateRef.current,
          isSubscriber: isSubbed,
          entitlements: activeEntitlements,
          tierLevel: tier,
        });
      }
    };

    let pListener: any;
    try {
      pListener = Purchases.addCustomerInfoUpdateListener(handleCustomerInfo);

      // Initial check
      Purchases.getCustomerInfo().then(handleCustomerInfo).catch((err: any) => {
        if (__DEV__) {
          console.log('[AppProvider] Failed to fetch initial CustomerInfo', err);
        }
      });
    } catch (error) {
      if (__DEV__) {
        console.log('[AppProvider] RevenueCat not available', error);
      }
    }

    return () => {
      try {
        if (pListener?.remove) {
          pListener.remove();
        } else {
          Purchases.removeCustomerInfoUpdateListener(handleCustomerInfo);
        }
      } catch {
        // Listener may not exist
      }
    };
  }, [updateState]);

  const isPartner = useMemo(() => {
    return normalizeEntitlements(state.entitlements).includes('partner');
  }, [state.entitlements]);

  const completeOnboarding = useCallback((user: UserProfile) => {
    // First launch starts fresh — but never wipe an existing journey: if a
    // user with real progress is ever routed back through onboarding, the
    // old unconditional reset destroyed their streak and days.
    const existing = stateRef.current;
    const hasProgress =
      (existing.progress?.length ?? 0) > 0 ||
      (existing.currentDay ?? 1) > 1 ||
      (existing.streakCount ?? 0) > 0;
    if (hasProgress) {
      updateState({
        user: { ...user, onboardingComplete: true },
      });
    } else {
      updateState({
        user: { ...user, onboardingComplete: true },
        currentDay: 1,
        progress: [],
        streakCount: 0,
        lastCompletedDate: null,
        journeyComplete: false,
        journeyPass: 1,
      });
    }

    // Schedule the daily reminder right away so the habit starts tonight —
    // don't wait for the first completed session to reschedule it.
    if (user.reminderTime) {
      void scheduleReminderNotification(user.reminderTime, 1);
    }
  }, [updateState]);

  /**
   * Records this session's start time (completion minus duration) for the
   * adaptive-reminder rolling mean. Returns the state slice to merge, and a
   * `reminderTime` on `user` when the data says the habit has moved on.
   */
  const recordSessionStartAndMaybeAdapt = useCallback((durationSeconds: number) => {
    const startIso = new Date(Date.now() - durationSeconds * 1000).toISOString();
    const nextStartTimes = [...(state.prayerStartTimes ?? []), startIso].slice(-ADAPTIVE_MAX_SESSIONS);

    let nextUser: UserProfile | null = state.user ?? null;
    if (state.user?.reminderTime && state.adaptiveReminderEnabled !== false) {
      const adapted = computeAdaptiveReminderTime(nextStartTimes, state.user.reminderTime);
      if (adapted && adapted !== state.user.reminderTime) {
        nextUser = { ...state.user, reminderTime: adapted };
      }
    }

    return {
      prayerStartTimes: nextStartTimes,
      ...(nextUser && nextUser !== state.user ? { user: nextUser } : {}),
    };
  }, [state.user, state.prayerStartTimes, state.adaptiveReminderEnabled]);

  /** The adapted reminder time for THIS session, or null when unchanged/off. */
  const getAdaptiveReminderTime = useCallback((durationSeconds: number): string | null => {
    if (!state.user?.reminderTime || state.adaptiveReminderEnabled === false) return null;
    const startIso = new Date(Date.now() - durationSeconds * 1000).toISOString();
    return computeAdaptiveReminderTime([...(state.prayerStartTimes ?? []), startIso], state.user.reminderTime);
  }, [state.user, state.prayerStartTimes, state.adaptiveReminderEnabled]);

  const completeDay = useCallback((day: number, duration: number) => {
    const today = getDateString();
    const existingProgress = state.progress.filter(p => p.day !== day);
    const newProgress: DayProgress = {
      day,
      completed: true,
      completedAt: new Date().toISOString(),
      duration,
    };
    const updatedProgress = [...existingProgress, newProgress];
    const newStreak = calculateStreak(updatedProgress, today, state.graceDaysUsed ?? []);
    const nextDay = Math.min(day + 1, 30);
    const journeyComplete = day === 30;

    const completedIds = state.firstStepsCompletedIds ?? [];
    const autoMarks: string[] = [];
    if (journeyComplete && !completedIds.includes('prayer-completed-30-days')) {
      autoMarks.push('prayer-completed-30-days');
    }
    // Each completed day surfaces the day's verse — count that as looking it up & saving it.
    if (!completedIds.includes('scripture-looked-up-verse')) {
      autoMarks.push('scripture-looked-up-verse');
    }
    if (!completedIds.includes('scripture-saved-verse')) {
      autoMarks.push('scripture-saved-verse');
    }
    // If voiceover is on during a session, the user is praying along out loud.
    if (state.voiceoverEnabled && !completedIds.includes('prayer-prayed-out-loud-first-time')) {
      autoMarks.push('prayer-prayed-out-loud-first-time');
    }
    // Sustained rhythm (3+ day streak) is a quiet sign of peace settling in.
    if (newStreak >= 3 && !completedIds.includes('inner-experienced-peace')) {
      autoMarks.push('inner-experienced-peace');
    }

    const sessionStartSlice = recordSessionStartAndMaybeAdapt(duration);

    updateState({
      progress: updatedProgress,
      currentDay: journeyComplete ? 30 : nextDay,
      streakCount: newStreak,
      lastCompletedDate: today,
      journeyComplete,
      activeSession: null,
      ...sessionStartSlice,
      // Audit round 4, SYNC-6: auto-marks are checklist writes too —
      // stamp them so merge LWW does not drop them behind a stale list.
      ...(autoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...autoMarks], firstStepsUpdatedAt: new Date().toISOString() } : {}),
    });
    // Round-2 H1: the adaptive-reminder change above is a profile edit
    // too — direct-write it so the cloud learns the adapted time
    // before the next cloud-wins merge.
    if (sessionStartSlice.user?.reminderTime && sessionStartSlice.user.reminderTime !== state.user?.reminderTime) {
      void pushProfileAndPreferencesToCloud({ reminderTime: sessionStartSlice.user.reminderTime }, undefined);
    }

    const reminderToSchedule = getAdaptiveReminderTime(duration) ?? state.user?.reminderTime;
    if (reminderToSchedule) {
      void scheduleReminderNotification(reminderToSchedule, journeyComplete ? 30 : nextDay);
    }

    // Round-3 B-M1 (partial): completing a day advances the widget's
    // day, so refresh it here rather than waiting for a Home remount.
    void refreshTruthWidget();

    // One-time App Store review ask a few days into the journey, after the
    // completion celebration has had a moment to land.
    if (day >= 7 && !state.hasRatedPrompted && getWriteReviewUrl()) {
      updateState({ hasRatedPrompted: true });
      setTimeout(() => showAppReviewPrompt(), 4000);
    }
  }, [state.progress, state.firstStepsCompletedIds, state.user?.reminderTime, state.voiceoverEnabled, state.graceDaysUsed, state.hasRatedPrompted, updateState, getAdaptiveReminderTime, recordSessionStartAndMaybeAdapt]);

  const isTodayComplete = useMemo(() => {
    const today = getDateString();
    return state.lastCompletedDate === today;
  }, [state.lastCompletedDate]);

  const hasCompletedSessionToday = useMemo(() => {
    const today = getDateString();
    return state.progress.some(
      (p) => p.completed && p.completedAt && prayerDayKey(new Date(p.completedAt)) === today,
    );
  }, [state.progress]);

  const hasCompletedDailyPrayerToday = useMemo(() => {
    const today = getDateString();
    return state.dailyPrayerLog.some((entry) => entry.date === today);
  }, [state.dailyPrayerLog]);

  const graceWindowRemaining = useMemo((): number | null => {
    if (!state.lastCompletedDate) return null;
    const today = getDateString();
    const yesterday = shiftPrayerDayKey(today, -1);
    const twoDaysAgo = shiftPrayerDayKey(today, -2);
    if (state.lastCompletedDate === today) return null;
    if (state.lastCompletedDate === yesterday) return 1;
    if (state.lastCompletedDate === twoDaysAgo) return 0;
    return null;
  }, [state.lastCompletedDate]);

  const graceDayAvailable = useMemo(() => canUseGraceDay(state.graceDaysUsed ?? []), [state.graceDaysUsed]);

  const useGraceDay = useCallback(() => {
    if (!canUseGraceDay(state.graceDaysUsed ?? [])) return false;
    const today = getDateString();
    const updatedGrace = [...(state.graceDaysUsed ?? []), today];
    updateState({ graceDaysUsed: updatedGrace, lastCompletedDate: today });
    return true;
  }, [state.graceDaysUsed, updateState]);

  const addConnectionCheckin = useCallback((score: number) => {
    const today = getDateString();
    const others = (state.connectionCheckins ?? []).filter((c) => c.date !== today);
    const entry: ConnectionCheckin = {
      date: today,
      day: state.currentDay,
      score,
      createdAt: new Date().toISOString(),
    };
    updateState({ connectionCheckins: [entry, ...others] });
  }, [state.connectionCheckins, state.currentDay, updateState]);

  const carryPrayer = useCallback((echo: { id: string; text: string; amens: number }) => {
    const existing = state.carriedPrayers ?? [];
    if (existing.some((c) => c.echoId === echo.id)) {
      return;
    }
    const entry: CarriedPrayer = {
      echoId: echo.id,
      text: echo.text,
      amens: echo.amens,
      day: state.currentDay,
      carriedAt: new Date().toISOString(),
    };
    updateState({ carriedPrayers: [entry, ...existing] });
  }, [state.carriedPrayers, state.currentDay, updateState]);

  /**
   * Persist an amen given to a local-only (seed) wall post. Seeded echoes have
   * no server row, so the amen is saved on-device to survive restarts.
   */
  const markEchoAmenedLocally = useCallback((echoId: string) => {
    setState((prev) => {
      const existing = prev.wallAmenedLocal ?? [];
      if (existing.includes(echoId)) {
        return prev;
      }
      const next = { ...prev, wallAmenedLocal: [...existing, echoId] };
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  const carriedEchoIds = useMemo(
    () => new Set((state.carriedPrayers ?? []).map((c) => c.echoId)),
    [state.carriedPrayers]
  );

  const checkinDueToday = useMemo(() => {
    if (!CHECKIN_DAYS.includes(state.currentDay)) return false;
    const today = getDateString();
    return !(state.connectionCheckins ?? []).some((c) => c.date === today);
  }, [state.currentDay, state.connectionCheckins]);

  /**
   * Median completion hour learned from past sessions (24h). Returns null if too few samples.
   */
  const suggestedReminderHour = useMemo((): number | null => {
    const completedTimes = state.progress
      .filter((p) => p.completed && p.completedAt)
      .map((p) => new Date(p.completedAt!).getHours());
    if (completedTimes.length < 3) return null;
    const sorted = [...completedTimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [state.progress]);

  /**
   * True if user is subscribed monthly for 90+ days — eligible for annual upsell.
   */
  const annualUpsellEligible = useMemo(() => {
    if (!state.subscribedSinceMonthly) return false;
    if (!state.isSubscriber) return false;
    const since = new Date(state.subscribedSinceMonthly).getTime();
    const days = (Date.now() - since) / 86400000;
    return days >= 90;
  }, [state.subscribedSinceMonthly, state.isSubscriber]);

  const isStreakFrozen = useMemo(() => {
    return graceWindowRemaining === 0 && state.streakCount > 0;
  }, [graceWindowRemaining, state.streakCount]);

  // Audit round 3, J-B4: a reset clears local progress AND grace days
  // (a grace-held streak must not survive a fresh start). dailyPrayerLog
  // is deliberately kept — it feeds Daily Prayer rotation and
  // repeat-avoidance, not the journey. The J-B4 sync prune step removes
  // the cloud progress rows on the next sync, so the reset sticks
  // across devices instead of resurrecting via merge's union.
  // Audit round 4, SYNC-5/SYNC-10: a reset stamps the synced reset
  // + clear markers (merge honors them; a reset device is no longer
  // indistinguishable from a fresh install) AND persists immediately —
  // no setTimeout(0) gap in which a kill resurrects pre-reset state.
  // The marker upload rides syncAppState's stats upsert.
  const resetJourney = useCallback(() => {
    const now = new Date().toISOString();
    const prev = stateRef.current;
    const next: AppState = {
      ...prev,
      currentDay: 1,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      journeyComplete: false,
      activeSession: null,
      graceDaysUsed: [],
      journeyResetAt: now,
      completionClearedAt: now,
      ...dropJourneyDerivedChecklistMarks(prev.firstStepsCompletedIds, now),
    };
    setState(next);
    void SyncService.saveLocalState(next);
    updateState({
      currentDay: 1,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      journeyComplete: false,
      activeSession: null,
      graceDaysUsed: [],
      journeyResetAt: now,
      completionClearedAt: now,
      ...dropJourneyDerivedChecklistMarks(prev.firstStepsCompletedIds, now),
    });
  }, [updateState]);

  const continueDaily = useCallback(() => {
    // The clear marker alone (no reset marker) stops merge's sticky OR
    // from resurrecting the flag while keeping progress intact.
    updateState({
      journeyComplete: false,
      currentDay: 1,
      completionClearedAt: new Date().toISOString(),
    });
  }, [updateState]);

  // Audit round 4, Sync Medium F11 — DECISION: Daily Prayer is gated
  // OFF journey-derived learning/totals. It used to feed adaptive
  // reminder learning (recordSessionStartAndMaybeAdapt) — Daily Prayer
  // sessions shifted the journey reminder time — and, via session.tsx's
  // recordMovementTime, journey phase/Insights totals. The provider
  // side is gated here: Daily Prayer writes only the daily_prayer_log
  // and reschedules from the MANUAL reminder time. RESIDUAL (outside
  // this lane's files): session.tsx still calls recordMovementTime on
  // Daily Prayer completion (handleComplete runs it before branching),
  // so Daily Prayer minutes still land in phaseTimings/Insights until
  // session.tsx gates that call on !isDailyPrayerSession (one line,
  // flagged in the lane report for the parent to assign).
  const completeDailyPrayer = useCallback((day: number, duration: number) => {
    const today = getDateString();
    const completedAt = new Date().toISOString();
    const nextEntry: DailyPrayerLogEntry = {
      date: today,
      day,
      completedAt,
      duration,
    };
    const otherEntries = state.dailyPrayerLog.filter((entry) => entry.date !== today);
    const nextLog = [nextEntry, ...otherEntries].sort((left, right) => (
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
    ));

    updateState({ dailyPrayerLog: nextLog });

    if (state.user?.reminderTime) {
      void scheduleReminderNotification(state.user.reminderTime, state.currentDay);
    }

    // Round-3 B-M1 (partial): same day-advance refresh as completeDay.
    void refreshTruthWidget();
  }, [state.dailyPrayerLog, state.user?.reminderTime, state.currentDay, updateState]);

  const getTodayDailyPrayerDay = useCallback(() => {
    return getDailyPrayerDayForDate(getDateString(), state.dailyPrayerLog);
  }, [state.dailyPrayerLog]);

  const toggleAmbientMute = useCallback(() => {
    setState(prev => {
      const next = { ...prev, ambientMuted: !prev.ambientMuted };
      setTimeout(() => persistState(next), 0);
      // Round-2 H1: direct-write the toggled preference.
      void pushProfileAndPreferencesToCloud(undefined, { ambientMuted: next.ambientMuted });
      return next;
    });
  }, [persistState]);

  const setAmbientMute = useCallback((muted: boolean) => {
    updateState({ ambientMuted: muted });
    void pushProfileAndPreferencesToCloud(undefined, { ambientMuted: muted });
  }, [updateState]);

  const setSoundscape = useCallback((soundscape: Soundscape) => {
    updateState({ soundscape });
    void pushProfileAndPreferencesToCloud(undefined, { soundscape });
  }, [updateState]);

  const toggleVoiceover = useCallback(() => {
    setState(prev => {
      const next = { ...prev, voiceoverEnabled: !prev.voiceoverEnabled };
      setTimeout(() => persistState(next), 0);
      // Round-2 H1: direct-write the toggled preference.
      void pushProfileAndPreferencesToCloud(undefined, { voiceoverEnabled: next.voiceoverEnabled });
      return next;
    });
  }, [persistState]);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2, Math.round(rate * 10) / 10));
    updateState({ playbackRate: clamped });
    void pushProfileAndPreferencesToCloud(undefined, { playbackRate: clamped });
  }, [updateState]);

  const setThemePreference = useCallback((themePreference: ThemePreference) => {
    updateState({
      themePreference,
      monaticTheme: themePreference === 'monastic',
    });
    void pushProfileAndPreferencesToCloud(undefined, { themePreference });
  }, [updateState]);

  const setMonaticTheme = useCallback((enabled: boolean) => {
    setThemePreference(enabled ? 'monastic' : 'fireside');
  }, [setThemePreference]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    updateState({ fontSize });
    void pushProfileAndPreferencesToCloud(undefined, { fontSize });
  }, [updateState]);

  const saveReflection = useCallback((reflection: WeeklyReflection) => {
    // Audit round 3, J-S16: refuse an all-blank save (the old code appended
    // it and only gated the checklist mark), and upsert by week instead of
    // appending — re-saving for the same day used to create a duplicate
    // journal card while the DB upsert rejected the second row.
    const hasContent = [reflection.q1, reflection.q2, reflection.q3]
      .some((s) => typeof s === 'string' && s.trim().length > 0);
    if (!hasContent) return;
    updateState((prev) => {
      const completedIds = prev.firstStepsCompletedIds ?? [];
      const shouldMarkHonest = !completedIds.includes('prayer-prayed-honestly');
      // Audit round 4, SYNC-3/SYNC-6: re-saving a deleted reflection
      // clears its local tombstone (server side clears it in
      // saveWeeklyReflection), and the checklist mark is stamped.
      const itemId = `${prev.journeyPass ?? 1}:${reflection.week}`;
      const syncTombstones = (prev.syncTombstones ?? []).filter(
        (t) => !(t.list === 'reflections' && t.itemId === itemId),
      );
      return {
        reflections: [...(prev.reflections ?? []).filter((r) => r.week !== reflection.week), reflection],
        syncTombstones,
        ...(shouldMarkHonest ? { firstStepsCompletedIds: [...completedIds, 'prayer-prayed-honestly'], firstStepsUpdatedAt: new Date().toISOString() } : {}),
      };
    });
  }, [updateState]);

  const updatePhaseTimings = useCallback((phase: string, seconds: number) => {
    const current = state.phaseTimings[phase] ?? 0;
    const updated = { ...state.phaseTimings, [phase]: current + seconds };

    // Auto-track: "sat in silence" once any single Settle/Selah session is >= 2 minutes.
    const completedIds = state.firstStepsCompletedIds ?? [];
    const isSilencePhase = phase === 'selah' || phase === 'settle';
    const newPhaseTotal = current + seconds;
    const shouldMarkSilence = isSilencePhase
      && (seconds >= 120 || newPhaseTotal >= 120)
      && !completedIds.includes('prayer-sat-in-silence');
    // Auto-track: thanked God when it didn't feel natural — once they've spent
    // a meaningful minute in the Thank phase across sessions.
    const shouldMarkThanks = phase === 'thank'
      && newPhaseTotal >= 60
      && !completedIds.includes('prayer-thanked-god-when-hard');

    // Append to per-day phase log so we can render a weekly TRIAD heatmap and
    // detect neglected phases. Aggregate by (date, phase). Keep last 60 days.
    const today = getDateString();
    const cutoff = getDateString(new Date(Date.now() - 60 * 86400000));
    const existing = state.phaseLog ?? [];
    let merged = false;
    const nextLog: PhaseLogEntry[] = existing
      .filter((e) => e.date >= cutoff)
      .map((e) => {
        if (e.date === today && e.phase === phase) {
          merged = true;
          return { ...e, seconds: e.seconds + seconds };
        }
        return e;
      });
    if (!merged) nextLog.push({ date: today, phase, seconds });

    const phaseAutoMarks: string[] = [];
    if (shouldMarkSilence) phaseAutoMarks.push('prayer-sat-in-silence');
    if (shouldMarkThanks) phaseAutoMarks.push('prayer-thanked-god-when-hard');

    updateState({
      phaseTimings: updated,
      phaseLog: nextLog,
      ...(phaseAutoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...phaseAutoMarks] } : {}),
    });
  }, [state.phaseTimings, state.phaseLog, state.firstStepsCompletedIds, updateState]);

  /**
   * Schedule a one-off push ~24h from now nudging the user to linger in the
   * neglected TRIAD phase. Falls back to a no-op on web / when permission denied.
   */
  // Audit round 3, J-S21: cancel neglected-phase nudges, optionally for
  // one phase label. Used before scheduling (dedupe: the old code stacked
  // a new +24h nudge on every tap, and the daily rescheduler deliberately
  // preserves these) and on session completion (a prayed session
  // un-neglects every phase). Best-effort: a stale nudge is annoying,
  // never fatal. (Sign-out already cancels all notifications, verified.)
  const cancelNeglectedPhaseReminders = useCallback(async (phaseLabel?: string): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      const Notifications = await import('expo-notifications');
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        const data = n.content?.data as { kind?: string; phase?: string } | undefined;
        if (data?.kind !== 'neglected_phase') continue;
        if (phaseLabel !== undefined && data.phase !== phaseLabel) continue;
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    } catch {
      if (__DEV__) console.log('[Notifications] cancel neglected-phase failed');
    }
  }, []);

  const scheduleNeglectedPhaseReminder = useCallback(async (phaseLabel: string): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const Notifications = await import('expo-notifications');
      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        final = status;
      }
      if (final !== 'granted') return false;

      // Dedupe: never stack a second nudge for the same phase.
      await cancelNeglectedPhaseReminders(phaseLabel);

      const trigger = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'TRIAD Prayer',
          body: `Today, linger in ${phaseLabel}. Let it open up slowly.`,
          sound: true,
          data: { kind: 'neglected_phase', phase: phaseLabel },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
      return true;
    } catch (e) {
      if (__DEV__) console.log('[Notifications] neglected-phase schedule failed', e);
      return false;
    }
  }, [cancelNeglectedPhaseReminders]);
  
  const addAnsweredPrayer = useCallback((prayer: Omit<AnsweredPrayer, 'id' | 'date'>) => {
    const newEntry: AnsweredPrayer = {
      ...prayer,
      id: generateSecureId(),
      date: new Date().toLocaleDateString(),
    };
    // Audit round 3, J-S18: functional update — rapid adds compute from
    // the true previous list, not a stale render snapshot.
    updateState((prev) => {
      const completedIds = prev.firstStepsCompletedIds ?? [];
      const shouldMarkAsked = !completedIds.includes('prayer-asked-god-specific');
      return {
        answeredPrayers: [...(prev.answeredPrayers ?? []), newEntry],
        ...(shouldMarkAsked ? { firstStepsCompletedIds: [...completedIds, 'prayer-asked-god-specific'] } : {}),
      };
    });
  }, [updateState]);

  const addPrayerRequest = useCallback((text: string) => {
    const newEntry: PrayerRequest = {
      id: generateSecureId(),
      text,
      date: new Date().toLocaleDateString(),
      isAnswered: false,
    };
    // Audit round 3, J-S18: functional update (see addAnsweredPrayer).
    updateState((prev) => {
      const completedIds = prev.firstStepsCompletedIds ?? [];
      const requestAutoMarks: string[] = [];
      if (!completedIds.includes('prayer-asked-god-specific')) requestAutoMarks.push('prayer-asked-god-specific');
      // Naming a worry to God is the act of releasing it — count it once.
      if (!completedIds.includes('inner-released-anxiety')) requestAutoMarks.push('inner-released-anxiety');
      return {
        prayerRequests: [...(prev.prayerRequests ?? []), newEntry],
        ...(requestAutoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...requestAutoMarks] } : {}),
      };
    });
  }, [updateState]);

  const markPrayerAnswered = useCallback((id: string, answer: string, shareAsTestimony?: boolean) => {
    // Audit round 3, J-S18: read the live list, not the render snapshot.
    const current = stateRef.current;
    const request = current.prayerRequests.find(r => r.id === id);
    if (!request) return;

    const updatedRequests = current.prayerRequests.map(r =>
      r.id === id ? { ...r, isAnswered: true, answer, answeredAt: new Date().toISOString() } : r
    );

    // Audit round 3, J-S17: shared stays unset until createTestimony
    // actually succeeds (the success handler below sets it). The old code
    // marked shared: true optimistically, so a kill — or an autosync beat
    // between entry creation and the share result — left the cloud
    // claiming a post that never existed, with no retry affordance.
    const answeredEntry: AnsweredPrayer = {
      id: generateSecureId(),
      request: request.text,
      answer,
      date: new Date().toLocaleDateString(),
    };

    const completedIds = current.firstStepsCompletedIds ?? [];
    const autoMarks: string[] = [];
    if (!completedIds.includes('prayer-asked-god-specific')) autoMarks.push('prayer-asked-god-specific');
    if (!completedIds.includes('relationships-shared-what-god-did')) autoMarks.push('relationships-shared-what-god-did');

    updateState({
      prayerRequests: updatedRequests,
      answeredPrayers: [...(current.answeredPrayers ?? []), answeredEntry],
      ...(autoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...autoMarks] } : {}),
    });

    // Opt-in: post to the community testimony feed. No name is passed —
    // the table default 'A friend' applies (batch pass, Kai 2026-10-25),
    // so new shares never publish profile names. Free for all — posting
    // failures never lose the personal record above, and never pretend
    // the post went out: the entry is unmarked and flagged, and the
    // user is told with a retry.
    if (shareAsTestimony) {
      const attemptShare = () =>
        DatabaseService.createTestimony(request.text, answer).then(
          (shared) => {
            const current = stateRef.current.answeredPrayers ?? [];
            updateState({
              answeredPrayers: current.map((p) =>
                p.id === answeredEntry.id ? { ...p, shared: true, testimonyShareFailed: false } : p),
            });
            // Moderation tiers (migration 00019): a held testimony
            // is a success with hidden_at set — not a failure, and
            // never a retry loop. "Shared" here means submitted.
            // Self-harm and threat holds replace the generic notice
            // with the support card (rendered once from the root
            // layout via context); every other hold keeps the
            // generic notice. The post stays held either way.
            const supportVariant = supportCardVariantForHold(shared);
            if (supportVariant) {
              requestSupportCard(supportVariant);
            } else if (isHeldWallPost(shared)) {
              Alert.alert(
                'Under review',
                'Under review — hidden from the wall until the care team looks at it.',
              );
            }
          },
          () => {
            const current = stateRef.current.answeredPrayers ?? [];
            updateState({
              answeredPrayers: current.map((p) =>
                p.id === answeredEntry.id ? { ...p, shared: false, testimonyShareFailed: true } : p),
            });
            Alert.alert(
              'Testimony not shared yet',
              'Your answered prayer is saved here. The public post didn’t go through — check your connection and try again.',
              [
                { text: 'OK', style: 'cancel' },
                { text: 'Try again', onPress: () => void attemptShare() },
              ],
            );
          },
        );
      void attemptShare();
    }
  }, [updateState, requestSupportCard]);

  // Retry a failed testimony share from the journal. No-op if the entry
  // is gone; success clears the failure flag.
  const retryTestimonyShare = useCallback(async (id: string) => {
    const entry = stateRef.current.answeredPrayers?.find((p) => p.id === id);
    if (!entry) return;
    try {
      // No name passed: the table default 'A friend' applies to new
      // shares. A retry that finds the existing row returns it via the
      // J-S17 dedup, so it keeps the old name — existing rows unchanged.
      // Moderation tiers (migration 00019): a held row returns with
      // hidden_at set — a successful submission under review, not a
      // failure, so the retry clears the failure flag and tells the
      // author once, instead of looping.
      const shared = await DatabaseService.createTestimony(entry.request, entry.answer);
      const current = stateRef.current.answeredPrayers ?? [];
      updateState({
        answeredPrayers: current.map((p) =>
          p.id === id ? { ...p, shared: true, testimonyShareFailed: false } : p),
      });
      const retrySupportVariant = supportCardVariantForHold(shared);
      if (retrySupportVariant) {
        requestSupportCard(retrySupportVariant);
      } else if (isHeldWallPost(shared)) {
        Alert.alert(
          'Under review',
          'Under review — hidden from the wall until the care team looks at it.',
        );
      }
    } catch {
      Alert.alert('Still couldn’t share', 'Your answered prayer is saved here. Check your connection and try again later.');
    }
  }, [updateState, requestSupportCard]);

  // Audit round 3, J-B9: deletion used to be local-only — the cloud row
  // survived and merge's union resurrected it on the next full sync, so
  // the journal's "Remove" promise didn't stick. Server first (mirroring
  // the wall-delete pattern); on failure the entry stays and the user is
  // told, instead of silently coming back later.
  const deletePrayerRequest = useCallback(async (id: string) => {
    try {
      await DatabaseService.deletePrayerRequest(id);
    } catch {
      Alert.alert('Couldn’t remove', 'Check your connection and try again.');
      return;
    }
    // Audit round 4, SYNC-3: keep the tombstone in local state too, so
    // the next sync re-uploads it if the tap-time server tombstone
    // write failed, and merge drops the id on every device.
    // Audit round 3, J-S18: functional update (see addAnsweredPrayer).
    const tombstone = { list: 'prayerRequests' as const, itemId: id, deletedAt: new Date().toISOString() };
    updateState((prev) => ({
      prayerRequests: (prev.prayerRequests ?? []).filter((r) => r.id !== id),
      syncTombstones: [...(prev.syncTombstones ?? []).filter((t) => !(t.list === 'prayerRequests' && t.itemId === id)), tombstone],
    }));
  }, [updateState]);

  // Audit round 4, SYNC-3: delete paths for answered prayers and
  // reflections, which previously had none (no UI wiring yet — these
  // are exposed for the journal to call; the rows + tombstones are the
  // mechanism, UI buttons are a separate, small follow-up).
  const deleteAnsweredPrayer = useCallback(async (id: string) => {
    try {
      await DatabaseService.deleteAnsweredPrayer(id);
    } catch {
      Alert.alert('Couldn’t remove', 'Check your connection and try again.');
      return;
    }
    const tombstone = { list: 'answeredPrayers' as const, itemId: id, deletedAt: new Date().toISOString() };
    updateState((prev) => ({
      answeredPrayers: (prev.answeredPrayers ?? []).filter((p) => p.id !== id),
      syncTombstones: [...(prev.syncTombstones ?? []).filter((t) => !(t.list === 'answeredPrayers' && t.itemId === id)), tombstone],
    }));
  }, [updateState]);

  const deleteWeeklyReflection = useCallback(async (week: number) => {
    const pass = stateRef.current.journeyPass ?? 1;
    try {
      await DatabaseService.deleteWeeklyReflection(week, pass);
    } catch {
      Alert.alert('Couldn’t remove', 'Check your connection and try again.');
      return;
    }
    const itemId = `${pass}:${week}`;
    const tombstone = { list: 'reflections' as const, itemId, deletedAt: new Date().toISOString() };
    updateState((prev) => ({
      reflections: (prev.reflections ?? []).filter((r) => r.week !== week),
      syncTombstones: [...(prev.syncTombstones ?? []).filter((t) => !(t.list === 'reflections' && t.itemId === itemId)), tombstone],
    }));
  }, [updateState]);

  // Audit round 3, J-B10 + J-S18: the favorite toggles through a per-id
  // server call immediately (not deferred to the 30s sync), so an
  // unfavorite can't be resurrected by a restart-before-sync: the cloud
  // row is gone at tap time. Optimistic locally, rolled back with an alert
  // on failure. The sync-time reconcile in syncDeclarationFavorites stays
  // as a backstop for multi-device drift.
  const toggleDeclarationFavorite = useCallback((id: string) => {
    const favored = !(stateRef.current.declarationFavorites ?? []).includes(id);
    updateState((prev) => {
      const favorites = prev.declarationFavorites ?? [];
      const nextFavorites = favorites.includes(id)
        ? favorites.filter((favoriteId) => favoriteId !== id)
        : [...favorites, id];
      // Auto-track: spoken a declaration over yourself the first time you favorite one.
      const completedIds = prev.firstStepsCompletedIds ?? [];
      const shouldMarkDeclaration = favored && !completedIds.includes('inner-spoken-declaration');
      // Audit round 4, SYNC-3: mirror the tap-time server tombstone in
      // local state (unfavorite adds, re-favorite clears), so merge
      // and the next sync both honor the delete.
      const prevTombstones = prev.syncTombstones ?? [];
      const syncTombstones = favored
        ? prevTombstones.filter((t) => !(t.list === 'favorites' && t.itemId === id))
        : [...prevTombstones.filter((t) => !(t.list === 'favorites' && t.itemId === id)),
          { list: 'favorites' as const, itemId: id, deletedAt: new Date().toISOString() }];
      return {
        declarationFavorites: nextFavorites,
        syncTombstones,
        ...(shouldMarkDeclaration ? { firstStepsCompletedIds: [...completedIds, 'inner-spoken-declaration'] } : {}),
      };
    });
    void DatabaseService.setDeclarationFavorite(id, favored).catch(() => {
      updateState((prev) => {
        const favorites = prev.declarationFavorites ?? [];
        return {
          declarationFavorites: favored
            ? favorites.filter((favoriteId) => favoriteId !== id)
            : [...favorites, id],
        };
      });
      Alert.alert('Couldn’t save favorite', 'Check your connection and try again.');
    });
  }, [updateState]);

  const toggleFirstStepCompleted = useCallback((id: string) => {
    if (!CHECKLIST_ITEMS.some((item) => item.id === id)) {
      if (__DEV__) {
        console.log('[Checklist] Ignored unknown item id', { id });
      }
      return;
    }

    const completedIds = state.firstStepsCompletedIds ?? [];
    const nextCompletedIds = completedIds.includes(id)
      ? completedIds.filter((itemId) => itemId !== id)
      : [...completedIds, id];

    if (__DEV__) {
      console.log('[Checklist] Toggling item', {
        id,
        completed: !completedIds.includes(id),
        completedCount: nextCompletedIds.length,
      });
    }

    // Audit round 4, SYNC-6: every toggle stamps the checklist, so
    // merge's last-write-wins can tell which side edited last.
    updateState({ firstStepsCompletedIds: nextCompletedIds, firstStepsUpdatedAt: new Date().toISOString() });
  }, [state.firstStepsCompletedIds, updateState]);

  /**
   * Idempotent auto-tracking: marks a First Step as completed without un-toggling.
   * Safe to call repeatedly from passive trigger points across the app.
   */
  const markFirstStepCompleted = useCallback((id: string) => {
    if (!CHECKLIST_ITEMS.some((item) => item.id === id)) return;
    const completedIds = stateRef.current.firstStepsCompletedIds ?? [];
    if (completedIds.includes(id)) return;
    if (__DEV__) {
      console.log('[Checklist] Auto-marking item', { id });
    }
    updateState({ firstStepsCompletedIds: [...completedIds, id], firstStepsUpdatedAt: new Date().toISOString() });
  }, [updateState]);

  // Audit round 3, J-B3: a second pass starts clean — progress, streak,
  // last-completion, and any in-progress session are cleared with it.
  // (The old version left progress behind, so the new pass re-inherited
  // the old pass's days; the J-B4 sync delete step removes the cloud
  // rows for the cleared progress on the next sync.)
  const startSecondPass = useCallback(() => {
    updateState({
      currentDay: 1,
      journeyPass: state.journeyPass + 1,
      journeyComplete: false,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      activeSession: null,
      ...dropJourneyDerivedChecklistMarks(stateRef.current.firstStepsCompletedIds, new Date().toISOString()),
    });
  }, [state.journeyPass, updateState]);

  const signOut = useCallback(async () => {
    SyncService.stopAutoSync();
    // Audit must-fix #3: suppress background sync for the rest of this
    // sign-out. The post-reset open-streak effect persists a fresh state,
    // and with a surviving in-memory session that fresh state used to be
    // uploaded to the old account, wiping its cloud progress.
    AppSync.suppressSync = true;
    try {
      await supabase.auth.signOut();
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] signOut failed, clearing local state:', error);
      }
      // Audit round 4, lane 2 (M4): persist a revoke-retry marker naming
      // this user (retried on next launch only for the same user; local
      // clearing below remains the guarantee).
      const uid = stateRef.current.user?.id;
      if (uid) {
        void AsyncStorage.setItem('triad_signout_revoke_pending_v1', uid).catch(() => {});
      }
    }
    // S-13: supabase-js signOut does not guarantee local token removal —
    // on a server error it returns early without _removeSession. Clear
    // the stored session directly so a failed sign-out never leaves a
    // usable session behind (a no-op when signOut already removed it).
    await clearStoredAuthSession();
    // ...and drop the in-memory session too, regardless of the server
    // outcome: a local-scope sign-out never touches the network, so it
    // cannot fail the way the server revoke can.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Best effort — storage is already cleared above.
    }
    // Do not rely on the SIGNED_OUT event (which never fires when the
    // server sign-out fails) to drop the RevenueCat identity.
    try {
      await Purchases.logOut();
    } catch {
      // Best effort.
    }
    // Sign-out must not leave the previous user's journey, prayers, or
    // reflections on disk for the next account on this device to hydrate
    // from (and, for a brand-new account, upload). Reset to a fresh state
    // exactly like deleteAccount does; cloud data restores on next sign-in.
    try {
      await SyncService.clearLocalState();
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] signOut local cleanup failed:', error);
      }
    }
    // Audit round 4, lane 2 (L1): the React Query cache must not carry
    // the previous user's data into the next account's session.
    clearAppQueryCache();
    // Notifications must not follow the user out the door: a signed-out
    // account kept receiving up to 60 days of reminders before this.
    // Round-3 A-L2: drain the reminder chain first — an in-flight
    // scheduling run must finish before the cancel, or it re-schedules
    // after the wipe.
    await drainReminderScheduleChain();
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // Best effort — sign-out must not fail on notification cleanup.
    }
    // The Keychain encryption key must not span accounts either.
    await deleteStoredEncryptionKey();
    // Audit round 2, lane 2, S1(a): the 13+ attestation device flag must
    // not span accounts either — otherwise a child signing into their own
    // account on a shared device would inherit the previous user's
    // attestation and never see the gate.
    try {
      await AsyncStorage.removeItem('triad_age_attested_v1');
    } catch {
      // Best effort — sign-out must not fail on flag cleanup.
    }
    const freshState: AppState = { ...defaultState };
    stateRef.current = freshState;
    setState(freshState);
    // Land on the auth screen, not on whatever tab issued the sign-out
    // (which used to sit empty with no way back to sign-in).
    router.replace('/auth');
  }, []);

  const deleteAccount = useCallback(async () => {
    const session = await getSafeSession();
    const accessToken = session?.access_token ?? null;

    if (!accessToken) {
      Alert.alert('Delete Account', 'Please sign in again before deleting your account.');
      return false;
    }

    // Round-2 L3: marker written BEFORE the server call, so a kill
    // between the server delete and the local wipe below is caught at
    // next launch (see the launch check in the state query). Cleared
    // on failure and after completed cleanup — never left behind on
    // a path where the account still exists.
    try {
      await AsyncStorage.setItem('triad_delete_pending_v1', '1');
    } catch {
      // Best effort — the server call still proceeds.
    }

    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: {
          confirmationText: 'DELETE',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        throw error;
      }

      if (__DEV__) {
        console.log('[AppProvider] delete-account function succeeded');
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] deleteAccount function failed:', error);
      }
      // Round-2 L3: the account still exists — clear the marker so a
      // later launch never wipes a live account's local state.
      try {
        await AsyncStorage.removeItem('triad_delete_pending_v1');
      } catch {
        // Best effort.
      }
      const message = error instanceof Error ? error.message : String(error ?? '');
      const needsRecentLogin = message.includes('last 10 minutes') || message.includes('401');
      Alert.alert(
        'Delete Account',
        needsRecentLogin
          ? 'For safety, please sign out, sign back in, and try deleting your account again within 10 minutes.'
          : 'We could not delete your account right now. Please try again in a moment.'
      );
      return false;
    }

    SyncService.stopAutoSync();
    // Same must-fix #3 suppression as signOut: no sync may run for the
    // deleted account after this point (the delete flow also re-creates a
    // journey_stats row for the deleted user if a stale session survives).
    AppSync.suppressSync = true;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] deleteAccount signOut failed:', error);
      }
      // Same round-4 lane-2 M4 revoke-retry marker as signOut.
      const uid = stateRef.current.user?.id;
      if (uid) {
        void AsyncStorage.setItem('triad_signout_revoke_pending_v1', uid).catch(() => {});
      }
    }

    // Same S-13 guarantee as signOut: never leave a usable session for a
    // deleted account behind a failed server round-trip.
    await clearStoredAuthSession();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Best effort — storage is already cleared above.
    }
    try {
      await Purchases.logOut();
    } catch {
      // Best effort.
    }

    try {
      await SyncService.clearLocalState();
    } catch {
      Alert.alert('Account deleted', 'Your account was deleted, but local cleanup was incomplete. Reinstalling the app will remove the remaining local cache.');
    }
    // Round 4, lane 2 (L1): same query-cache clearing as sign-out.
    clearAppQueryCache();

    // Same post-account cleanup as sign-out: no reminders for a deleted
    // account, no reused Keychain key, and land on auth instead of an
    // empty tab.
    // Round-3 A-L2: drain the reminder chain before the cancel (see sign-out).
    await drainReminderScheduleChain();
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // Best effort.
    }
    await deleteStoredEncryptionKey();
    // Same attestation-flag cleanup as sign-out (round 2, S1(a)).
    try {
      await AsyncStorage.removeItem('triad_age_attested_v1');
    } catch {
      // Best effort.
    }

    const freshState: AppState = { ...defaultState };
    stateRef.current = freshState;
    setState(freshState);
    router.replace('/auth');
    // Round-2 L3: cleanup completed — the launch-wipe marker has
    // served its purpose (it only matters for the kill window).
    try {
      await AsyncStorage.removeItem('triad_delete_pending_v1');
    } catch {
      // Best effort.
    }
    return true;
  }, []);

  const updateDisplayName = useCallback((displayName: string) => {
    const nextUser = state.user ? { ...state.user, displayName } : null;
    updateState({
      user: nextUser,
    });
    // Round-2 H1: direct-write the edited profile (see helper above).
    if (nextUser) void pushProfileAndPreferencesToCloud({ displayName }, undefined);
  }, [state.user, updateState]);

  const updateReminderTime = useCallback((reminderTime: string) => {
    const nextUser = state.user ? { ...state.user, reminderTime } : null;
    updateState({
      user: nextUser,
    });
    if (nextUser) void pushProfileAndPreferencesToCloud({ reminderTime }, undefined);
    // Immediately schedule the next notification with the new time
    void scheduleReminderNotification(reminderTime, state.currentDay);
  }, [state.user, state.currentDay, updateState]);

  /** Manual override: when off, reminders never drift from the picked time. */
  const setAdaptiveReminderEnabled = useCallback((enabled: boolean) => {
    updateState({ adaptiveReminderEnabled: enabled });
    void pushProfileAndPreferencesToCloud(undefined, { adaptiveReminderEnabled: enabled });
    // Turning adaptive OFF must re-anchor the schedule on the manual
    // time: without this, the previously computed drifted schedule kept
    // firing, and the toggle was a lie.
    if (!enabled && state.user?.reminderTime) {
      void scheduleReminderNotification(state.user.reminderTime, state.currentDay);
    }
  }, [updateState, state.user?.reminderTime, state.currentDay]);

  const dismissCloudPrompt = useCallback(() => {
    updateState({
      user: state.user ? { ...state.user, cloudPromptDismissedAt: Date.now() } : null,
    });
  }, [state.user, updateState]);

  const updateActiveSession = useCallback((updates: Partial<NonNullable<AppState['activeSession']>>) => {
    setState((prev) => {
      const current = prev.activeSession;
      if (!current) {
        return prev;
      }

      const nextActiveSession = {
        ...current,
        ...updates,
      };

      if (
        current.day === nextActiveSession.day &&
        current.phase === nextActiveSession.phase &&
        current.secondsElapsed === nextActiveSession.secondsElapsed
      ) {
        return prev;
      }

      const nextState: AppState = {
        ...prev,
        activeSession: {
          ...nextActiveSession,
          lastUpdated: new Date().toISOString(),
        },
      };

      setTimeout(() => persistState(nextState), 0);
      return nextState;
    });
  }, [persistState]);

  const startSession = useCallback((day: number, trackId?: string) => {
    setState((prev) => {
      if (
        prev.activeSession?.day === day &&
        prev.activeSession.phase === null &&
        prev.activeSession.secondsElapsed === 0 &&
        // A fresh session for another track is not the same session,
        // even when the day number coincides.
        (!trackId || !prev.activeSession.trackId || prev.activeSession.trackId === trackId)
      ) {
        return prev;
      }

      const nextState: AppState = {
        ...prev,
        activeSession: {
          day,
          phase: null,
          secondsElapsed: 0,
          lastUpdated: new Date().toISOString(),
          ...(trackId ? { trackId } : {}),
        },
      };

      setTimeout(() => persistState(nextState), 0);
      return nextState;
    });
  }, [persistState]);

  const clearActiveSession = useCallback(() => {
    updateState({ activeSession: null });
  }, [updateState]);

  const checkFeature = useCallback(
    (feature: any) => hasFeature(feature, state.tierLevel),
    [state.tierLevel]
  );

  const setSubscribedSinceMonthly = useCallback((iso: string | null) => {
    updateState({ subscribedSinceMonthly: iso });
  }, [updateState]);

  const syncSubscription = useCallback((entitlements: string[]) => {
    const normalizedEntitlements = normalizeEntitlements(entitlements);
    const isSubbed = normalizedEntitlements.length > 0;
    const tier = getTierFromEntitlements(normalizedEntitlements);
    setState(prev => {
      const next: AppState = {
        ...prev,
        isSubscriber: isSubbed,
        entitlements: normalizedEntitlements,
        tierLevel: tier,
        voiceoverEnabled: isSubbed ? prev.voiceoverEnabled : false,
        // Seasonal theme is available to everyone — only Monastic needs Partner.
        themePreference: prev.themePreference === 'monastic' && tier < UserTier.PARTNER ? 'fireside' : (prev.themePreference ?? 'fireside'),
        monaticTheme: tier >= UserTier.PARTNER && prev.themePreference === 'monastic',
        // Audit round 3, J-S20: same lapsed reset as the RevenueCat
        // listener above.
        ...(isSubbed ? {} : { soundscape: DEFAULT_SOUNDSCAPE, playbackRate: 1 }),
      };
      setTimeout(() => {
        persistState(next);
        if (next.user?.id) {
          void SyncService.syncToCloud(next);
        }
      }, 0);
      return next;
    });
  }, [persistState]);

  return useMemo(() => ({
    state,
    isLoading: stateQuery.isLoading,
    // Local-load failure is otherwise invisible: every tab would render
    // empty as if the user had no prayers. Journal surfaces this banner.
    // Audit round 3, J-S13: a failed cloud load flags the same banner
    // (and suppresses Home's onboarding redirect below).
    // Audit round 4, Low L3: sync-step failures fold into the same
    // banner (Home renders it too) — no new toast system.
    stateLoadError: stateLoadFailed || stateQuery.isError || syncFailed,
    syncFailed,
    reloadState: stateQuery.refetch,
    completeOnboarding,
    completeDay,
    completeDailyPrayer,
    isTodayComplete,
    hasCompletedSessionToday,
    hasCompletedDailyPrayerToday,
    graceWindowRemaining,
    graceDayAvailable,
    useGraceDay,
    addConnectionCheckin,
    carryPrayer,
    carriedEchoIds,
    markEchoAmenedLocally,
    checkinDueToday,
    suggestedReminderHour,
    annualUpsellEligible,
    isStreakFrozen,
    resetJourney,
    continueDaily,
    getTodayDailyPrayerDay,
    toggleAmbientMute,
    setAmbientMute,
    setSoundscape,
    toggleVoiceover,
    setFontSize,
    saveReflection,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    retryTestimonyShare,
    deletePrayerRequest,
    deleteAnsweredPrayer,
    deleteWeeklyReflection,
    toggleDeclarationFavorite,
    toggleFirstStepCompleted,
    markFirstStepCompleted,
    startSecondPass,
    signOut,
    deleteAccount,
    updateDisplayName,
    updateReminderTime,
    setAdaptiveReminderEnabled,
    dismissCloudPrompt,
    isPartner,
    hasFeature: checkFeature,
    // Support card (wall moderation holds): variant or null, plus
    // request/dismiss. Rendered once from the root layout.
    supportCardVariant,
    requestSupportCard,
    dismissSupportCard,
    updateActiveSession,
    startSession,
    clearActiveSession,
    syncSubscription,
    setSubscribedSinceMonthly,
    setMonaticTheme,
    setThemePreference,
    setPlaybackRate,
    scheduleNeglectedPhaseReminder,
    cancelNeglectedPhaseReminders,
  }), [
    graceDayAvailable,
    useGraceDay,
    addConnectionCheckin,
    carryPrayer,
    carriedEchoIds,
    markEchoAmenedLocally,
    checkinDueToday,
    suggestedReminderHour,
    annualUpsellEligible,
    state,
    stateQuery.isLoading,
    stateQuery.isError,
    stateQuery.refetch,
    // Audit round 3, J-S13: the load-failed flag feeds stateLoadError
    // in the memo above — without it the memo goes stale and Home's
    // redirect guard never sees the failure.
    stateLoadFailed,
    // Audit round 4, Low L3: syncFailed feeds stateLoadError the same way.
    syncFailed,
    completeOnboarding,
    completeDay,
    completeDailyPrayer,
    isTodayComplete,
    hasCompletedSessionToday,
    hasCompletedDailyPrayerToday,
    graceWindowRemaining,
    isStreakFrozen,
    resetJourney,
    continueDaily,
    getTodayDailyPrayerDay,
    toggleAmbientMute,
    setAmbientMute,
    setSoundscape,
    toggleVoiceover,
    setFontSize,
    saveReflection,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    retryTestimonyShare,
    deletePrayerRequest,
    deleteAnsweredPrayer,
    deleteWeeklyReflection,
    toggleDeclarationFavorite,
    toggleFirstStepCompleted,
    markFirstStepCompleted,
    startSecondPass,
    signOut,
    deleteAccount,
    updateDisplayName,
    updateReminderTime,
    setAdaptiveReminderEnabled,
    dismissCloudPrompt,
    isPartner,
    checkFeature,
    updateActiveSession,
    startSession,
    clearActiveSession,
    syncSubscription,
    setSubscribedSinceMonthly,
    setMonaticTheme,
    setThemePreference,
    setPlaybackRate,
    scheduleNeglectedPhaseReminder,
    cancelNeglectedPhaseReminders,
    supportCardVariant,
    requestSupportCard,
    dismissSupportCard,
  ]);
});
