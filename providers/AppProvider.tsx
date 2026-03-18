import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { AppState, UserProfile, DayProgress, Soundscape, FontSize, WeeklyReflection, AnsweredPrayer, PrayerRequest, DailyJournalEntry } from '@/types';
import { DEFAULT_SOUNDSCAPE, isSoundscape } from '@/constants/soundscapes';
import { supabase } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';
import { DAYS } from '@/mocks/content';

const STORAGE_KEY = 'amen_app_state';

const defaultState: AppState = {
  user: null,
  currentDay: 1,
  progress: [],
  streakCount: 0,
  bestStreak: 0,
  lastCompletedDate: null,
  journeyComplete: false,
  ambientMuted: false,
  soundscape: DEFAULT_SOUNDSCAPE,
  darkMode: true,
  fontSize: 'normal',
  lastOpenedDate: null,
  openStreakCount: 0,
  reflections: [],
  dailyJournalEntries: [],
  phaseTimings: {},
  answeredPrayers: [],
  prayerRequests: [],
  journeyPass: 1,
  isSubscriber: false,
  entitlements: [],
  lapsedStreakDismissed: false,
};

function getDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function calculateStreak(progress: DayProgress[], lastCompletedDate: string | null): number {
  if (!lastCompletedDate) return 0;

  const today = getDateString();
  const yesterday = getDateString(new Date(Date.now() - 86400000));
  const twoDaysAgo = getDateString(new Date(Date.now() - 172800000));

  if (lastCompletedDate !== today && lastCompletedDate !== yesterday && lastCompletedDate !== twoDaysAgo) {
    return 0;
  }

  let streak = 0;
  const sortedProgress = [...progress]
    .filter(p => p.completed && p.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (sortedProgress.length === 0) return 0;

  let checkDate = lastCompletedDate === today ? today : lastCompletedDate;
  for (const p of sortedProgress) {
    const pDate = p.completedAt!.split('T')[0];
    if (pDate === checkDate) {
      streak++;
      checkDate = getDateString(new Date(new Date(checkDate).getTime() - 86400000));
    } else if (pDate < checkDate) {
      break;
    }
  }

  return Math.max(streak, 1);
}

async function scheduleReminderNotification(reminderTime: string, nextDay: number = 1) {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    const [timePart, period] = reminderTime.split(' ');
    const [hourStr, minuteStr] = timePart.split(':');
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const dayData = DAYS[nextDay - 1] || DAYS[0];
    const messages = [
      `Day ${nextDay} is waiting — '${dayData.title}'`,
      "Let's take 5 minutes together.",
      "Your prayer time is waiting.",
      "A moment with God changes everything.",
    ];
    const body = messages[0]; // Most powerful message first
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Amen',
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (e) {
    // Failed to schedule notification
  }
}

export { scheduleReminderNotification };

function getDayDifference(fromDateString: string, toDateString: string): number {
  const from = new Date(fromDateString + 'T00:00:00').getTime();
  const to = new Date(toDateString + 'T00:00:00').getTime();
  const diff = to - from;
  return Math.floor(diff / 86400000);
}

export const [AppProvider, useApp] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AppState>(defaultState);

  const stateQuery = useQuery({
    queryKey: ['appState'],
    queryFn: async (): Promise<AppState> => {
      try {
        const initialState = await SyncService.initialize(defaultState);

        if (initialState !== defaultState) {
          const parsedRecord = initialState as unknown as Record<string, unknown>;
          const rawSoundscape = parsedRecord.soundscape;
          const streak = calculateStreak(initialState.progress, initialState.lastCompletedDate);
          const normalizedSoundscape = isSoundscape(rawSoundscape)
            ? rawSoundscape
            : DEFAULT_SOUNDSCAPE;
          const normalizedAmbientMuted = rawSoundscape === 'silence'
            ? true
            : (initialState.ambientMuted ?? defaultState.ambientMuted);

          return {
            ...defaultState,
            ...initialState,
            ambientMuted: normalizedAmbientMuted,
            soundscape: normalizedSoundscape,
            reflections: initialState.reflections ?? [],
            phaseTimings: initialState.phaseTimings ?? {},
            answeredPrayers: initialState.answeredPrayers ?? [],
            prayerRequests: initialState.prayerRequests ?? [],
            journeyPass: initialState.journeyPass ?? 1,
            streakCount: streak,
            bestStreak: Math.max(initialState.bestStreak ?? 0, streak),
            isSubscriber: initialState.isSubscriber ?? false,
            entitlements: initialState.entitlements ?? [],
            lapsedStreakDismissed: initialState.lapsedStreakDismissed ?? false,
          };
        }
        return defaultState;
      } catch (error) {
        return defaultState;
      }
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (newState: AppState) => {
      try {
        await SyncService.saveLocalState(newState);
        void SyncService.syncToCloud(newState);
        return newState;
      } catch (error) {
        return newState;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appState'] });
    },
  });
  const persistState = saveMutation.mutate;



  useEffect(() => {
    if (stateQuery.data) {
      setState(stateQuery.data);
    }
  }, [stateQuery.data]);

  useEffect(() => {
    if (!state.user) return;

    const getCurrentState = () => state;
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
      persistState(nextState);
      return nextState;
    });
  }, [state.lastOpenedDate, state.openStreakCount, stateQuery.isLoading, persistState]);

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      persistState(next);
      return next;
    });
  }, [persistState]);

  useEffect(() => {
    const handleUserUpdate = (sessionUser: any) => {
      if (!sessionUser) {
        setState(prev => {
          if (prev.user?.id) {
            const next = { ...prev, user: null };
            persistState(next);
            return next;
          }
          return prev;
        });
        return;
      }

      setState(prev => {
        const currentUser = prev.user;
        const nextUser: UserProfile = {
          id: sessionUser.id,
          firstName: sessionUser.user_metadata?.first_name || currentUser?.firstName || '',
          onboardingComplete: currentUser?.onboardingComplete ?? true,
          prayerLife: currentUser?.prayerLife || 'new',
          reminderTime: currentUser?.reminderTime || sessionUser.user_metadata?.reminder_time,
          blocker: currentUser?.blocker || sessionUser.user_metadata?.blocker,
        };
        const next = { ...prev, user: nextUser };
        persistState(next);
        return next;
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleUserUpdate(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserUpdate(session?.user);
    });

    return () => subscription.unsubscribe();
  }, [updateState, persistState]);

  // RevenueCat Subscription Listener
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleCustomerInfo = (info: CustomerInfo) => {
      const activeEntitlements = Object.keys(info.entitlements.active);
      const isSubbed = activeEntitlements.length > 0;

      updateState({
        isSubscriber: isSubbed,
        entitlements: activeEntitlements,
      });
    };

    try {
      Purchases.addCustomerInfoUpdateListener(handleCustomerInfo);

      // Initial check
      Purchases.getCustomerInfo().then(handleCustomerInfo).catch(() => {
        // Failed to fetch initial CustomerInfo
      });
    } catch (error) {
      // RevenueCat not available
    }

    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(handleCustomerInfo);
      } catch {
        // Listener may not exist
      }
    };
  }, [updateState]);

  const isPartner = useMemo(() => {
    return state.entitlements.includes('partner');
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
  }, [updateState]);

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
    const newStreak = calculateStreak(updatedProgress, today);
    const nextDay = Math.min(day + 1, 30);
    const journeyComplete = day === 30;

    updateState({
      progress: updatedProgress,
      currentDay: journeyComplete ? 30 : nextDay,
      streakCount: newStreak,
      bestStreak: Math.max(state.bestStreak ?? 0, newStreak),
      lastCompletedDate: today,
      journeyComplete,
      lapsedStreakDismissed: false,
    });

    if (state.user?.reminderTime) {
      void scheduleReminderNotification(state.user.reminderTime, journeyComplete ? 30 : nextDay);
    }
  }, [state.progress, state.user?.reminderTime, updateState]);

  const isTodayComplete = useMemo(() => {
    const today = getDateString();
    return state.lastCompletedDate === today;
  }, [state.lastCompletedDate]);

  const hasCompletedSessionToday = useMemo(() => {
    const today = getDateString();
    return state.progress.some(p => p.completed && p.completedAt?.startsWith(today));
  }, [state.progress]);

  const graceWindowRemaining = useMemo((): number | null => {
    if (!state.lastCompletedDate) return null;
    const today = getDateString();
    const yesterday = getDateString(new Date(Date.now() - 86400000));
    const twoDaysAgo = getDateString(new Date(Date.now() - 172800000));
    if (state.lastCompletedDate === today) return null;
    if (state.lastCompletedDate === yesterday) return 1;
    if (state.lastCompletedDate === twoDaysAgo) return 0;
    return null;
  }, [state.lastCompletedDate]);

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
    });
  }, [updateState]);

  const continueDaily = useCallback(() => {
    updateState({
      journeyComplete: false,
      currentDay: 1,
    });
  }, [updateState]);

  const toggleAmbientMute = useCallback(() => {
    setState(prev => {
      const next = { ...prev, ambientMuted: !prev.ambientMuted };
      persistState(next);
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
      const next = { ...prev, darkMode: !prev.darkMode };
      persistState(next);
      return next;
    });
  }, [persistState]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    updateState({ fontSize });
  }, [updateState]);

  const saveReflection = useCallback((reflection: WeeklyReflection) => {
    const updated = [...state.reflections, reflection];
    updateState({ reflections: updated });
  }, [state.reflections, updateState]);

  const addDailyJournalEntry = useCallback((day: number, text: string) => {
    const newEntry: DailyJournalEntry = {
      id: Math.random().toString(36).substr(2, 9),
      day,
      text,
      date: new Date().toLocaleDateString(),
      journeyPass: state.journeyPass,
    };
    const updated = [...state.dailyJournalEntries, newEntry];
    updateState({ dailyJournalEntries: updated });
  }, [state.dailyJournalEntries, state.journeyPass, updateState]);

  const updatePhaseTimings = useCallback((phase: string, seconds: number) => {
    const current = state.phaseTimings[phase] ?? 0;
    const updated = { ...state.phaseTimings, [phase]: current + seconds };
    updateState({ phaseTimings: updated });
  }, [state.phaseTimings, updateState]);
  
  const addAnsweredPrayer = useCallback((prayer: Omit<AnsweredPrayer, 'id' | 'date'>) => {
    const newEntry: AnsweredPrayer = {
      ...prayer,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString(),
    };
    const updated = [...state.answeredPrayers, newEntry];
    updateState({ answeredPrayers: updated });
  }, [state.answeredPrayers, updateState]);

  const addPrayerRequest = useCallback((text: string) => {
    const newEntry: PrayerRequest = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      date: new Date().toLocaleDateString(),
      isAnswered: false,
    };
    const updated = [...state.prayerRequests, newEntry];
    updateState({ prayerRequests: updated });
  }, [state.prayerRequests, updateState]);

  const markPrayerAnswered = useCallback((id: string, answer: string) => {
    const request = state.prayerRequests.find(r => r.id === id);
    if (!request) return;

    const updatedRequests = state.prayerRequests.map(r => 
      r.id === id ? { ...r, isAnswered: true, answer, answeredAt: new Date().toISOString() } : r
    );

    const answeredEntry: AnsweredPrayer = {
      id: Math.random().toString(36).substr(2, 9),
      request: request.text,
      answer,
      date: new Date().toLocaleDateString(),
    };

    updateState({ 
      prayerRequests: updatedRequests,
      answeredPrayers: [...state.answeredPrayers, answeredEntry]
    });
  }, [state.prayerRequests, state.answeredPrayers, updateState]);

  const deletePrayerRequest = useCallback((id: string) => {
    const updated = state.prayerRequests.filter(r => r.id !== id);
    updateState({ prayerRequests: updated });
  }, [state.prayerRequests, updateState]);

  const startSecondPass = useCallback(() => {
    updateState({
      currentDay: 1,
      journeyPass: state.journeyPass + 1,
      journeyComplete: false,
    });
  }, [state.journeyPass, updateState]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    updateState({ user: null });
  }, [updateState]);

  const deleteAccount = useCallback(async () => {
    // 1. Sign out of Supabase
    await supabase.auth.signOut();
    // 2. Clear all local state
    updateState({
      user: null,
      currentDay: 1,
      progress: [],
      streakCount: 0,
      lastCompletedDate: null,
      journeyComplete: false,
      reflections: [],
      phaseTimings: {},
      answeredPrayers: [],
      prayerRequests: [],
      journeyPass: 1,
    });
  }, [updateState]);

  const updateReminderTime = useCallback((reminderTime: string) => {
    updateState({
      user: state.user ? { ...state.user, reminderTime } : null,
    });
    void scheduleReminderNotification(reminderTime, state.currentDay);
  }, [state.user, state.currentDay, updateState]);

  const dismissLapsedStreak = useCallback(() => {
    updateState({ lapsedStreakDismissed: true });
  }, [updateState]);

  const isLapsedReturn = useMemo(() => {
    if (!state.lastCompletedDate) return false;
    if (state.lapsedStreakDismissed) return false;
    const today = getDateString();
    const yesterday = getDateString(new Date(Date.now() - 86400000));
    const twoDaysAgo = getDateString(new Date(Date.now() - 172800000));
    return (
      state.lastCompletedDate !== today &&
      state.lastCompletedDate !== yesterday &&
      state.lastCompletedDate !== twoDaysAgo &&
      state.streakCount === 0 &&
      state.progress.length > 0
    );
  }, [state.lastCompletedDate, state.lapsedStreakDismissed, state.streakCount, state.progress.length]);

  return useMemo(() => ({
    state,
    isLoading: stateQuery.isLoading,
    completeOnboarding,
    completeDay,
    isTodayComplete,
    hasCompletedSessionToday,
    graceWindowRemaining,
    isStreakFrozen,
    isLapsedReturn,
    dismissLapsedStreak,
    resetJourney,
    continueDaily,
    toggleAmbientMute,
    setAmbientMute,
    setSoundscape,
    toggleDarkMode,
    setFontSize,
    saveReflection,
    addDailyJournalEntry,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    deletePrayerRequest,
    startSecondPass,
    signOut,
    deleteAccount,
    updateReminderTime,
    isPartner,
  }), [
    state,
    stateQuery.isLoading,
    completeOnboarding,
    completeDay,
    isTodayComplete,
    hasCompletedSessionToday,
    graceWindowRemaining,
    isStreakFrozen,
    isLapsedReturn,
    dismissLapsedStreak,
    resetJourney,
    continueDaily,
    toggleAmbientMute,
    setAmbientMute,
    setSoundscape,
    toggleDarkMode,
    setFontSize,
    saveReflection,
    addDailyJournalEntry,
    updatePhaseTimings,
    addAnsweredPrayer,
    addPrayerRequest,
    markPrayerAnswered,
    deletePrayerRequest,
    startSecondPass,
    signOut,
    deleteAccount,
    updateReminderTime,
    isPartner,
  ]);
});
