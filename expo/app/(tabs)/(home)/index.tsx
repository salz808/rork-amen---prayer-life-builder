import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  Platform,
  Alert,
  Modal,
  Pressable,
  Share,
} from 'react-native';
import { Redirect, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Cloud,
  Heart,
  MoonStar,
  Play,
  Settings2,
  Share2,
  Sparkles,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import PrayerNotificationsSheet from '@/components/PrayerNotificationsSheet';
import { DatabaseService } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import type { PrayerNotification } from '@/lib/prayerNotifications';

import { Fonts } from '@/constants/fonts';
import { VERSES_OF_THE_DAY_ROTATION, VERSE_ROTATION_EPOCH } from '@/constants/verseRotation';
import { getDayContent, getPhaseLabel } from '@/mocks/content';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import RadialGlow from '@/components/RadialGlow';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { refreshTruthWidget } from '@/lib/truthWidget';
import { onHomeScrollToTop } from '@/lib/homeScroll';
import { dismissHomeBanner, homeBannerDismissalKey, loadDismissedHomeBanners } from '@/lib/bannerDismissals';
import { prayerDayDifference, prayerDayKey, shiftPrayerDayKey } from '@/lib/prayerDay';
import {
  foundationsCompleteFromProgress,
  getActiveTrackId,
  getFrontierStatus,
  getTrackDay,
  isGraduateFromProgress,
  resolveEffectiveTrackId,
  type FrontierStatus,
} from '@/lib/trackProgress';
import { getTrack, getTrackDay as getTrackDayContent, TRACKS } from '@/mocks/tracks';
import { getDailyGreeting } from '@/mocks/greetings';




// Round-5 lane 1, M1: the encouraging line used to run Foundations-30
// copy over any track's day count (Freedom day 14 called "halfway", and
// Freedom's day 21 got a keep-going line). dayCount makes it track-aware:
// Foundations keeps its exact lines (with the halfway beat fixed to day 15,
// where 15/30 actually is halfway); other tracks get fraction-based lines
// and a true completion line at their own final day.
function getEncouragingSub(completedDays: number, hasCompletedToday: boolean, dayCount: number = 30): string {
  // The greeting slot: until today's session is done, the line is one of
  // Kai's pool greetings, rotating by prayer day (mocks/greetings.ts) —
  // the 13 context-safe lines at day 0, the full 15 once a day is done.
  // After today's session, the line reflects journey progress instead.
  if (!hasCompletedToday || completedDays === 0) return getDailyGreeting(completedDays);
  if (dayCount !== 30) {
    if (completedDays >= dayCount) return `${dayCount} days. You walked this journey to its end. Come back anytime — He'll be here.`;
    const fraction = completedDays / dayCount;
    if (fraction < 0.25) return `${completedDays} day${completedDays === 1 ? '' : 's'} in. God heard every word.`;
    if (fraction < 0.5) return `${completedDays} days. A rhythm is beginning to form.`;
    if (fraction < 0.75) return `${completedDays} days. Look how far grace has carried you.`;
    return `The last stretch. Every day here is sacred ground.`;
  }
  if (completedDays === 1)  return "One day in. God heard every word.";
  if (completedDays === 2)  return "Two days. A rhythm is beginning to form.";
  if (completedDays === 3)  return "Three days. Something is shifting in you.";
  if (completedDays === 4)  return "Four days faithful. He is faithful too.";
  if (completedDays === 5)  return "Five days of showing up. That matters.";
  if (completedDays === 6)  return "Six days. Tomorrow, you will finish a full week.";
  if (completedDays === 7)  return "One full week. Grace has carried you here, day by day.";
  if (completedDays === 8)  return "Week two. The roots are going deeper.";
  if (completedDays === 9)  return "Nine days of faithfulness. God doesn't forget a single one.";
  if (completedDays === 10) return "Ten days. You've built something real here.";
  if (completedDays === 11) return "Eleven days. Your spirit is stronger than you know.";
  if (completedDays === 12) return "Twelve days in. Stay close. This time with Him is holy.";
  if (completedDays === 13) return "Thirteen days. The Father is shaping something in you.";
  if (completedDays === 14) return "Two weeks in. Look how far grace has carried you.";
  if (completedDays === 15) return "Halfway home. Look how far grace has carried you.";
  if (completedDays === 16) return "Sixteen days. Past the halfway point. Keep going, beloved.";
  if (completedDays === 17) return "Seventeen days. Prayer is no longer just a plan. It is a practice.";
  if (completedDays === 18) return "Eighteen days. The enemy would love to distract you. Come anyway, beloved.";
  if (completedDays === 19) return "Nineteen days. You are walking with God, day after day.";
  if (completedDays === 20) return "Twenty days. The finish line is in sight.";
  if (completedDays === 21) return "Three weeks. You have kept showing up, day after day.";
  if (completedDays <= 25)  return "The last stretch. Every day here is sacred ground.";
  if (completedDays <= 29)  return "Almost there. Hold on, beloved. He has been at work each day.";
  return "Thirty days. You built a prayer life. Come back anytime — He'll be here.";
}


const SECTION_LABELS: Record<string, string> = {
  settle: "Let's Pray",
  focus: 'Focus',
  thank: 'Thank',
  repent: 'Repent',
  invite: 'Invite',
  ask: 'Ask',
  declare: 'Declare',
  selah: 'Selah',
  act: 'Live It',
  verse: 'Verse',
};

export default function HomeScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const router = useRouter();

  const {
    state,
    isLoading,
    stateLoadError,
    reloadState,
    hasCompletedSessionToday,
    graceWindowRemaining,
    resetJourney,
    isStreakFrozen,
    hasFeature,
    hasCompletedDailyPrayerToday,
    markGraceExplainerSeen,
    markGraceExplainerShown,
    getTodayDailyPrayerSelection,
    // TRIAD fixes H2 + H5: prayer-day key (re-renders this screen at
    // the 4 AM boundary) + track refresh (catches a just-finished
    // Freedom session on Home focus).
    prayerDay,
    refreshTrackPrayerDays,
    refreshDailyPrayerPool,
    suggestedReminderHour,
    annualUpsellEligible,
  } = useApp();
  // Wave 2, fix 1 (feedback #19): the tab layout has no scroll ref to
  // call (SDK 56+ forbids @react-navigation imports), so Home owns its
  // own ScrollView ref and scrolls it when the tab bar emits a re-tap
  // event. Previously this ScrollView had no ref at all, so nothing
  // could scroll it.
  const homeScrollRef = useRef<ScrollView>(null);
  useEffect(
    () =>
      onHomeScrollToTop(() => {
        homeScrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
    [],
  );
  const [dailyPrayerLockVisible, setDailyPrayerLockVisible] = React.useState<boolean>(false);
  const [verseModalVisible, setVerseModalVisible] = React.useState<boolean>(false);
  const [activeTrackId, setActiveTrackIdState] = React.useState<string>('foundations');
  const [activeTrackDay, setActiveTrackDayState] = React.useState<number>(1);
  const [frontierStatus, setFrontierStatus] = React.useState<FrontierStatus | null>(null);
  // First-frame correctness: the active track resolves asynchronously, and
  // until the first load lands the screen would paint the Foundations
  // today-card/progress for a user actually walking Freedom. The main
  // render waits for this; later focus reloads keep it true (no re-gate).
  const [trackStateReady, setTrackStateReady] = React.useState<boolean>(false);

  // ── "Someone prayed for you" bell ──────────────────────────────────────
  // In-app only, not push: the count refreshes when Home gains focus and
  // live-updates from the author's own prayer_notifications rows while
  // the app is open. Nothing here wakes a closed app.
  const [prayerUnseenCount, setPrayerUnseenCount] = React.useState<number>(0);
  const [prayerSheetVisible, setPrayerSheetVisible] = React.useState<boolean>(false);
  const [prayerNotifications, setPrayerNotifications] = React.useState<PrayerNotification[]>([]);
  const [prayerNotificationsLoading, setPrayerNotificationsLoading] = React.useState<boolean>(false);

  const refreshPrayerUnseenCount = React.useCallback(async () => {
    try {
      setPrayerUnseenCount(await DatabaseService.getUnseenPrayerNotificationCount());
    } catch {
      // Bell degrades to quiet: a failed count is not an error to surface.
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshPrayerUnseenCount();
    }, [refreshPrayerUnseenCount])
  );

  React.useEffect(() => {
    const userId = state.user?.id;
    if (!userId) return;
    // Unconfigured client: no Realtime subscription; the focus refetch
    // above still covers the bell.
    if (!supabase) return;
    // Narrowed local binding: TS resets imported-variable narrowing
    // inside closures (the cleanup below), so capture it once here.
    const client = supabase;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    try {
      channel = client
        .channel('prayer-notifications-home')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'prayer_notifications', filter: `recipient_id=eq.${userId}` },
          () => {
            void refreshPrayerUnseenCount();
          }
        )
        .subscribe();
    } catch {
      // Realtime unavailable — focus refetch still covers the bell.
    }
    return () => {
      if (channel) void client.removeChannel(channel);
    };
  }, [state.user?.id, refreshPrayerUnseenCount]);

  const openPrayerNotifications = React.useCallback(async () => {
    setPrayerSheetVisible(true);
    setPrayerNotificationsLoading(true);
    try {
      const list = await DatabaseService.getPrayerNotifications();
      setPrayerNotifications(list);
      // Audit round 3, J-S5: mark only the notifications actually
      // displayed. The old mark-all silently swallowed unseen entries
      // beyond the 50-item cap; the unseen-first ordering in
      // getPrayerNotifications means the queue now drains across opens.
      await DatabaseService.markPrayerNotificationsSeen(list.map((n) => n.id));
      // Round 3 fix: the old code hard-set the badge to 0 here even
      // though only the displayed (max 50) rows were marked — with
      // >50 unseen, the badge lied until the next Home focus.
      // Re-read the true unseen count instead.
      await refreshPrayerUnseenCount();
    } catch {
      setPrayerNotifications([]);
    } finally {
      setPrayerNotificationsLoading(false);
    }
  }, [refreshPrayerUnseenCount]);

  const handlePrayerNotificationPress = React.useCallback(
    (echoId: string) => {
      setPrayerSheetVisible(false);
      // Audit round 3, J-B12: the nonce makes repeat taps re-land even
      // when the wall already handled this echo id once.
      router.push({ pathname: '/(tabs)/community', params: { highlightEchoId: echoId, highlightNonce: String(Date.now()) } });
    },
    [router]
  );

  // Reload track state whenever Home gains focus — completing a session
  // advances the frontier and may close today's pacing window.
  // TRIAD fix H2: the track-completion refresh runs here too, so a
  // Freedom session finished just before returning to Home feeds the
  // streak and the greeting slot (which read provider state) without
  // waiting for a restart or a foreground event.
  useFocusEffect(
    React.useCallback(() => {
      void refreshTrackPrayerDays();
      // Daily Prayer expansion: the pool refresh runs here too, so a
      // track session finished just before returning to Home can
      // join the rotation without waiting for a restart.
      void refreshDailyPrayerPool();
      void (async () => {
        try {
          const trackId = await getActiveTrackId();
          // Kai-approved 2026-10-26: gating uses the sticky graduate
          // flag, so a second pass does not bounce a graduate back.
          const foundationsDone = isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated);
          const effective = resolveEffectiveTrackId(trackId, foundationsDone);
          setActiveTrackIdState(effective);
          const day = await getTrackDay(effective);
          setActiveTrackDayState(day);
          setFrontierStatus(effective !== 'foundations' ? await getFrontierStatus(effective) : null);
        } catch {
          // Keep whatever is on screen; the next focus retries.
        } finally {
          setTrackStateReady(true);
        }
      })();
    }, [state.progress, state.journeyComplete, state.hasGraduated, refreshTrackPrayerDays, refreshDailyPrayerPool])
  );

  const greetingFade = useState(() => new Animated.Value(0))[0]
  const greetingSlide = useState(() => new Animated.Value(16))[0]
  const heroFade = useState(() => new Animated.Value(0))[0]
  const heroSlide = useState(() => new Animated.Value(16))[0]
  const streakFade = useState(() => new Animated.Value(0))[0]
  const streakSlide = useState(() => new Animated.Value(16))[0]
  const restFade = useState(() => new Animated.Value(0))[0]
  const restSlide = useState(() => new Animated.Value(16))[0]
  const glowPulse = useState(() => new Animated.Value(0.25))[0]
  const progressWidth = useState(() => new Animated.Value(0))[0]

  const completedDays = useMemo(
    () => state.progress.filter((item) => item.completed).length,
    [state.progress]
  );

  // Beginner Home speaks journey language, not track names: the journeys
  // door stays hidden until Foundations is finished, and "Revisit past
  // days" only appears once there is a past day to revisit.
  // Kai-approved 2026-10-26: this is a gating decision, so it uses the
  // sticky graduate flag — a graduate on a second pass keeps the door.
  const foundationsDone = isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated);

  // ── Track-aware journey math: every number on Home derives from the
  // ACTIVE track (its length, its completed days), never Foundations-only.
  const isFoundationsHome = activeTrackId === 'foundations';
  const activeTrackDayCount = getTrack(activeTrackId)?.dayCount ?? 30;
  const trackCompletedDays = isFoundationsHome
    ? completedDays
    : frontierStatus?.completedDays ?? Math.max(0, activeTrackDay - 1);
  const progressPercent = useMemo(
    () => Math.max(3.3, Math.min(100, (trackCompletedDays / activeTrackDayCount) * 100)),
    [trackCompletedDays, activeTrackDayCount]
  );
  // Foundations keeps its 7/14/21 week ticks; other lengths use thirds
  // (Freedom 21 → 7/14/21 as well).
  const milestoneBounds = useMemo(
    () =>
      activeTrackDayCount === 30
        ? [7, 14, 21, 30]
        : [
            Math.round(activeTrackDayCount / 3),
            Math.round((2 * activeTrackDayCount) / 3),
            activeTrackDayCount,
          ],
    [activeTrackDayCount]
  );

  useEffect(() => {
    // Keep the home-screen widget showing today's truth.
    void refreshTruthWidget();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.55,
          duration: 5000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.25,
          duration: 5000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(greetingFade, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(greetingSlide, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(heroFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(streakFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(streakSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(restFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(restSlide, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [glowPulse, greetingFade, greetingSlide, heroFade, heroSlide, restFade, restSlide, streakFade, streakSlide]);

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: progressPercent,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressWidth]);

  const displayDay = useMemo(
    () => (hasCompletedSessionToday && state.currentDay > 1) ? state.currentDay - 1 : state.currentDay,
    [hasCompletedSessionToday, state.currentDay]
  );
  const dayContent = useMemo(() => getDayContent(displayDay), [displayDay]);
  const phaseLabel = useMemo(() => getPhaseLabel(displayDay), [displayDay]);
  const showGraceBadge = useMemo(
    () => graceWindowRemaining !== null && state.streakCount > 0,
    [graceWindowRemaining, state.streakCount]
  );
  const graceUrgent = useMemo(() => graceWindowRemaining === 0, [graceWindowRemaining]);
  // Kai-approved 2026-10-26: first-time grace explainer — shown for
  // the whole first grace window, then marked seen when that window
  // closes (prayed / streak resumes), so it never repeats on later
  // windows. Marking seen on display would flash it away in one frame.
  // Audit fix F9: the shown fact is PERSISTED (markGraceExplainerShown),
  // not a mount-scoped ref — the old ref lost it when the window
  // closed while the app was closed, so the explainer re-showed on the
  // next window. Now a close-while-closed still marks seen on the next
  // launch (badge off + shown persisted), and the explainer shows once.
  const showGraceExplainer = showGraceBadge && !state.graceExplainerSeen;
  React.useEffect(() => {
    if (showGraceBadge && !state.graceExplainerSeen && !state.graceExplainerShown) {
      markGraceExplainerShown();
    }
    if (!showGraceBadge && state.graceExplainerShown && !state.graceExplainerSeen) {
      markGraceExplainerSeen();
    }
  }, [showGraceBadge, state.graceExplainerSeen, state.graceExplainerShown, markGraceExplainerSeen, markGraceExplainerShown]);

  // Grace over guilt: when a streak has fully broken, greet the returning
  // user warmly instead of showing them nothing (or a zero).
  const showWelcomeBack = useMemo(
    () => state.streakCount === 0 && !!state.lastCompletedDate && !hasCompletedSessionToday,
    [state.streakCount, state.lastCompletedDate, hasCompletedSessionToday]
  );
  const greetingName = useMemo(() => state.user?.firstName || 'Friend', [state.user?.firstName]);
  const encouragingSub = useMemo(() => getEncouragingSub(trackCompletedDays, hasCompletedSessionToday, activeTrackDayCount), [trackCompletedDays, hasCompletedSessionToday, activeTrackDayCount]);
  // F39: Daily Prayer Mode is free for all graduates — journey completion
  // (the journeyComplete flag, or 30 completed days in progress) grants
  // access regardless of tier. The tier-based feature check stays as a
  // fallback for anyone the tier system already covers.
  const isGraduate = useMemo(
    () => isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated),
    [state.progress, state.journeyComplete, state.hasGraduated]
  );
  const hasDailyPrayerAccess = useMemo(
    () => isGraduate || Boolean(hasFeature('DAILY_PRAYER_POST_30')),
    [hasFeature, isGraduate]
  );
  const reflectionsCount = state.reflections?.length ?? 0;
  const reflectionsTarget = 4; // a reflection per week
  const reflectionPercent = Math.min(1, reflectionsCount / reflectionsTarget);

  // Smart reminder suggestion: only show if user has a reminder time AND median completion is >± 90 min away
  const reminderSuggestion = useMemo(() => {
    if (suggestedReminderHour === null) return null;
    const reminder = state.user?.reminderTime;
    if (!reminder) return null;
    const [tp, period] = reminder.split(' ');
    const [hStr] = (tp ?? '').split(':');
    let h = parseInt(hStr ?? '', 10);
    if (Number.isNaN(h)) return null;
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const delta = Math.abs(h - suggestedReminderHour);
    if (delta < 2) return null;
    const sH = suggestedReminderHour;
    const ampm = sH >= 12 ? 'PM' : 'AM';
    const display = ((sH % 12) || 12);
    return `${display}:00 ${ampm}`;
  }, [suggestedReminderHour, state.user?.reminderTime]);
  // TRIAD fix H5: getTodayDailyPrayerSelection's identity already
  // changes at the provider's 4 AM tick and on pool refresh, so this
  // memo flips with it; the verse and recap below read prayerDay
  // directly for the same tick.
  // Daily Prayer expansion (Kai, 2026-10-26): today's advertised
  // revisit is a (track, day) selection — Foundations always, plus
  // reached days of tracks the user has started. The CTA shows that
  // track's day title with a track label when it is not Foundations,
  // so a Freedom Day 5 is never advertised as a Foundations Day 5.
  // This is a revisit, never fresh content.
  const dailyPrayerSelection = useMemo(() => getTodayDailyPrayerSelection(), [getTodayDailyPrayerSelection]);
  const dailyPrayerDay = dailyPrayerSelection.day;
  const dailyPrayerTrackTitle = dailyPrayerSelection.trackId === 'foundations'
    ? null
    : (getTrack(dailyPrayerSelection.trackId)?.title ?? null);
  const dailyPrayerContent = useMemo(() => {
    if (dailyPrayerSelection.trackId !== 'foundations') {
      const trackDay = getTrackDayContent(dailyPrayerSelection.trackId, dailyPrayerSelection.day);
      if (trackDay) return { title: trackDay.title };
    }
    return getDayContent(dailyPrayerDay);
  }, [dailyPrayerSelection, dailyPrayerDay]);
  const todayLabel = useMemo(() => new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }), [prayerDay]);

  // Verse of the Day from the 226-verse rotation bank, keyed to the prayer
  // day (4 AM local boundary, lib/prayerDay.ts) so it flips with the rest of
  // the app's day and cycles the full bank before repeating.
  const todayVerse = useMemo(() => {
    const bank = VERSES_OF_THE_DAY_ROTATION;
    const daysSinceEpoch = prayerDayDifference(VERSE_ROTATION_EPOCH, prayerDay);
    const index = ((daysSinceEpoch % bank.length) + bank.length) % bank.length;
    return bank[index];
  }, [prayerDay]);

  const handleShareVerse = async () => {
    const shareText = `“${todayVerse.text}”\n— ${todayVerse.reference}\n\nShared from TRIAD Prayer`; 
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: `Verse of the Day — ${todayVerse.reference}`, text: shareText });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(shareText);
          Alert.alert('Copied', 'The verse has been copied to your clipboard.');
          return;
        }
        Alert.alert('Sharing unavailable', 'Your browser does not support sharing. Please try on the mobile app.');
      } catch (error) {
        if (__DEV__) console.log('[VerseShare] web error:', error);
      }
      return;
    }
    try {
      await Share.share({ message: shareText, title: `Verse of the Day — ${todayVerse.reference}` });
    } catch (error) {
      if (__DEV__) console.log('[VerseShare] share error:', error);
    }
  };


  // Weekly Recap stats — visible at week boundaries (Day 8 / 15 / 22 / 29) once user has 7+ days.
  const weeklyRecap = useMemo(() => {
    if (state.currentDay < 8) return null;
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      last7Days.push(shiftPrayerDayKey(prayerDay, -i));
    }
    const completedThisWeek = state.progress.filter((p) => {
      if (!p.completed || !p.completedAt) return false;
      return last7Days.includes(prayerDayKey(new Date(p.completedAt)));
    }).length;
    if (completedThisWeek === 0) return null;
    const totalSeconds = Object.values(state.phaseTimings ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    const minutes = Math.max(1, Math.round(totalSeconds / 60));
    const reflectionsThisWeek = (state.reflections ?? []).filter((r: any) => {
      const t = r?.createdAt ?? r?.date;
      if (!t) return false;
      const ts = typeof t === 'number' ? t : new Date(t).getTime();
      return Date.now() - ts < 7 * 86400000;
    }).length;
    return { completedThisWeek, minutes, reflectionsThisWeek };
  }, [state.currentDay, state.progress, state.phaseTimings, state.reflections, prayerDay]);

  // Prompt banners: at most ONE visible at a time, most time-sensitive
  // first — the rest live in Settings. "Begin Today's Prayer" must never be
  // pushed below the fold by a stack of prompts.
  // Wave 2, fix 6 (feedback #27): dismissals persist in AsyncStorage
  // (see lib/bannerDismissals) and load on mount. Until the load lands,
  // a previously-dismissed banner can flash for one frame — the load
  // resolves on the same tick as the first paint in practice, and the
  // alternative (holding all banners until storage reads) would delay
  // banners that were never dismissed.
  const [dismissedBanners, setDismissedBanners] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void loadDismissedHomeBanners().then((keys) => {
      if (!cancelled) setDismissedBanners(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissBanner = (key: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedBanners((prev) => new Set(prev).add(key));
    void dismissHomeBanner(key);
  };
  const cloudDismissedAt = state.user?.cloudPromptDismissedAt;
  const showCloudPrompt =
    !state.user?.id &&
    state.currentDay >= 2 &&
    (!cloudDismissedAt ||
      (state.currentDay >= 5 && cloudDismissedAt < Date.now() - 3 * 24 * 60 * 60 * 1000));
  // Priority order is unchanged; a dismissed banner is skipped and the
  // next eligible banner shows instead (still at most one). The cloud
  // banner is untouched here — it already has its own Maybe-later
  // dismissal on the auth screen (dismissCloudPrompt).
  const visibleBanner: 'reminder' | 'cloud' | 'reminderSetup' | 'annual' | null =
    reminderSuggestion && !dismissedBanners.has(homeBannerDismissalKey('reminder', reminderSuggestion))
      ? 'reminder'
      : showCloudPrompt
        ? 'cloud'
        : state.user?.reminderTime === '' && state.currentDay >= 3 && !dismissedBanners.has(homeBannerDismissalKey('reminderSetup'))
          ? 'reminderSetup'
          : annualUpsellEligible && !dismissedBanners.has(homeBannerDismissalKey('annual'))
            ? 'annual'
            : null;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View pointerEvents="none" style={[styles.loadingGlow, { opacity: glowPulse }]}>
          <RadialGlow size={280} maxOpacity={0.14} />
        </Animated.View>
        <View style={styles.loadingContent}>
          <View style={styles.loadingHeaderSkeleton} />
          <View style={styles.loadingHeroSkeleton} />
          <View style={styles.loadingRowSkeleton} />
          <View style={styles.loadingRowSkeletonShort} />
        </View>
      </View>
    );
  }

  // Audit round 3, J-S13: a failed load presents as a brand-new user
  // (onboardingComplete false on default state) — never redirect that
  // stand-in to onboarding, and never let it overwrite anything (the
  // provider suppresses persistence while the flag is set). The banner
  // below explains the state instead of silently showing Day 1.
  if (!state.user?.onboardingComplete && !stateLoadError) {
    return <Redirect href="/onboarding" />;
  }

  // handleShare and selectedContent are removed as they were part of the old ReviewModal logic

  // Graduation is a Foundations state: a graduate browsing another track
  // must see that track's today card, not the Foundations completion
  // screen (which used to hijack Home on every track after graduation).
  if (state.journeyComplete && isFoundationsHome) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[C.background, C.surface, C.background]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.completionContainer}>
            <View style={styles.completionOrb}>
              <View style={styles.completionInnerOrb}>
                <Check size={28} color={C.accent} strokeWidth={2.4} />
              </View>
            </View>
            <Text style={[styles.completionEyebrow, { fontFamily: Fonts.titleMedium }]}>JOURNEY COMPLETE</Text>
            <Text style={[styles.completionTitle, { fontFamily: Fonts.serifLight }]}>Keep meeting Him daily.</Text>
            <Text style={[styles.completionMessage, { fontFamily: Fonts.italic }]}>
              {hasDailyPrayerAccess
                // Daily Prayer expansion (Kai, 2026-10-26): one prayer
                // each day, chosen for you — a revisit of a day from a
                // journey you have started (Foundations always, plus
                // started tracks). Never "fresh" content, never an
                // unstarted track's day. The track label appears only
                // for non-Foundations selections. Kai-approved
                // 2026-10-28: the Home fallback/lock wording keeps
                // those two fragments verbatim and drops the
                // Foundations-only trailing clause (no "30-day
                // journey" claim here); session lock text untouched.
                ? `${todayLabel} · Today’s prayer, chosen for you, is ${dailyPrayerTrackTitle ? `${dailyPrayerTrackTitle} ` : ''}Day ${dailyPrayerDay}: ${dailyPrayerContent.title}.`
                : 'Daily Prayer is one prayer each day, chosen for you — a revisit of a day from a journey you have started. It is free for everyone who completes it.'}
            </Text>
            {hasCompletedDailyPrayerToday ? (
              <View style={styles.completedSessionCTA}>
                <Check size={16} color={C.accent} strokeWidth={3} />
                <Text style={[styles.completedSessionCTAText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>YOU PRAYED TODAY</Text>
              </View>
            ) : (
              <AnimatedPressable
                style={[styles.goldBorderButton, !hasDailyPrayerAccess && { opacity: 0.55 }]}
                onPress={() => {
                  if (!hasDailyPrayerAccess) {
                    setDailyPrayerLockVisible(true);
                    return;
                  }
                  router.push(`/session?day=${dailyPrayerDay}&mode=daily-prayer&track=${dailyPrayerSelection.trackId}`);
                }}
                scaleValue={0.96}
                testID="daily-prayer-cta"
              >
                <Play size={15} color={C.accent} fill={C.accent} />
                <Text style={[styles.goldBorderButtonText, { fontFamily: Fonts.titleLight }]}>DAILY PRAYER</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable
              style={styles.ghostButton}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/tracks');
              }}
              scaleValue={0.97}
              testID="complete-see-journeys"
            >
              <Text style={[styles.ghostButtonText, { fontFamily: Fonts.titleLight }]}>See Your Journeys</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.ghostButton}
              onPress={() => {
                Alert.alert(
                  'Restart the 30-day journey?',
                  'This starts Day 1 again. Your journal and answered prayers will stay safe.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Restart', style: 'destructive', onPress: resetJourney },
                  ]
                );
              }}
              scaleValue={0.97}
              testID="restart-journey"
            >
              <Text style={[styles.ghostButtonText, { fontFamily: Fonts.titleLight }]}>Restart 30 Days</Text>
            </AnimatedPressable>
          </View>
        </SafeAreaView>
        <FeatureLockSheet
          visible={dailyPrayerLockVisible}
          onClose={() => setDailyPrayerLockVisible(false)}
          featureName="Daily Prayer Mode"
          requirement="Graduates"
          description="Daily Prayer is one prayer each day, chosen for you — a revisit of a day from a journey you have started. It opens when you finish your journey, free for everyone who completes it."
        />
      </View>
    );
  }

  // Until the first track load lands, show the loading skeleton rather
  // than a Foundations today-card that may belong to the wrong journey.
  if (!trackStateReady) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View pointerEvents="none" style={[styles.loadingGlow, { opacity: glowPulse }]}>
          <RadialGlow size={280} maxOpacity={0.14} />
        </Animated.View>
        <View style={styles.loadingContent}>
          <View style={styles.loadingHeaderSkeleton} />
          <View style={styles.loadingHeroSkeleton} />
          <View style={styles.loadingRowSkeleton} />
          <View style={styles.loadingRowSkeletonShort} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[C.bgGradient1, C.bgGradient2, C.surface, C.bgGradient3]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <Animated.View style={[styles.ambientWrap, { opacity: glowPulse }]} pointerEvents="none">
        <View style={styles.ambientTopGlow}>
          <RadialGlow size={560} maxOpacity={0.18} style={styles.ambientEllipse} />
        </View>
        <View style={styles.ambientTopGlowWide}>
          <RadialGlow size={700} maxOpacity={0.12} style={styles.ambientWideEllipse} />
        </View>
        <View style={styles.ambientSideGlow}>
          <RadialGlow size={360} r={222} g={152} b={92} maxOpacity={0.12} />
        </View>
        <View style={styles.ambientLowerGlow}>
          <RadialGlow size={340} r={176} g={117} b={71} maxOpacity={0.08} />
        </View>
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          ref={homeScrollRef}
          bounces={true}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: greetingFade,
              transform: [{ translateY: greetingSlide }],
            }}
          >
            <View style={styles.topBar}>
              <View style={styles.topBarLeft}>
                {/* Streak pill removed from the top bar — the streak card
                    below carries it (one streak, one place). */}
                {showGraceBadge ? (
                  <View style={[styles.streakPill, graceUrgent && styles.streakPillUrgent]}>
                    <AlertTriangle size={13} color={graceUrgent ? C.rose : C.accent} />
                    <Text style={[styles.streakText, { fontFamily: Fonts.titleMedium, color: graceUrgent ? C.rose : C.streakText }]}>
                      {graceUrgent ? 'Pray today' : 'Streak safe for now'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.topBarRight}>
                <AnimatedPressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void openPrayerNotifications();
                  }}
                  scaleValue={0.97}
                  style={styles.settingsBtn}
                  hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
                  testID="open-prayer-notifications"
                  accessibilityLabel="Prayed for you notifications"
                  accessibilityRole="button"
                >
                  <Bell size={17} color={C.settingsIcon} />
                  {prayerUnseenCount > 0 ? <View style={styles.bellBadgeDot} /> : null}
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/settings');
                  }}
                  scaleValue={0.97}
                  style={styles.settingsBtn}
                  hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
                  testID="open-settings"
                  accessibilityLabel="Open settings"
                  accessibilityRole="button"
                >
                  <Settings2 size={17} color={C.settingsIcon} />
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.greetingSection}>
              <View style={styles.greetingGlow} pointerEvents="none">
                <RadialGlow size={300} r={223} g={161} b={97} maxOpacity={0.11} style={styles.greetingGlowShape} />
              </View>
              <Text style={[styles.greetingLabel, { fontFamily: Fonts.titleLight }]}>
                {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
              </Text>
              <Text
                style={[styles.greetingName, { fontFamily: Fonts.serifRegular }]}
              >
                {greetingName}
              </Text>
              <Text style={[styles.greetingSub, { fontFamily: Fonts.italic }]} numberOfLines={3}>
                {encouragingSub}
              </Text>
            </View>

            {/* Quick actions removed: SOS moved to Declarations, Bless is now contextual,
                Journey lives in the progress section below. */}

            <Animated.View
              style={{
                opacity: streakFade,
                transform: [{ translateY: streakSlide }],
              }}
            >
              {state.streakCount > 0 ? (
                <View style={[styles.streakCard, isStreakFrozen && styles.streakCardFrozen]}>
                  <Text style={styles.streakCardEmoji}>{isStreakFrozen ? '🧊' : '🔥'}</Text>
                  <Text style={[styles.streakCardText, { fontFamily: Fonts.titleLight }, isStreakFrozen && styles.streakCardTextFrozen]}>
                    <Text style={[styles.streakCardStrong, { fontFamily: Fonts.titleMedium }, isStreakFrozen && styles.streakCardStrongFrozen]}>
                      {state.streakCount}-day streak
                    </Text>
                    {isStreakFrozen ? ' · Streak safe for now' : ' · Keep walking in freedom'}
                  </Text>
                </View>
              ) : showWelcomeBack ? (
                <View style={styles.welcomeCard}>
                  <Text style={styles.welcomeEmoji}>🕊</Text>
                  <Text style={[styles.welcomeTitle, { fontFamily: Fonts.serifLight }]}>Welcome back.</Text>
                  <Text style={[styles.welcomeText, { fontFamily: Fonts.italic }]}>
                    You haven&apos;t lost a thing. Prayer isn&apos;t a streak — it&apos;s a relationship. Today is a fresh start.
                  </Text>
                  <AnimatedPressable
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/session');
                    }}
                    scaleValue={0.97}
                    style={styles.welcomeBtn}
                    testID="welcome-back-cta"
                  >
                    <Text style={[styles.welcomeBtnText, { fontFamily: Fonts.titleBold }]}>PRAY TODAY</Text>
                  </AnimatedPressable>
                </View>
              ) : null}
              {/* Kai-approved 2026-10-26, first-time grace explainer:
                  a missed day is covered briefly — shown once only. */}
              {showGraceExplainer ? (
                <Text
                  style={[{ color: C.textSecondary, fontFamily: Fonts.titleRegular, fontSize: T.size.caption, lineHeight: T.leading.caption, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }]}
                  testID="grace-explainer"
                >
                  Missed a day? Your streak is covered briefly — pray today to keep it going.
                </Text>
              ) : null}
            </Animated.View>

            {stateLoadError ? (
              <View style={styles.loadErrorBanner} testID="home-load-error">
                <Text style={[styles.loadErrorText, { fontFamily: Fonts.titleMedium }]}>
                  Your saved progress couldn’t load — what you see may be incomplete.
                </Text>
                <Pressable
                  onPress={() => void reloadState()}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  style={styles.loadErrorRetry}
                >
                  <Text style={[styles.loadErrorRetryText, { fontFamily: Fonts.titleBold }]}>RETRY</Text>
                </Pressable>
              </View>
            ) : null}

            {visibleBanner === 'cloud' ? (
              <AnimatedPressable
                onPress={() => router.push('/auth')}
                scaleValue={0.97}
                style={styles.authSoftPrompt}
                testID="cloud-save-prompt"
              >
                <Cloud size={14} color={C.accentDark} />
                <Text style={[styles.authSoftPromptText, { fontFamily: Fonts.titleMedium }]}>
                  SAVE YOUR PROGRESS TO THE CLOUD
                </Text>
                <ChevronRight size={12} color={C.chevronMuted} />
              </AnimatedPressable>
            ) : null}

            {/* Smart reminder suggestion — Wave 2, fix 6: the ×
                dismisses this suggestion persistently (per suggestion
                value, so a future different suggestion still shows).
                The × is a sibling of the action pressable, never nested
                in it, so dismissing never navigates. */}
            {visibleBanner === 'reminder' && reminderSuggestion ? (
              <View style={styles.reminderPrompt}>
                <AnimatedPressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/settings');
                  }}
                  scaleValue={0.97}
                  style={styles.bannerAction}
                  testID="smart-reminder-prompt"
                >
                  <Bell size={14} color={C.accentDark} />
                  <Text style={[styles.reminderPromptText, { fontFamily: Fonts.titleMedium }]}>
                    YOU OFTEN PRAY AROUND {reminderSuggestion} · SHIFT REMINDER?
                  </Text>
                  <ChevronRight size={12} color={C.chevronMuted} />
                </AnimatedPressable>
                <Pressable
                  onPress={() => dismissBanner(homeBannerDismissalKey('reminder', reminderSuggestion))}
                  hitSlop={12}
                  style={styles.bannerDismiss}
                  testID="dismiss-smart-reminder-prompt"
                  accessibilityLabel="Dismiss reminder suggestion"
                  accessibilityRole="button"
                >
                  <X size={16} color={C.chevronMuted} />
                </Pressable>
              </View>
            ) : null}

            {/* Annual upsell banner — monthly subscribers 90+ days.
                Wave 2, fix 6: dismissible, and a dismissal sticks. */}
            {visibleBanner === 'annual' ? (
              <View style={styles.reminderPrompt}>
                <AnimatedPressable
                  onPress={() => router.push('/paywall')}
                  scaleValue={0.97}
                  style={styles.bannerAction}
                  testID="annual-upsell-prompt"
                >
                  <Heart size={14} color={C.accentDark} />
                  <Text style={[styles.reminderPromptText, { fontFamily: Fonts.titleMedium }]}>
                    SWITCH TO ANNUAL · $39.99 A YEAR
                  </Text>
                  <ChevronRight size={12} color={C.chevronMuted} />
                </AnimatedPressable>
                <Pressable
                  onPress={() => dismissBanner(homeBannerDismissalKey('annual'))}
                  hitSlop={12}
                  style={styles.bannerDismiss}
                  testID="dismiss-annual-upsell-prompt"
                  accessibilityLabel="Dismiss annual offer"
                  accessibilityRole="button"
                >
                  <X size={16} color={C.chevronMuted} />
                </Pressable>
              </View>
            ) : null}

            {/* Reminder re-prompt — shows Day 3+ if user skipped.
                Wave 2, fix 6: dismissible, and a dismissal sticks. */}
            {visibleBanner === 'reminderSetup' && (
              <View style={styles.reminderPrompt}>
                <AnimatedPressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/settings');
                  }}
                  scaleValue={0.97}
                  style={styles.bannerAction}
                  testID="reminder-prompt"
                >
                  <Bell size={14} color={C.accentDark} />
                  <Text style={[styles.reminderPromptText, { fontFamily: Fonts.titleMedium }]}>
                    A GENTLE DAILY REMINDER — SET YOURS
                  </Text>
                  <ChevronRight size={12} color={C.chevronMuted} />
                </AnimatedPressable>
                <Pressable
                  onPress={() => dismissBanner(homeBannerDismissalKey('reminderSetup'))}
                  hitSlop={12}
                  style={styles.bannerDismiss}
                  testID="dismiss-reminder-prompt"
                  accessibilityLabel="Dismiss reminder suggestion"
                  accessibilityRole="button"
                >
                  <X size={16} color={C.chevronMuted} />
                </Pressable>
              </View>
            )}
          </Animated.View>

          <Animated.View
            style={{
              opacity: heroFade,
              transform: [{ translateY: heroSlide }],
            }}
          >
            <AnimatedPressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/tracks');
              }}
              scaleValue={0.98}
              style={styles.progressSection}
              testID="journey-progress-cta"
            >
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progressLabel, { fontFamily: Fonts.titleMedium }]} numberOfLines={1}>JOURNEY TO WHOLENESS</Text>
                <Text style={[styles.progressDay, { fontFamily: Fonts.titleLight }]} numberOfLines={1}>
                  {(() => {
                    const track = getTrack(activeTrackId);
                    const trackName = track?.title ?? 'Foundations';
                    const dayCount = track?.dayCount ?? 30;
                    if (!isFoundationsHome && frontierStatus?.isComplete) {
                      return `${trackName} · Complete`;
                    }
                    const day = isFoundationsHome ? state.currentDay : Math.min(activeTrackDay, dayCount);
                    // Beginners are simply on a journey — no track name.
                    return isFoundationsHome ? `Day ${day} of ${dayCount}` : `${trackName} · Day ${day} of ${dayCount}`;
                  })()}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressWidth.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[C.accentLight, C.accent, C.accentDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.progressDot} />
                </Animated.View>
                {/* Milestone tick marks — positions derive from the active track's length */}
                {milestoneBounds.slice(0, -1).map(d => (
                  <View
                    key={d}
                    style={[styles.milestoneTick, { left: `${(d / activeTrackDayCount) * 100}%` as any }]}
                  />
                ))}
              </View>
              {/* Milestone labels */}
              <View style={styles.milestoneLabels}>
                {milestoneBounds.map((d, i) => (
                  <View
                    key={d}
                    style={[
                      styles.milestoneLabelWrap,
                      { left: `${(d / activeTrackDayCount) * 100}%` as any },
                      // The last label would hang past the track's right edge —
                      // right-align it against the end of the bar instead.
                      d === activeTrackDayCount && styles.milestoneLabelWrapEnd,
                    ]}
                  >
                    <Text style={[styles.milestoneTick_label, { fontFamily: Fonts.titleLight, color: trackCompletedDays >= d ? C.accent : C.textMuted }]}>W{i + 1}</Text>
                  </View>
                ))}
              </View>
            </AnimatedPressable>

            {/* Journey rows — gated for beginners: "See all journeys" waits
                until Foundations is complete; "Revisit past days" waits
                until there is a first day to revisit. */}
            {(foundationsDone || completedDays >= 1) ? (
            <View style={styles.journeyRows}>
              {foundationsDone ? (
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/tracks');
                }}
                scaleValue={0.98}
                style={styles.journeyRow}
                testID="home-see-journeys"
              >
                <View style={styles.journeyRowCopy}>
                  <Text style={[styles.journeyRowTitle, { fontFamily: Fonts.titleMedium }]}>See all journeys</Text>
                  <Text style={[styles.journeyRowSub, { fontFamily: Fonts.italic }]} numberOfLines={1}>
                    {TRACKS.map((t) => t.title).join(' · ')}
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
              ) : null}
              {foundationsDone && completedDays >= 1 ? <View style={styles.journeyRowDivider} /> : null}
              {completedDays >= 1 ? (
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/tracks');
                }}
                scaleValue={0.98}
                style={styles.journeyRow}
                testID="home-revisit-days"
              >
                <View style={styles.journeyRowCopy}>
                  <Text style={[styles.journeyRowTitle, { fontFamily: Fonts.titleMedium }]}>Revisit past days</Text>
                  <Text style={[styles.journeyRowSub, { fontFamily: Fonts.italic }]} numberOfLines={1}>
                    Prayer Library — every day you&apos;ve prayed
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
              ) : null}
            </View>
            ) : null}

            {isFoundationsHome ? (
            <AnimatedPressable
              style={styles.todayCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/session?day=${displayDay}`);
              }}
              scaleValue={0.97}
              testID="begin-today"
            >
              <LinearGradient
                colors={[C.surfaceElevated, C.warmLight, C.cardGradientEnd]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.todayCardInner}
              >
                <View style={styles.todayCardGlow} pointerEvents="none">
                  <RadialGlow size={240} r={228} g={165} b={103} maxOpacity={0.14} />
                </View>
                <View style={styles.todayCardGlowSecondary} pointerEvents="none">
                  <RadialGlow size={180} r={160} g={100} b={48} maxOpacity={0.08} />
                </View>
                <LinearGradient
                  colors={[C.transparent, C.dayChipTodayBorder, C.transparent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.todayCardAccentLine}
                />

                <Text style={[styles.todayCardDay, { fontFamily: Fonts.titleMedium }]}>
                  {'Day ' + displayDay + ' · ' + phaseLabel}
                </Text>
                <Text
                  style={[styles.todayCardTitle, { fontFamily: Fonts.serifLight }]}
                  numberOfLines={3}
                >
                  {dayContent.title}
                </Text>
                <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={4}>
                  {dayContent.settle}
                </Text>

                {state.activeSession && state.activeSession.day === displayDay && (
                  <View style={styles.resumeBadge}>
                    <Text style={styles.resumeBadgeText}>
                      RESUME · {state.activeSession.phase ? SECTION_LABELS[state.activeSession.phase]?.toUpperCase() : 'SETTLE'}
                    </Text>
                  </View>
                )}

                <View style={styles.todayCardRule} />


                {/* Soundscape Selector removed as requested */}

                {hasCompletedSessionToday ? (
                  <>
                    <View style={[styles.todayCardCta, { opacity: 0.9 }]}>
                      <View style={styles.completedBadge}>
                        <Check size={11} color={C.accent} strokeWidth={3} />
                      </View>
                      <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>Completed today</Text>
                    </View>
                    {displayDay < 30 && (
                      <View style={styles.tomorrowCard}>
                        <Text style={styles.tomorrowEyebrow}>
                          Tomorrow • Day {displayDay + 1}
                        </Text>
                        <Text style={styles.tomorrowTitle}>
                          {getDayContent(displayDay + 1).title}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.todayCardCta}>
                    <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium }]}>
                      Begin today&apos;s prayer
                    </Text>
                    <ChevronRight size={14} color={C.accent} />
                  </View>
                )}
              </LinearGradient>
            </AnimatedPressable>
            ) : (
            <AnimatedPressable
              style={styles.todayCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (frontierStatus?.isComplete || (frontierStatus && !frontierStatus.available)) {
                  router.push('/tracks');
                } else {
                  router.push('/session');
                }
              }}
              scaleValue={0.97}
              testID="begin-today-track"
            >
              <LinearGradient
                colors={[C.surfaceElevated, C.warmLight, C.cardGradientEnd]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.todayCardInner}
              >
                {(() => {
                  const t = getTrack(activeTrackId);
                  const fDay = Math.min(frontierStatus?.day ?? activeTrackDay, activeTrackDayCount);
                  const content = getTrackDayContent(activeTrackId, fDay);
                  const locked = frontierStatus != null && !frontierStatus.available && !frontierStatus.isComplete;
                  if (frontierStatus?.isComplete) {
                    return (
                      <>
                        <Text style={[styles.todayCardDay, { fontFamily: Fonts.titleMedium }]}>
                          {`${t?.title ?? 'Journey'} · Complete`}
                        </Text>
                        <Text style={[styles.todayCardTitle, { fontFamily: Fonts.serifLight }]} numberOfLines={3}>
                          You finished this journey
                        </Text>
                        <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={4}>
                          Every day is yours to revisit in the Prayer Library — or begin another journey.
                        </Text>
                        <View style={styles.todayCardRule} />
                        <View style={styles.todayCardCta}>
                          <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium }]}>
                            Revisit past days
                          </Text>
                          <ChevronRight size={14} color={C.accent} />
                        </View>
                      </>
                    );
                  }
                  return (
                    <>
                      <Text style={[styles.todayCardDay, { fontFamily: Fonts.titleMedium }]}>
                        {`Day ${fDay}${content?.phase ? ` · ${content.phase}` : ''}`}
                      </Text>
                      <Text style={[styles.todayCardTitle, { fontFamily: Fonts.serifLight }]} numberOfLines={3}>
                        {content?.title ?? 'Today’s prayer'}
                      </Text>
                      <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={4}>
                        {locked
                          ? `Today's prayer is complete — Day ${fDay} unlocks tomorrow morning. Rest in what you've already received today.`
                          : (content?.settle ?? '')}
                      </Text>
                      <View style={styles.todayCardRule} />
                      {locked ? (
                        <View style={[styles.todayCardCta, { opacity: 0.9 }]}>
                          <View style={styles.completedBadge}>
                            <Check size={11} color={C.accent} strokeWidth={3} />
                          </View>
                          <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium, color: C.accent }]}>
                            Completed today · Revisit past days
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.todayCardCta}>
                          <Text style={[styles.todayCardCtaText, { fontFamily: Fonts.titleMedium }]}>
                            Begin today&apos;s prayer
                          </Text>
                          <ChevronRight size={14} color={C.accent} />
                        </View>
                      )}
                    </>
                  );
                })()}
              </LinearGradient>
            </AnimatedPressable>
            )}

            {/* Night Selah — standalone sleep mode: soundbed, timer & spoken declarations */}
            <AnimatedPressable
              style={styles.nightSelahCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/session?mode=sleep');
              }}
              scaleValue={0.97}
              testID="night-selah-card"
            >
              <View style={styles.nightSelahIconWrap}>
                <MoonStar size={20} color={C.accent} strokeWidth={2} />
              </View>
              <View style={styles.nightSelahCopy}>
                <Text style={[styles.nightSelahTitle, { fontFamily: Fonts.titleMedium }]}>Selah</Text>
                <Text style={[styles.nightSelahSub, { fontFamily: Fonts.italic }]} numberOfLines={2}>
                  Drift off to tonight&apos;s truth — soundbed, sleep timer &amp; spoken declarations.
                </Text>
              </View>
              <ChevronRight size={16} color={C.chevronMuted} />
            </AnimatedPressable>
          </Animated.View>

          <Animated.View
            style={{
              opacity: heroFade,
              transform: [{ translateY: heroSlide }],
            }}
          >
            {/* Daily Variable Surprise (The Drop) — tap to read & share */}
            <AnimatedPressable
              style={styles.dropCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setVerseModalVisible(true);
              }}
              scaleValue={0.97}
              testID="verse-of-the-day"
              accessibilityLabel={`Verse of the day. ${todayVerse.text} ${todayVerse.reference}. Tap to read and share.`}
              accessibilityRole="button"
            >
              <Text style={[styles.dropEyebrow, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>VERSE OF THE DAY</Text>
              <Text numberOfLines={4} style={[styles.dropQuote, { fontFamily: Fonts.serifRegular, color: C.textSecondary, marginBottom: 8 }]}>
                “{todayVerse.text}”
              </Text>
              <View style={styles.dropFooter}>
                <Text style={[styles.dropRef, { fontFamily: Fonts.titleLight, color: C.textSecondary }]}>
                  — {todayVerse.reference}
                </Text>
                <View style={styles.dropShareHint}>
                  <Share2 size={12} color={C.accent} />
                  <Text style={[styles.dropShareHintText, { fontFamily: Fonts.titleMedium }]}>READ & SHARE</Text>
                </View>
              </View>
            </AnimatedPressable>
          </Animated.View>

          {/* Reflection streak ring — multi-streak gamification */}
          {state.currentDay >= 3 ? (
            <AnimatedPressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/journal');
              }}
              scaleValue={0.97}
              style={styles.reflectionRing}
              testID="reflection-ring"
            >
              <View style={styles.reflectionRingTrack}>
                <View style={[styles.reflectionRingFill, { width: `${reflectionPercent * 100}%` as any }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reflectionRingLabel, { fontFamily: Fonts.titleMedium }]}>REFLECTION RHYTHM</Text>
                <Text style={[styles.reflectionRingSub, { fontFamily: Fonts.italic }]}>
                  {reflectionsCount === 0
                    ? 'Capture your first reflection in the journal.'
                    : `${reflectionsCount} of ${reflectionsTarget} weekly reflections saved.`}
                </Text>
              </View>
              <ChevronRight size={14} color={C.chevronMuted} />
            </AnimatedPressable>
          ) : null}

          {/* Weekly Recap — Your Week in Prayer */}
          {weeklyRecap ? (
            <Animated.View
              style={{
                opacity: restFade,
                transform: [{ translateY: restSlide }],
                marginBottom: 16,
              }}
            >
              <AnimatedPressable
                style={styles.recapCard}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/journal', params: { tab: 'insights' } });
                }}
                scaleValue={0.97}
                testID="weekly-recap-card"
              >
                <LinearGradient
                  colors={[C.surfaceElevated, C.warmLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.recapHeader}>
                  <Sparkles size={14} color={C.accent} />
                  <Text style={[styles.recapEyebrow, { fontFamily: Fonts.titleMedium }]}>YOUR WEEK IN PRAYER</Text>
                </View>
                <Text style={[styles.recapTitle, { fontFamily: Fonts.serifLight }]}>
                  {weeklyRecap.completedThisWeek === 7 ? 'A full week of presence.' : 'You showed up this week.'}
                </Text>
                <View style={styles.recapStatsRow}>
                  <View style={styles.recapStat}>
                    <Text style={[styles.recapStatNum, { fontFamily: Fonts.serifLight }]}>{weeklyRecap.completedThisWeek}</Text>
                    <Text style={[styles.recapStatLabel, { fontFamily: Fonts.titleLight }]}>days{'\n'}prayed</Text>
                  </View>
                  <View style={styles.recapDivider} />
                  <View style={styles.recapStat}>
                    <Text style={[styles.recapStatNum, { fontFamily: Fonts.serifLight }]}>{weeklyRecap.minutes}</Text>
                    <Text style={[styles.recapStatLabel, { fontFamily: Fonts.titleLight }]}>min{'\n'}with God</Text>
                  </View>
                  <View style={styles.recapDivider} />
                  <View style={styles.recapStat}>
                    <Text style={[styles.recapStatNum, { fontFamily: Fonts.serifLight }]}>{weeklyRecap.reflectionsThisWeek}</Text>
                    <Text style={[styles.recapStatLabel, { fontFamily: Fonts.titleLight }]}>reflections{'\n'}captured</Text>
                  </View>
                </View>
                <View style={styles.recapCta}>
                  <Text style={[styles.recapCtaText, { fontFamily: Fonts.titleMedium }]}>SEE FULL WRAP-UP</Text>
                  <ChevronRight size={12} color={C.accent} />
                </View>
              </AnimatedPressable>
            </Animated.View>
          ) : null}

          {/* Weekly Wrapped Notification — weekly cadence 8/15/22/29.
              Day 31 never fires (currentDay caps at 30); day 30 is the
              finale and gets no weekly nudge. */}
          {[8, 15, 22, 29].includes(state.currentDay) && !hasCompletedSessionToday && (
            <Animated.View style={{ opacity: restFade, transform: [{ translateY: restSlide }], marginBottom: 16 }}>
              <AnimatedPressable
                style={styles.wrappedBanner}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/journal', params: { tab: 'insights' } });
                }}
                scaleValue={0.97}
                testID="weekly-wrapped-banner"
              >
                <Text style={styles.wrappedEmoji}>✨</Text>
                <View style={styles.wrappedTextWrap}>
                  <Text style={[styles.wrappedTitle, { fontFamily: Fonts.titleBold }]}>
                    WEEK {state.currentDay === 8 ? 1 : state.currentDay === 15 ? 2 : state.currentDay === 22 ? 3 : 4} WRAPPED
                  </Text>
                  <Text style={[styles.wrappedSub, { fontFamily: Fonts.italic }]}>
                    Your insights are ready. See how you have grown.
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
            </Animated.View>
          )}




          {/* "DAILY PRACTICE COMPLETE" bottom badge removed — the today card
              already states completion (declutter). */}
        </ScrollView>
      </SafeAreaView>

      {/* Verse of the Day — fullscreen reader with share */}
      <Modal
        visible={verseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVerseModalVisible(false)}
      >
        <View style={styles.verseModalRoot} testID="verse-of-the-day-modal">
          <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
          <View style={styles.verseModalGlow} pointerEvents="none">
            <RadialGlow size={360} maxOpacity={0.09} />
          </View>
          <SafeAreaView style={styles.verseModalSafeArea}>
            <View style={styles.verseModalTopBar}>
              <Text style={[styles.verseModalEyebrow, { fontFamily: Fonts.titleMedium }]}>VERSE OF THE DAY</Text>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVerseModalVisible(false);
                }}
                style={styles.verseModalClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="verse-modal-close"
                accessibilityLabel="Close verse"
                accessibilityRole="button"
              >
                <X size={20} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.verseModalBody}>
              <Text style={[styles.verseModalText, { fontFamily: Fonts.serifLight }]}>
                “{todayVerse.text}”
              </Text>
              <View style={styles.verseModalRule} />
              <Text style={[styles.verseModalRef, { fontFamily: Fonts.titleMedium }]}>— {todayVerse.reference}</Text>
            </View>

            <AnimatedPressable
              style={styles.verseModalShareBtn}
              onPress={() => {
                void handleShareVerse();
              }}
              scaleValue={0.96}
              testID="verse-modal-share"
            >
              <LinearGradient
                colors={['#D49550', '#A86B2A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.verseModalShareGradient}
              >
                <Share2 size={17} color="#180C02" />
                <Text style={[styles.verseModalShareText, { fontFamily: Fonts.titleMedium }]}>SHARE THIS VERSE</Text>
              </LinearGradient>
            </AnimatedPressable>
          </SafeAreaView>
        </View>
      </Modal>

      <PrayerNotificationsSheet
        visible={prayerSheetVisible}
        onClose={() => setPrayerSheetVisible(false)}
        notifications={prayerNotifications}
        loading={prayerNotificationsLoading}
        onEntryPress={handlePrayerNotificationPress}
      />
    </View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  // Audit round 3, J-S13: mirrors the journal load-error banner so a
  // failed init is visible on Home too, not silently Day 1.
  loadErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.supportRowBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  loadErrorText: {
    flex: 1,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
  },
  loadErrorRetry: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  loadErrorRetryText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  authSoftPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    backgroundColor: C.supportRowBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 20,
  },
  authSoftPromptText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  reminderPrompt: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: C.sageBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.sageLight,
    marginTop: 14,
  },
  // Wave 2, fix 6: the banner's navigation action fills the row; the
  // dismiss × is a fixed 32pt box beside it (44pt+ with its hitSlop).
  bannerAction: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  bannerDismiss: {
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  reflectionRing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.supportRowBg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  reflectionRingTrack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: C.dayChipBg,
  },
  reflectionRingFill: {
    height: '100%',
    backgroundColor: C.accent,
    opacity: 0.7,
  },
  reflectionRingLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accentDark,
    marginBottom: 2,
  },
  reflectionRingSub: {
    fontSize: T.size.body,
    color: C.textSecondary,
    lineHeight: T.leading.body,
  },
  reminderPromptText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.sageDark,
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: C.background,
    overflow: 'hidden' as const,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 8,
    paddingBottom: 150,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
  },
  loadingGlow: {
    position: 'absolute',
    top: 88,
    alignSelf: 'center',
  },
  loadingContent: {
    width: '100%',
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingHeaderSkeleton: {
    height: 24,
    width: 144,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingHeroSkeleton: {
    height: 240,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingRowSkeleton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  loadingRowSkeletonShort: {
    height: 56,
    width: '72%',
    borderRadius: 12,
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  ambientVeil: {
    ...absoluteFillObject,
  },
  ambientWrap: {
    ...absoluteFillObject,
    zIndex: 0,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -164,
    left: Math.round(Dimensions.get('window').width / 2) - 280,
  },
  ambientTopGlowWide: {
    position: 'absolute',
    top: -208,
    left: Math.round(Dimensions.get('window').width / 2) - 350,
    opacity: 0.92,
  },
  ambientEllipse: {
    transform: [{ scaleY: 0.58 }],
  },
  ambientWideEllipse: {
    transform: [{ scaleY: 0.42 }],
  },
  ambientSideGlow: {
    position: 'absolute',
    top: 144,
    right: -128,
    opacity: 0.78,
  },
  ambientLowerGlow: {
    position: 'absolute',
    bottom: 160,
    left: -118,
    opacity: 0.62,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.pillBorder,
    backgroundColor: C.pillBg,
    gap: 8,
  },
  streakPillUrgent: {
    borderColor: C.rose,
    backgroundColor: C.roseBg,
  },
  streakEmoji: {
    fontSize: T.scale(13),
  },
  streakText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
    color: C.streakText,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.pillBorder,
    backgroundColor: C.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.accent,
  },
  wordmarkSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  wordmark: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    letterSpacing: 6,
    color: '#F5EFE7',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  wordmarkSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.textSecondary,
    textTransform: 'uppercase' as const,
  },
  greetingLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 8,
    opacity: 0.8,
  },
  greetingSection: {
    position: 'relative',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  greetingGlow: {
    position: 'absolute',
    top: -88,
    left: -84,
    opacity: 0.9,
  },
  greetingGlowShape: {
    transform: [{ scaleY: 0.62 }, { rotate: '-10deg' }],
  },
  greetingName: {
    fontSize: T.size.display,
    lineHeight: T.leading.display,
    letterSpacing: -1,
    color: C.text,
    marginBottom: 8,
  },
  greetingSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 4,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  quickEmoji: { fontSize: 26, marginBottom: 8 },
  quickLabel: { fontSize: T.size.label, textAlign: 'center', lineHeight: T.leading.label },
  welcomeCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.accentBg,
    marginTop: 20,
    marginBottom: 24,
  },
  welcomeEmoji: {
    fontSize: T.scale(26),
  },
  welcomeTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    marginTop: 10,
  },
  welcomeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  welcomeBtn: {
    marginTop: 16,
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  welcomeBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.5,
    color: '#0D0804',
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.accentBg,
    marginTop: 20,
    marginBottom: 24,
  },
  streakCardFrozen: {
    borderColor: C.sageLight,
    backgroundColor: C.sageBg,
  },
  streakCardTextFrozen: {
    color: C.sageDark,
  },
  streakCardStrongFrozen: {
    color: C.sage,
  },
  streakCardEmoji: {
    fontSize: T.scale(20),
  },
  streakCardText: {
    flex: 1,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
    color: C.textSecondary,
  },
  streakCardStrong: {
    color: C.accentDark,
  },
  progressSection: {
    marginBottom: 28,
  },
  journeyRows: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  journeyRowCopy: {
    flex: 1,
    marginRight: 10,
  },
  journeyRowTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    marginBottom: 2,
  },
  journeyRowSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  journeyRowDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    flexShrink: 0,
  },
  progressDay: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    flexShrink: 1,
    textAlign: 'right' as const,
    marginLeft: 12,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.border,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.accent,
    minWidth: 14,
  },
  progressDot: {
    position: 'absolute',
    right: -5,
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  sectionEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 16,
    color: C.accentDark,
    opacity: 0.85,
  },
  nightSelahCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  nightSelahIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  nightSelahCopy: {
    flex: 1,
    gap: 2,
  },
  nightSelahTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  nightSelahSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  todayCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent,
    overflow: 'hidden',
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      web: { boxShadow: `0 4px 16px rgba(180,116,53,0.1)` },
    }),
  },
  todayCardInner: {
    padding: 16,
    position: 'relative',
  },
  todayCardGlow: {
    position: 'absolute',
    top: -72,
    right: -28,
    opacity: 0.74,
  },
  todayCardGlowSecondary: {
    position: 'absolute',
    bottom: -82,
    left: -36,
    opacity: 0.4,
  },
  todayCardAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },

  todayCardDay: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
    color: C.accent,
  },
  todayCardTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    letterSpacing: -0.3,
    marginBottom: 10,
    color: C.text,
  },
  todayCardDesc: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    marginBottom: 18,
    color: C.textSecondary,
  },
  todayCardRule: {
    height: 1,
    marginVertical: 16,
    backgroundColor: C.border,
  },
  triadPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triadPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.chipBorder,
  },
  triadPillActive: {
    backgroundColor: C.accent,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  triadPillLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginLeft: 4,
  },
  todayCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  resumeBadge: {
    marginTop: 12,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.chipActiveBg,
    justifyContent: 'center',
  },
  resumeBadgeText: {
    fontFamily: Fonts.titleMedium,
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.accent,
    textTransform: 'uppercase' as const,
  },
  tomorrowCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.phaseCardBg,
    alignItems: 'center',
  },
  tomorrowEyebrow: {
    fontFamily: Fonts.titleMedium,
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textSecondary,
    marginBottom: 4,
  },
  tomorrowTitle: {
    fontFamily: Fonts.serifLight,
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.textSecondary,
    textAlign: 'center' as const,
  },
  todayCardCtaText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  completedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.chipActiveBg,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
  },
  dayStrip: {
    marginBottom: 10,
  },
  dayStripContent: {
    gap: 8,
    paddingRight: 8,
  },
  dayChip: {
    width: 46,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.dayChipBg,
  },
  dayChipDone: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.dayChipDoneBg,
  },
  dayChipToday: {
    borderColor: C.accent,
    backgroundColor: C.dayChipTodayBg,
  },
  dayChipLocked: {
    backgroundColor: C.dayChipLockedBg,
    borderColor: C.borderLight,
  },
  dayChipNum: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.dayChipText,
  },
  dayChipNumDone: {
    color: C.accent,
  },
  dayChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dayChipDotDone: {
    backgroundColor: C.accent,
  },
  dayChipDotToday: {
    backgroundColor: C.accent,
  },
  quoteCard: {
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.1)',
    borderRadius: 18,
    padding: 22,
    marginBottom: 14,
    backgroundColor: C.supportRowBg,
  },
  quoteText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    marginBottom: 10,
    color: C.quoteText,
  },
  quoteAuthor: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 0.3,
    color: C.textSecondary,
  },
  ctaStack: {
    gap: 12,
  },
  libraryRow: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.supportRowBg,
  },
  libraryRowHovered: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.supportRowHoverBg,
  },
  libraryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  libraryCopy: {
    flex: 1,
    gap: 4,
  },
  libraryLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.text,
  },
  librarySub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  supportRow: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    backgroundColor: C.supportRowBg,
  },
  supportRowHovered: {
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.supportRowHoverBg,
  },
  supportHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  supportLabel: {
    flex: 1,
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.text,
  },
  goldBorderButton: {
    minHeight: 56,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: 'transparent',
  },
  goldBorderButtonText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  ghostButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ghostButtonText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 0.2,
    color: C.textSecondary,
  },
  completionContainer: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    backgroundColor: C.supportRowBg,
  },
  completionInnerOrb: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentBg,
  },
  completionEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    marginBottom: 12,
    color: C.textSecondary,
  },
  completionTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 14,
    color: C.text,
  },
  completionMessage: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 36,
    color: C.quoteText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    maxHeight: '85%',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
      }
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalDayLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: {
    flex: 0,
  },
  modalBody: {
    gap: 20,
    paddingBottom: 20,
  },
  modalFooter: {
    marginTop: 20,
    width: '100%',
  },
  reviewSection: {
    gap: 8,
  },
  sectionLbl: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.textSecondary,
  },
  truthText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  verseText: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  shareBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  shareBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: '#FFF',
    letterSpacing: 1.2,
  },
  fullText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
  completedSessionCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: C.chipActiveBg,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
  },
  completedSessionCTAText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.5,
    color: C.sage,
  },
  /* ── Milestone tick marks ── */
  milestoneTick: {
    position: 'absolute' as const,
    width: 1,
    height: 9,
    top: -2,
    backgroundColor: 'rgba(200,137,74,0.28)',
    transform: [{ translateX: -0.5 }],
  },
  milestoneLabels: {
    position: 'relative' as const,
    height: 18,
    marginTop: 10,
    marginBottom: 6,
  },
  milestoneLabelWrap: {
    position: 'absolute' as const,
    transform: [{ translateX: -8 }],
  },
  milestoneLabelWrapEnd: {
    transform: [{ translateX: -26 }],
  },
  milestoneTick_label: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  /* ── Soundscape row on today card ── */
  soundscapeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  soundscapeRowLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.5)',
  },
  soundscapeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
  },
  soundscapeChipActive: {
    borderColor: 'rgba(200,137,74,0.4)',
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  soundscapeChipText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.5)',
  },
  soundscapeChipTextActive: {
    color: '#180C02',
  },
  /* ── The Drop (Daily Variable Surprise) ── */
  dropCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.borderLight,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  dropGlowWrap: {
    position: 'absolute' as const,
    top: -50,
    right: -50,
  },
  dropEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    marginBottom: 10,
  },
  dropQuote: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
    marginBottom: 10,
  },
  dropRef: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  dropFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  dropShareHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  dropShareHintText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    letterSpacing: 1.2,
    color: C.accent,
  },

  /* ── Verse of the Day fullscreen reader ── */
  verseModalRoot: {
    flex: 1,
  },
  verseModalGlow: {
    position: 'absolute' as const,
    top: -100,
    left: '50%' as const,
    marginLeft: -180,
  },
  verseModalSafeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  verseModalTopBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: 8,
  },
  verseModalEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase' as const,
  },
  verseModalClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: C.overlayLight,
  },
  verseModalBody: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: 24,
  },
  verseModalText: {
    fontSize: T.size.display,
    lineHeight: T.leading.display,
    color: C.text,
  },
  verseModalRule: {
    width: 44,
    height: 1.5,
    backgroundColor: C.accent,
    opacity: 0.55,
  },
  verseModalRef: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  verseModalShareBtn: {
    borderRadius: 16,
    overflow: 'hidden' as const,
    marginBottom: 8,
  },
  verseModalShareGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    paddingVertical: 16,
  },
  verseModalShareText: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
    letterSpacing: 1.5,
    color: '#180C02',
  },
  
  /* ── Global counter ── */
  globalCounterCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.supportRowBg,
    alignSelf: 'flex-start' as const,
  },
  globalCounterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5BB48A',
    marginRight: 2,
  },
  globalCounterText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  globalCounterNum: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.3,
  },
  /* ── Weekly Recap card ── */
  recapCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    overflow: 'hidden' as const,
    padding: 18,
  },
  recapHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  recapEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accentDark,
    textTransform: 'uppercase' as const,
  },
  recapTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  recapStatsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 6,
    marginBottom: 14,
  },
  recapStat: {
    flex: 1,
    alignItems: 'center' as const,
  },
  recapStatNum: {
    fontSize: T.size.number,
    color: C.accent,
    lineHeight: T.leading.number,
    marginBottom: 4,
  },
  recapStatLabel: {
    fontSize: T.size.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textSecondary,
    textAlign: 'center' as const,
    lineHeight: T.leading.label,
  },
  recapDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.border,
  },
  recapCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  recapCtaText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.8,
    color: C.accent,
  },
  /* ── Echoes preview card ── */
  echoesPreviewHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
  },
  echoesPreviewLink: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.8,
    color: C.accent,
  },
  echoPreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.supportRowBg,
    padding: 18,
  },
  echoPreviewBadgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 10,
  },
  echoLivePulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E07A5F',
  },
  echoPreviewBadge: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.6,
    color: C.textSecondary,
  },
  echoPreviewText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    marginBottom: 16,
    letterSpacing: 0.1,
  },
  echoPreviewFooter: {
    gap: 10,
  },
  echoPreviewAmen: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.dayChipTodayBorder,
    backgroundColor: C.chipActiveBg,
  },
  echoPreviewAmenActive: {
    borderColor: C.accent,
    backgroundColor: C.accentBg,
  },
  echoPreviewAmenIcon: {
    fontSize: T.scale(16),
  },
  echoPreviewAmenLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    flex: 1,
  },
  echoPreviewAmenCount: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  echoPreviewShare: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: 6,
  },
  echoPreviewShareText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.6,
    color: C.accent,
  },
  /* ── Weekly Wrapped Banner ── */
  wrappedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  wrappedEmoji: {
    fontSize: T.scale(24),
  },
  wrappedTextWrap: {
    flex: 1,
    gap: 4,
  },
  wrappedTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: 2,
    color: 'rgba(200,137,74,0.85)',
  },
  wrappedSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: 'rgba(244,237,224,0.8)',
  },
});
