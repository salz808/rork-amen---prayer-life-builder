import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Alert, Platform } from 'react-native';
import { AppState, UserProfile, DayProgress, Soundscape, FontSize, WeeklyReflection, AnsweredPrayer, PrayerRequest, DailyPrayerLogEntry, PhaseLogEntry, ThemePreference, ConnectionCheckin, CarriedPrayer , UserTier } from '@/types';
import { generateSecureId } from '@/lib/secureId';
import { DEFAULT_SOUNDSCAPE } from '@/constants/soundscapes';
import { CHECKLIST_ITEMS } from '@/mocks/checklist';
import { getJourneyEncouragementNotification, getWinbackMessage } from '@/mocks/encouragements';
import { AppSync } from '@/lib/sync/appSync';
import { DatabaseService } from '@/lib/database';
import { getSafeSession, supabase } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';
import { computeReminderTriggers, parseReminderTime } from '@/lib/reminderSchedule';
import { getTierFromEntitlements, hasFeature, normalizeEntitlements } from '@/services/entitlements';
import { getWriteReviewUrl, showAppReviewPrompt } from '@/lib/appStoreReview';
import { prayerDayKey, shiftPrayerDayKey, prayerDayDifference } from '@/lib/prayerDay';
import { publishFoundationsProgress } from '@/lib/journeyTogether';



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
  const sortedProgress = [...progress]
    .filter(p => p.completed && p.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (sortedProgress.length === 0) return 0;

  let checkDate = lastCompletedDate === today ? today : lastCompletedDate;
  for (const p of sortedProgress) {
    // Bucket by the prayer's own prayer day — completion instants are
    // absolute, so historical entries land on their true prayer day.
    const pDate = prayerDayKey(new Date(p.completedAt!));
    if (pDate === checkDate) {
      streak++;
      checkDate = shiftPrayerDayKey(checkDate, -1);
    } else if (pDate < checkDate) {
      break;
    }
  }

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
  const completedInstants = (loaded.progress ?? [])
    .filter((p) => p.completed && p.completedAt)
    .map((p) => new Date(p.completedAt!).getTime())
    .filter((t) => Number.isFinite(t));
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

async function scheduleReminderNotification(reminderTime: string, nextDay: number = 1) {
  if (Platform.OS === 'web') return;

  try {
    const Notifications = await import('expo-notifications');

    if (!reminderTime.trim()) {
      await Notifications.cancelAllScheduledNotificationsAsync();
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

    await Notifications.cancelAllScheduledNotificationsAsync();

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

export { scheduleReminderNotification };

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

  const stateQuery = useQuery({
    queryKey: ['appState'],
    queryFn: async (): Promise<AppState> => {
      try {
        // 1. Core initialization (AsyncStorage load + Full Cloud Sync)
        const initialState = await SyncService.initialize(defaultState);
        
        // 2. Orchestrated Sync Logic (Supabase + Anonymous Login)
        const finalInitialState = await AppSync.initializeSync(initialState);

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
  const persistState = saveMutation.mutate;

  const hasHydratedRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    if (!stateQuery.data || hasHydratedRef.current) {
      return;
    }

    setState((prev) => {
      if (areStatesEqual(prev, stateQuery.data)) {
        return prev;
      }

      return stateQuery.data;
    });
    hasHydratedRef.current = true;
  }, [stateQuery.data]);

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

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      if (areStatesEqual(prev, next)) {
        return prev;
      }
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  useEffect(() => {
    const syncRevenueCatIdentity = async (userId: string | null) => {
      try {
        if (userId) {
          await Purchases.logIn(userId);
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
        if (__DEV__) {
          console.log('[AppProvider] RevenueCat identity sync failed', error);
        }
      }
    };

    const handleUserUpdate = (sessionUser: any) => {
      if (!sessionUser) {
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

      void syncRevenueCatIdentity(sessionUser.id);

      setState(prev => {
        const currentUser = prev.user;
        const nextUser: UserProfile = {
          id: sessionUser.id,
          firstName: sessionUser.user_metadata?.first_name || currentUser?.firstName || '',
          displayName: currentUser?.displayName || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name,
          onboardingComplete: currentUser?.onboardingComplete ?? true,
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

    void getSafeSession().then((session) => {
      if (session?.user) {
        handleUserUpdate(session.user);
      }
    });

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const result = supabase.auth.onAuthStateChange((_event, session) => {
        handleUserUpdate(session?.user);
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
      });

      // Sync to Supabase if logged in (use ref to avoid stale closure)
      if (stateRef.current.user?.id) {
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
    updateState({
      user: { ...user, onboardingComplete: true },
      currentDay: 1,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      journeyComplete: false,
      journeyPass: 1,
    });

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

    updateState({
      progress: updatedProgress,
      currentDay: journeyComplete ? 30 : nextDay,
      streakCount: newStreak,
      lastCompletedDate: today,
      journeyComplete,
      activeSession: null,
      ...recordSessionStartAndMaybeAdapt(duration),
      ...(autoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...autoMarks] } : {}),
    });

    const reminderToSchedule = getAdaptiveReminderTime(duration) ?? state.user?.reminderTime;
    if (reminderToSchedule) {
      void scheduleReminderNotification(reminderToSchedule, journeyComplete ? 30 : nextDay);
    }

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

  const resetJourney = useCallback(() => {
    updateState({
      currentDay: 1,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      journeyComplete: false,
      activeSession: null,
    });
  }, [updateState]);

  const continueDaily = useCallback(() => {
    updateState({
      journeyComplete: false,
      currentDay: 1,
    });
  }, [updateState]);

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

    const sessionUpdates = recordSessionStartAndMaybeAdapt(duration);
    updateState({ dailyPrayerLog: nextLog, ...sessionUpdates });

    // Extra daily-prayer sessions also count as "when I actually pray" —
    // keep the schedule honest if the adapted time moved.
    const reminderToSchedule = getAdaptiveReminderTime(duration) ?? state.user?.reminderTime;
    if (reminderToSchedule) {
      void scheduleReminderNotification(reminderToSchedule, state.currentDay);
    }
  }, [state.dailyPrayerLog, state.user?.reminderTime, state.currentDay, recordSessionStartAndMaybeAdapt, getAdaptiveReminderTime, updateState]);

  const getTodayDailyPrayerDay = useCallback(() => {
    return getDailyPrayerDayForDate(getDateString(), state.dailyPrayerLog);
  }, [state.dailyPrayerLog]);

  const toggleAmbientMute = useCallback(() => {
    setState(prev => {
      const next = { ...prev, ambientMuted: !prev.ambientMuted };
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  const setAmbientMute = useCallback((muted: boolean) => {
    updateState({ ambientMuted: muted });
  }, [updateState]);

  const setSoundscape = useCallback((soundscape: Soundscape) => {
    updateState({ soundscape });
  }, [updateState]);

  const toggleDarkMode = useCallback(() => {
    setState(prev => {
      const next = { ...prev, darkMode: true };
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  const toggleVoiceover = useCallback(() => {
    setState(prev => {
      const next = { ...prev, voiceoverEnabled: !prev.voiceoverEnabled };
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2, Math.round(rate * 10) / 10));
    updateState({ playbackRate: clamped });
  }, [updateState]);

  const setThemePreference = useCallback((themePreference: ThemePreference) => {
    updateState({
      themePreference,
      monaticTheme: themePreference === 'monastic',
    });
  }, [updateState]);

  const setMonaticTheme = useCallback((enabled: boolean) => {
    setThemePreference(enabled ? 'monastic' : 'fireside');
  }, [setThemePreference]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    updateState({ fontSize });
  }, [updateState]);

  const saveReflection = useCallback((reflection: WeeklyReflection) => {
    const updated = [...state.reflections, reflection];
    const hasContent = [reflection.q1, reflection.q2, reflection.q3]
      .some((s) => typeof s === 'string' && s.trim().length > 0);
    const completedIds = state.firstStepsCompletedIds ?? [];
    const shouldMarkHonest = hasContent && !completedIds.includes('prayer-prayed-honestly');
    updateState({
      reflections: updated,
      ...(shouldMarkHonest ? { firstStepsCompletedIds: [...completedIds, 'prayer-prayed-honestly'] } : {}),
    });
  }, [state.reflections, state.firstStepsCompletedIds, updateState]);

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
  }, []);
  
  const addAnsweredPrayer = useCallback((prayer: Omit<AnsweredPrayer, 'id' | 'date'>) => {
    const newEntry: AnsweredPrayer = {
      ...prayer,
      id: generateSecureId(),
      date: new Date().toLocaleDateString(),
    };
    const updated = [...state.answeredPrayers, newEntry];
    const completedIds = state.firstStepsCompletedIds ?? [];
    const shouldMarkAsked = !completedIds.includes('prayer-asked-god-specific');
    updateState({
      answeredPrayers: updated,
      ...(shouldMarkAsked ? { firstStepsCompletedIds: [...completedIds, 'prayer-asked-god-specific'] } : {}),
    });
  }, [state.answeredPrayers, state.firstStepsCompletedIds, updateState]);

  const addPrayerRequest = useCallback((text: string) => {
    const newEntry: PrayerRequest = {
      id: generateSecureId(),
      text,
      date: new Date().toLocaleDateString(),
      isAnswered: false,
    };
    const updated = [...state.prayerRequests, newEntry];
    const completedIds = state.firstStepsCompletedIds ?? [];
    const requestAutoMarks: string[] = [];
    if (!completedIds.includes('prayer-asked-god-specific')) requestAutoMarks.push('prayer-asked-god-specific');
    // Naming a worry to God is the act of releasing it — count it once.
    if (!completedIds.includes('inner-released-anxiety')) requestAutoMarks.push('inner-released-anxiety');
    updateState({
      prayerRequests: updated,
      ...(requestAutoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...requestAutoMarks] } : {}),
    });
  }, [state.prayerRequests, state.firstStepsCompletedIds, updateState]);

  const markPrayerAnswered = useCallback((id: string, answer: string, shareAsTestimony?: boolean) => {
    const request = state.prayerRequests.find(r => r.id === id);
    if (!request) return;

    const updatedRequests = state.prayerRequests.map(r => 
      r.id === id ? { ...r, isAnswered: true, answer, answeredAt: new Date().toISOString() } : r
    );

    const answeredEntry: AnsweredPrayer = {
      id: generateSecureId(),
      request: request.text,
      answer,
      date: new Date().toLocaleDateString(),
      ...(shareAsTestimony ? { shared: true } : {}),
    };

    const completedIds = state.firstStepsCompletedIds ?? [];
    const autoMarks: string[] = [];
    if (!completedIds.includes('prayer-asked-god-specific')) autoMarks.push('prayer-asked-god-specific');
    if (!completedIds.includes('relationships-shared-what-god-did')) autoMarks.push('relationships-shared-what-god-did');

    updateState({
      prayerRequests: updatedRequests,
      answeredPrayers: [...state.answeredPrayers, answeredEntry],
      ...(autoMarks.length > 0 ? { firstStepsCompletedIds: [...completedIds, ...autoMarks] } : {}),
    });

    // Opt-in: post to the community testimony feed. First name only, never
    // the full profile. Free for all — posting failures never lose the
    // personal record above.
    if (shareAsTestimony) {
      const firstName = state.user?.displayName?.trim() || state.user?.firstName?.trim() || 'A friend';
      void DatabaseService.createTestimony(request.text, answer, firstName).catch((e) => {
        if (__DEV__) console.log('[Testimonies] share failed:', e);
      });
    }
  }, [state.prayerRequests, state.answeredPrayers, state.firstStepsCompletedIds, state.user, updateState]);

  const deletePrayerRequest = useCallback((id: string) => {
    const updated = state.prayerRequests.filter(r => r.id !== id);
    updateState({ prayerRequests: updated });
  }, [state.prayerRequests, updateState]);

  const toggleDeclarationFavorite = useCallback((id: string) => {
    const favorites = state.declarationFavorites ?? [];
    const nextFavorites = favorites.includes(id)
      ? favorites.filter((favoriteId) => favoriteId !== id)
      : [...favorites, id];

    if (__DEV__) {
      console.log('[Declarations] Toggling favorite', { id, nextCount: nextFavorites.length });
    }

    // Auto-track: spoken a declaration over yourself the first time you favorite one.
    const completedIds = state.firstStepsCompletedIds ?? [];
    const becameFavorite = !favorites.includes(id);
    const shouldMarkDeclaration = becameFavorite && !completedIds.includes('inner-spoken-declaration');

    updateState({
      declarationFavorites: nextFavorites,
      ...(shouldMarkDeclaration ? { firstStepsCompletedIds: [...completedIds, 'inner-spoken-declaration'] } : {}),
    });
  }, [state.declarationFavorites, state.firstStepsCompletedIds, updateState]);

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

    updateState({ firstStepsCompletedIds: nextCompletedIds });
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
    updateState({ firstStepsCompletedIds: [...completedIds, id] });
  }, [updateState]);

  const startSecondPass = useCallback(() => {
    updateState({
      currentDay: 1,
      journeyPass: state.journeyPass + 1,
      journeyComplete: false,
    });
  }, [state.journeyPass, updateState]);

  const signOut = useCallback(async () => {
    SyncService.stopAutoSync();
    try {
      await supabase.auth.signOut();
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] signOut failed, clearing local state:', error);
      }
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
    const freshState: AppState = { ...defaultState };
    stateRef.current = freshState;
    setState(freshState);
  }, []);

  const deleteAccount = useCallback(async () => {
    const session = await getSafeSession();
    const accessToken = session?.access_token ?? null;

    if (!accessToken) {
      Alert.alert('Delete Account', 'Please sign in again before deleting your account.');
      return false;
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

    try {
      await supabase.auth.signOut();
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppProvider] deleteAccount signOut failed:', error);
      }
    }

    try {
      await SyncService.clearLocalState();
    } catch {
      Alert.alert('Account deleted', 'Your account was deleted, but local cleanup was incomplete. Reinstalling the app will remove the remaining local cache.');
    }

    const freshState: AppState = { ...defaultState };
    stateRef.current = freshState;
    setState(freshState);
    return true;
  }, []);

  const updateDisplayName = useCallback((displayName: string) => {
    updateState({
      user: state.user ? { ...state.user, displayName } : null,
    });
  }, [state.user, updateState]);

  const updateReminderTime = useCallback((reminderTime: string) => {
    updateState({
      user: state.user ? { ...state.user, reminderTime } : null,
    });
    // Immediately schedule the next notification with the new time
    void scheduleReminderNotification(reminderTime, state.currentDay);
  }, [state.user, state.currentDay, updateState]);

  /** Manual override: when off, reminders never drift from the picked time. */
  const setAdaptiveReminderEnabled = useCallback((enabled: boolean) => {
    updateState({ adaptiveReminderEnabled: enabled });
  }, [updateState]);

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

  const startSession = useCallback((day: number) => {
    setState((prev) => {
      if (
        prev.activeSession?.day === day &&
        prev.activeSession.phase === null &&
        prev.activeSession.secondsElapsed === 0
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
    toggleDarkMode,
    toggleVoiceover,
    setFontSize,
    saveReflection,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    deletePrayerRequest,
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
    updateActiveSession,
    startSession,
    clearActiveSession,
    syncSubscription,
    setSubscribedSinceMonthly,
    setMonaticTheme,
    setThemePreference,
    setPlaybackRate,
    scheduleNeglectedPhaseReminder,
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
    toggleDarkMode,
    toggleVoiceover,
    setFontSize,
    saveReflection,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    deletePrayerRequest,
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
  ]);
});
