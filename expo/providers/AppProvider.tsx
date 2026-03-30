import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { AppState, UserProfile, DayProgress, Soundscape, FontSize, WeeklyReflection, AnsweredPrayer, PrayerRequest } from '@/types';
import { DEFAULT_SOUNDSCAPE } from '@/constants/soundscapes';
import { DAYS } from '@/mocks/content';
import { AppSync } from '@/lib/sync/appSync';
import { supabase } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';
import { getTierFromEntitlements, hasFeature } from '@/services/entitlements';
import { UserTier } from '@/types';



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
  answeredPrayers: [],
  prayerRequests: [],
  journeyPass: 1,
  isSubscriber: false,
  entitlements: [],
  tierLevel: UserTier.FREE,
  voiceoverEnabled: false,
  activeSession: null,
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
    const [timePart, period] = reminderTime.split(' ');
    const [hourStr, minuteStr] = timePart.split(':');
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const dayData = DAYS[nextDay - 1] || DAYS[0];
    
    // Instead of one repeating alarm, schedule the next 14 days dynamically
    // so they feel magical, changing, and context-aware.
    const now = new Date();
    
    const contextMessages = [
      `A moment of deep peace awaits you.`,
      `Someone just prayed for exactly what you're walking through.`,
      `You're building something beautiful. Keep going.`,
      `Your spirit needs this 5 minutes today.`,
      `Notice what shifts when you give this to God.`,
      `Day ${nextDay} is unlocked. Let's step in.`,
      `Your 30-day journey is taking root.`,
      `Catch your breath. The Father is waiting.`,
    ];

    for (let i = 0; i < 14; i++) {
      const triggerDate = new Date(now);
      triggerDate.setDate(now.getDate() + i);
      triggerDate.setHours(hour, minute, 0, 0);
      
      // If the scheduled time for today has already passed, skip today.
      if (i === 0 && triggerDate.getTime() <= now.getTime()) {
        continue;
      }
      
      const isTomorrow = i === (triggerDate.getTime() > now.getTime() ? 0 : 1);
      
      let bodyText = contextMessages[i % contextMessages.length];
      if (isTomorrow && nextDay <= 30) {
        bodyText = `Day ${nextDay} is waiting — '${dayData.title}'`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Amen',
          body: bodyText,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    }
    
    if (__DEV__) {
      console.log('[Notifications] Scheduled 14 days of dynamic reminders around', hour, ':', minute);
    }
  } catch (e) {
    if (__DEV__) {
      console.log('[Notifications] Failed to schedule:', e);
    }
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
        // 1. Core initialization (AsyncStorage load + Full Cloud Sync)
        const initialState = await SyncService.initialize(defaultState);
        
        // 2. Orchestrated Sync Logic (Supabase + Anonymous Login)
        const finalInitialState = await AppSync.initializeSync(initialState);

        if (finalInitialState !== defaultState) {
          const streak = calculateStreak(finalInitialState.progress, finalInitialState.lastCompletedDate);
          
          return {
            ...defaultState,
            ...finalInitialState,
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

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      setTimeout(() => persistState(next), 0);
      return next;
    });
  }, [persistState]);

  useEffect(() => {
    const handleUserUpdate = (sessionUser: any) => {
      if (!sessionUser) {
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
        setTimeout(() => persistState(next), 0);
        return next;
      });
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
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
      const tier = getTierFromEntitlements(activeEntitlements);

      updateState({
        isSubscriber: isSubbed,
        entitlements: activeEntitlements,
        tierLevel: tier,
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
      lastCompletedDate: today,
      journeyComplete,
      activeSession: null,
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
      activeSession: null,
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
      const next = { ...prev, darkMode: !prev.darkMode };
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

  const setFontSize = useCallback((fontSize: FontSize) => {
    updateState({ fontSize });
  }, [updateState]);

  const saveReflection = useCallback((reflection: WeeklyReflection) => {
    const updated = [...state.reflections, reflection];
    updateState({ reflections: updated });
  }, [state.reflections, updateState]);

  const updatePhaseTimings = useCallback((phase: string, seconds: number) => {
    const current = state.phaseTimings[phase] ?? 0;
    const updated = { ...state.phaseTimings, [phase]: current + seconds };
    updateState({ phaseTimings: updated });
  }, [state.phaseTimings, updateState]);
  
  const addAnsweredPrayer = useCallback((prayer: Omit<AnsweredPrayer, 'id' | 'date'>) => {
    const newEntry: AnsweredPrayer = {
      ...prayer,
      id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
      date: new Date().toLocaleDateString(),
    };
    const updated = [...state.answeredPrayers, newEntry];
    updateState({ answeredPrayers: updated });
  }, [state.answeredPrayers, updateState]);

  const addPrayerRequest = useCallback((text: string) => {
    const newEntry: PrayerRequest = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
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
      id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
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
    // Immediately schedule the next notification with the new time
    void scheduleReminderNotification(reminderTime, state.currentDay);
  }, [state.user, state.currentDay, updateState]);

  const dismissCloudPrompt = useCallback(() => {
    updateState({
      user: state.user ? { ...state.user, cloudPromptDismissedAt: Date.now() } : null,
    });
  }, [state.user, updateState]);

  const updateActiveSession = useCallback((updates: Partial<NonNullable<AppState['activeSession']>>) => {
    const current = state.activeSession;
    if (!current) return;
    updateState({
      activeSession: {
        ...current,
        ...updates,
        lastUpdated: new Date().toISOString()
      }
    });
  }, [state.activeSession, updateState]);

  const startSession = useCallback((day: number) => {
    updateState({
      activeSession: {
        day,
        phase: null,
        secondsElapsed: 0,
        lastUpdated: new Date().toISOString()
      }
    });
  }, [updateState]);

  const clearActiveSession = useCallback(() => {
    updateState({ activeSession: null });
  }, [updateState]);

  const checkFeature = useCallback(
    (feature: any) => hasFeature(feature, state.tierLevel),
    [state.tierLevel]
  );

  const syncSubscription = useCallback((entitlements: string[]) => {
    const isSubbed = entitlements.length > 0;
    const tier = getTierFromEntitlements(entitlements);
    setState(prev => {
      const next: AppState = {
        ...prev,
        isSubscriber: isSubbed,
        entitlements,
        tierLevel: tier,
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
    isTodayComplete,
    hasCompletedSessionToday,
    graceWindowRemaining,
    isStreakFrozen,
    resetJourney,
    continueDaily,
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
    startSecondPass,
    signOut,
    deleteAccount,
    updateReminderTime,
    dismissCloudPrompt,
    isPartner,
    hasFeature: checkFeature,
    updateActiveSession,
    startSession,
    clearActiveSession,
    syncSubscription,
  }), [
    state,
    stateQuery.isLoading,
    completeOnboarding,
    completeDay,
    isTodayComplete,
    hasCompletedSessionToday,
    graceWindowRemaining,
    isStreakFrozen,
    resetJourney,
    continueDaily,
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
    startSecondPass,
    signOut,
    deleteAccount,
    updateReminderTime,
    dismissCloudPrompt,
    isPartner,
    checkFeature,
    updateActiveSession,
    startSession,
    clearActiveSession,
    syncSubscription,
  ]);
});
