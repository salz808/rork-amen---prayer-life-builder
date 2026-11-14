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
  Image,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Redirect, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Flame,
  Heart,
  MoonStar,
  Play,
  Settings2,
  Share2,
  Snowflake,
  Sparkles,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import AnimatedPressable from '@/components/AnimatedPressable';
import GlowButton from '@/components/GlowButton';
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

// Finding 11d: the Verse of the Day share image is captured with
// react-native-view-shot, the same lazy pattern as session.tsx's Share
// Truth card — NOT extracted into a shared helper (that extraction is
// owed to the coordinator; see the fix-pass report). No view-shot on
// web; the text path below is the fallback there.
let VerseViewShot: React.ComponentType<{ ref?: React.Ref<any>; options?: { format: string; quality: number }; children?: React.ReactNode }> | null = null;
let _verseCaptureRef: ((ref: React.RefObject<any>, options?: { format: string; quality: number }) => Promise<string>) | null = null;

if (Platform.OS !== 'web') {
  try {
    const _rvs = require('react-native-view-shot');
    VerseViewShot = _rvs.default ?? _rvs;
    _verseCaptureRef = _rvs.captureRef;
  } catch (error) {
    if (__DEV__) {
      console.log('[VerseShare] react-native-view-shot unavailable in current environment', error);
    }
  }
}




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
    if (completedDays >= dayCount) return `${dayCount} days. You walked this journey to its end. Come back anytime. He'll be here.`;
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
  return "Thirty days. You built a prayer life. Come back anytime. He'll be here.";
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

// 4x pass (2026-11-14): day-card excerpts never end mid-sentence. Take whole
// sentences up to a ~2-line budget (≈95 chars at this width); always at
// least one sentence, so a long single sentence still shows in full.
const completeSentenceExcerpt = (text: string, budget = 95): string => {
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s.trim()}` : s.trim();
    if (next.length > budget && out) break;
    out = next;
  }
  return out || text;
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
    // Pro-pass B9: observed non-Foundations track-prayer days, so
    // the week dots can fill track-only prayers on past days.
    trackPrayerDays,
    refreshDailyPrayerPool,
    suggestedReminderHour,
    annualUpsellEligible,
  } = useApp();
  // Wave 2, fix 1 (feedback #19): the tab layout has no scroll ref to
  // call (SDK 56+ forbids @react-navigation imports), so Home owns its
  // own ScrollView ref and scrolls it when the tab bar emits a re-tap
  // event. Previously this ScrollView had no ref at all, so nothing
  // could scroll it.
  const homeScrollRef = useRef<ScrollViewInstance>(null);
  useEffect(
    () =>
      onHomeScrollToTop(() => {
        homeScrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
    [],
  );
  const [dailyPrayerLockVisible, setDailyPrayerLockVisible] = React.useState<boolean>(false);
  const [verseModalVisible, setVerseModalVisible] = React.useState<boolean>(false);
  // Finding 11a: the modal's SafeAreaView was not giving real top/bottom
  // inset on device (eyebrow clipped by the status bar, SHARE cut off
  // by the home indicator). Explicit insets from the hook, applied to
  // the modal container below — no guessing from SafeAreaView-in-Modal.
  const insets = useSafeAreaInsets();
  // Finding 11d: the captured Verse of the Day image, previewed in-app
  // before the system share sheet opens (same pattern as session.tsx).
  const [verseSharePreviewUri, setVerseSharePreviewUri] = React.useState<string | null>(null);
  const verseShareCardRef = useRef<any>(null);
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
  // Pro-pass B7: a brand-new user (never prayed) gets the streak card
  // too, in its zero state — otherwise the whole habit loop is
  // invisible until day 1 is complete.
  const isNewUser = state.streakCount === 0 && !state.lastCompletedDate;
  const greetingName = useMemo(() => state.user?.firstName || 'Friend', [state.user?.firstName]);
  const encouragingSub = useMemo(() => getEncouragingSub(trackCompletedDays, hasCompletedSessionToday, activeTrackDayCount), [trackCompletedDays, hasCompletedSessionToday, activeTrackDayCount]);

  // Steal C — week dots for the streak card. Real data only, from the
  // same sources the streak itself is built on: Foundations progress
  // (completedAt mapped through the 4 AM prayer-day boundary, exactly
  // as hasCompletedSessionToday does) plus the Daily Prayer log (whose
  // dates are already prayer-day keys). Today is also marked prayed
  // when hasCompletedSessionToday is true, which covers a track-only
  // session (Freedom etc.) — and pro-pass B9 adds the provider's
  // observed track-prayer days, so a track-only prayer on a PAST day
  // fills its dot too (the observed set is the last completion per
  // track plus the accumulated store, so a very old unobserved day
  // can still read unfilled — the a11y string says "no prayer
  // shown", never "no prayer recorded", because the dots only show
  // what Home can see). Week starts Sunday, matching the heat map's
  // getStartOfWeek.
  const weekDots = useMemo(() => {
    const todayKey = prayerDayKey(new Date());
    const prayed = new Set<string>();
    for (const item of state.progress) {
      if (item.completed && item.completedAt) {
        prayed.add(prayerDayKey(new Date(item.completedAt)));
      }
    }
    for (const entry of state.dailyPrayerLog ?? []) {
      prayed.add(entry.date);
    }
    for (const day of trackPrayerDays ?? []) {
      prayed.add(day);
    }
    if (hasCompletedSessionToday) {
      prayed.add(todayKey);
    }
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const todayDate = new Date(ty, (tm ?? 1) - 1, td ?? 1);
    const weekStartKey = shiftPrayerDayKey(todayKey, -todayDate.getDay());
    // Pro-pass B8: two-letter labels (Su/Mo/Tu/We/Th/Fr/Sa) — single
    // letters repeat (S, T) and can't be told apart — plus the full
    // weekday name for VoiceOver.
    const days = [
      { label: 'Su', name: 'Sunday' },
      { label: 'Mo', name: 'Monday' },
      { label: 'Tu', name: 'Tuesday' },
      { label: 'We', name: 'Wednesday' },
      { label: 'Th', name: 'Thursday' },
      { label: 'Fr', name: 'Friday' },
      { label: 'Sa', name: 'Saturday' },
    ];
    // Pro-pass B7: a brand-new user has no history — past days are
    // "not yet", not "missed". Only a user with history gets missed dots.
    const hasHistory = state.streakCount > 0 || !!state.lastCompletedDate;
    return days.map(({ label, name }, index) => {
      const key = shiftPrayerDayKey(weekStartKey, index);
      const stateValue = key > todayKey
        ? 'future' as const
        : key === todayKey
          ? (prayed.has(key) ? 'prayed' as const : 'today' as const)
          : prayed.has(key)
            ? 'prayed' as const
            : hasHistory
              ? 'missed' as const
              : 'future' as const;
      return { key, label, name, state: stateValue };
    });
  }, [state.progress, state.dailyPrayerLog, trackPrayerDays, hasCompletedSessionToday, prayerDay, state.streakCount, state.lastCompletedDate]);

  // Steal C — streak subtext. Never a scorecard, never punishment: a
  // missed day under grace gets the fresh-start line, a prayed-today
  // streak gets a quiet confirmation, and a live streak simply invites
  // today. (The prayed-today line is new copy in the app's existing
  // "streak is safe" voice — the grace badge already says
  // "Streak safe for now".)
  const streakSubtext = isStreakFrozen
    ? 'No guilt. Your streak holds. Today is a fresh start.'
    : hasCompletedSessionToday
      ? 'Prayed today. Your streak is safe.'
      : 'Pray today to keep it going.';
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

  // Finding 11d: Verse of the Day shares as a premium image now, not
  // just text. The text below is still the fallback (web, or view-shot
  // unavailable) and the "Share as text instead" path in the preview.
  // The PL-H4 disclosure separator is untouched: REF (excerpt) — TEXT
  // is not used here (this is a single verse, not an excerpt), and the
  // "— REF" citation line below keeps its dash as a citation, not prose.
  const verseShareText = `“${todayVerse.text}”\n${todayVerse.reference}\n\nShared from TRIAD Prayer`;

  const shareVerseAsText = async () => {
    try {
      await Share.share({ message: verseShareText, title: `Verse of the Day: ${todayVerse.reference}` });
    } catch (error) {
      if (__DEV__) console.log('[VerseShare] share error:', error);
    }
  };

  const confirmVerseSharePreview = async () => {
    const uri = verseSharePreviewUri;
    if (!uri) return;
    setVerseSharePreviewUri(null);
    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Verse of the Day: ${todayVerse.reference}`,
          UTI: 'public.png',
        });
        return;
      }
      // iOS-only: Share.share supports url.
      if (Platform.OS === 'ios') {
        await Share.share({
          url: uri,
          title: `Verse of the Day: ${todayVerse.reference}`,
          message: verseShareText,
        });
        return;
      }
      await shareVerseAsText();
    } catch (error) {
      if (__DEV__) console.log('[VerseShare] image share error:', error);
      await shareVerseAsText();
    }
  };

  const handleShareVerse = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: `Verse of the Day: ${todayVerse.reference}`, text: verseShareText });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(verseShareText);
          Alert.alert('Copied', 'The verse has been copied to your clipboard.');
          return;
        }
        Alert.alert('Sharing unavailable', 'Your browser does not support sharing. Please try on the mobile app.');
      } catch (error) {
        if (__DEV__) console.log('[VerseShare] web error:', error);
      }
      return;
    }
    // Native: capture the share card and preview it in-app first, so
    // the user sees exactly what leaves the phone. The system share
    // sheet opens only from the preview's SHARE button.
    if (!_verseCaptureRef || !VerseViewShot) {
      if (__DEV__) console.log('[VerseShare] view-shot unavailable, falling back to text');
      await shareVerseAsText();
      return;
    }
    const target = verseShareCardRef.current;
    if (!target) {
      if (__DEV__) console.log('[VerseShare] verseShareCardRef.current is null');
      await shareVerseAsText();
      return;
    }
    try {
      const uri = await _verseCaptureRef(target, { format: 'png', quality: 1 });
      if (__DEV__) console.log('[VerseShare] captured uri:', uri);
      setVerseSharePreviewUri(uri);
    } catch (error) {
      if (__DEV__) console.log('[VerseShare] image share error:', error);
      await shareVerseAsText();
    }
  };

  /** The Verse of the Day share card — editorial 1080×1080 template in
   * the same system as session.tsx's Share Truth card (renderShareCardContent): the TRIAD mark anchors the canvas, the verse is the hero
   * at 44–62pt by length, the reference is secondary, and the footer
   * carries "Available on the App Store" only — no duplicated wordmark
   * (finding 31's treatment, applied here too). Canvas pixels are
   * absolute here (not screen points). The mark is the real TRIAD logo
   * asset (assets/images/triad-prayer-logo.png, light lockup for dark
   * backgrounds), never an AI-generated logo. Built here in Home rather
   * than extracted into a shared helper — that extraction is owed to
   * the coordinator (another worker owns session.tsx). */
  const renderVerseShareCardContent = () => {
    const verseLen = (todayVerse.text ?? '').length;
    const verseFontSize = verseLen > 110 ? 44 : verseLen > 70 ? 52 : 62;
    return (
      <View style={[styles.verseShareCard, { backgroundColor: C.background }]}>
        <View style={styles.verseShareCardGlow} pointerEvents="none">
          <RadialGlow size={900} maxOpacity={0.16} />
        </View>
        <View style={styles.verseShareCardTop}>
          <Image
            source={require('../../../assets/images/triad-prayer-logo.png')}
            style={styles.verseShareCardLogo}
            resizeMode="contain"
            accessibilityLabel="TRIAD Prayer"
          />
          <Text style={[styles.verseShareCardLabel, { fontFamily: Fonts.titleBold, color: C.accent }]}>VERSE OF THE DAY</Text>
        </View>
        <View style={styles.verseShareCardBody}>
          <Text style={[styles.verseShareCardVerse, { fontFamily: Fonts.serifSemiBold, color: C.text, fontSize: verseFontSize, lineHeight: Math.round(verseFontSize * 1.25) }]}>
            &ldquo;{todayVerse.text}&rdquo;
          </Text>
          <View style={styles.verseShareCardDivider} />
          <Text style={[styles.verseShareCardRef, { fontFamily: Fonts.titleSemiBold, color: C.accent }]}>{todayVerse.reference}</Text>
        </View>
        <View style={styles.verseShareCardFooter}>
          <Text style={[styles.verseShareCardAppInfo, { fontFamily: Fonts.serifRegular, color: C.textMuted }]}>Available on the App Store</Text>
        </View>
      </View>
    );
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
  // next eligible banner shows instead (still at most one). 4x pass
  // (2026-11-14): the cloud banner now has a × on Home too, dismissed
  // persistently through the same AsyncStorage mechanism as the others
  // (the auth screen's Maybe-later is a separate, earlier path).
  const visibleBanner: 'reminder' | 'cloud' | 'reminderSetup' | 'annual' | null =
    reminderSuggestion && !dismissedBanners.has(homeBannerDismissalKey('reminder', reminderSuggestion))
      ? 'reminder'
      : showCloudPrompt && !dismissedBanners.has(homeBannerDismissalKey('cloud'))
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
            <Text style={[styles.completionTitle, { fontFamily: Fonts.serifMedium }]}>Keep meeting Him daily.</Text>
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
                : 'Daily Prayer is one prayer each day, chosen for you, a revisit of a day from a journey you have started. It is free for everyone who completes it.'}
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
          description="Daily Prayer is one prayer each day, chosen for you, a revisit of a day from a journey you have started. It opens when you finish your journey, free for everyone who completes it."
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
                {/* Pro-pass B10: the top-bar pill shows ONLY the urgent
                    "Pray today" call. The calm "Streak safe for now"
                    lives on the streak card alone — one streak, one
                    place — so the same fact is never said twice on
                    one screen. */}
                {showGraceBadge && graceUrgent ? (
                  <View style={[styles.streakPill, styles.streakPillUrgent]}>
                    <AlertTriangle size={13} color={C.rose} />
                    <Text style={[styles.streakText, { fontFamily: Fonts.titleMedium, color: C.rose }]}>
                      Pray today
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
              <Text style={[styles.greetingLabel, { fontFamily: Fonts.titleSemiBold }]}>
                {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
              </Text>
              <Text
                style={[styles.greetingName, { fontFamily: Fonts.serifMedium }]}
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
              {state.streakCount > 0 || isNewUser ? (
                <View style={[styles.streakCard, isStreakFrozen && styles.streakCardFrozen]}>
                  <View style={styles.streakCardTop}>
                    {isStreakFrozen ? <Snowflake size={20} color={C.accent} /> : <Flame size={20} color={C.accent} />}
                    <Text style={[styles.streakCardText, { fontFamily: Fonts.titleMedium }, isStreakFrozen && styles.streakCardTextFrozen]}>
                      <Text style={[styles.streakCardStrong, { fontFamily: Fonts.titleMedium }, isStreakFrozen && styles.streakCardStrongFrozen]}>
                        {isNewUser ? 'Start your streak' : `${state.streakCount}-day streak`}
                      </Text>
                      {isNewUser ? null : isStreakFrozen ? ' · Streak safe for now' : ' · Keep walking in freedom'}
                    </Text>
                  </View>
                  {/* Steal C — this week's prayed days, Sun–Sat, from the
                      same progress + Daily Prayer sources as the streak.
                      A dot is never a verdict: an unfilled past day is
                      just a quiet day, and the subtext below says so. */}
                  <View style={styles.weekDotsRow} testID="streak-week-dots">
                    {weekDots.map((dot) => (
                      <View key={dot.key} style={styles.weekDotCell}>
                        <Text style={[styles.weekDotLabel, { fontFamily: Fonts.titleSemiBold }]}>{dot.label}</Text>
                        <View
                          style={[
                            styles.weekDot,
                            dot.state === 'prayed'
                              ? styles.weekDotPrayed
                              : dot.state === 'today'
                                ? styles.weekDotToday
                                : dot.state === 'future'
                                  ? styles.weekDotFuture
                                  : styles.weekDotMissed,
                          ]}
                          testID={`streak-week-dot-${dot.key}`}
                          accessible
                          accessibilityLabel={
                            dot.state === 'prayed'
                              ? `${dot.name}, prayed`
                              : dot.state === 'today'
                                ? `${dot.name}, today. Not prayed yet`
                                : dot.state === 'future'
                                  ? `${dot.name}, upcoming`
                                  : `${dot.name}, no prayer shown`
                          }
                        >
                          {dot.state === 'today' ? <View style={styles.weekDotTodayPip} /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.streakCardSub, { fontFamily: Fonts.italic }]}>
                    {isNewUser
                      ? hasCompletedSessionToday
                        ? 'Prayed today. Day 1 is done. Come back tomorrow to keep it going.'
                        : 'Pray today to start your streak.'
                      : streakSubtext}
                  </Text>
                </View>
              ) : showWelcomeBack ? (
                <View style={styles.welcomeCard}>
                  <Text style={[styles.welcomeTitle, { fontFamily: Fonts.serifSemiBold }]}>Welcome back.</Text>
                  <Text style={[styles.welcomeText, { fontFamily: Fonts.italic }]}>
                    You haven&apos;t lost a thing. Prayer isn&apos;t a streak. It&apos;s a relationship. Today is a fresh start.
                  </Text>
                  {/* 4x pass: one CTA language app-wide — PRAY TODAY is the
                      shared amber GlowButton (radius 18, min-height 54),
                      the same component as onboarding's CONTINUE, not a
                      one-off centered pill. The dove emoji is gone: it was
                      the one non-designed element on the screen. */}
                  <GlowButton
                    label="PRAY TODAY"
                    variant="amber"
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/session');
                    }}
                    style={styles.welcomeBtn}
                  />
                </View>
              ) : null}
              {/* Kai-approved 2026-10-26, first-time grace explainer:
                  a missed day is covered briefly — shown once only. */}
              {showGraceExplainer ? (
                <Text
                  style={[{ color: C.textSecondary, fontFamily: Fonts.titleRegular, fontSize: T.size.caption, lineHeight: T.leading.caption, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }]}
                  testID="grace-explainer"
                >
                  Missed a day? Your streak is covered briefly. Pray today to keep it going.
                </Text>
              ) : null}
            </Animated.View>

            {/* Finding 05a (device review 2026-11-10) — DECIDED judgment
                call: the Saved row is HIDDEN until the first day is
                completed. The old copy ("Every day you've prayed, ready
                to revisit.") claimed history a Day-1 user does not have,
                which is why Justin asked why "saved" was there right
                away. Once a day is done the row returns — it is the one
                route to the library (pro-pass B4). */}
            {completedDays > 0 ? (
            <View style={styles.homeLinkRows}>
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Pro-pass B6: land on the library, not the top of
                  // the journeys list — /tracks opens the Library tab
                  // when section=library is passed.
                  router.push('/tracks?section=library');
                }}
                scaleValue={0.98}
                style={styles.libraryRow}
                testID="home-saved-library"
              >
                <View style={styles.libraryIconWrap}>
                  <BookOpen size={16} color="#0D0804" />
                </View>
                <View style={styles.libraryCopy}>
                  <Text style={[styles.libraryLabel, { fontFamily: Fonts.titleMedium }]}>Saved</Text>
                  <Text style={[styles.librarySub, { fontFamily: Fonts.italic }]} numberOfLines={2}>
                    Every day you&apos;ve prayed, ready to revisit.
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
            </View>
            ) : null}

            {stateLoadError ? (
              <View style={styles.loadErrorBanner} testID="home-load-error">
                <Text style={[styles.loadErrorText, { fontFamily: Fonts.titleMedium }]}>
                  Your saved progress couldn’t load. What you see may be incomplete.
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

            {/* 4x pass: the cloud prompt is a utility, not feed content — it
                sits in a dismissible row now (× is a sibling of the action,
                never nested, so dismissing never navigates), matching the
                other banners. Tapping × hides it persistently. */}
            {visibleBanner === 'cloud' ? (
              <View style={styles.cloudPromptRow}>
                <AnimatedPressable
                  onPress={() => router.push('/auth')}
                  scaleValue={0.97}
                  style={[styles.authSoftPrompt, styles.cloudPromptAction]}
                  testID="cloud-save-prompt"
                >
                  <Cloud size={14} color={C.accentDark} />
                  <Text style={[styles.authSoftPromptText, { fontFamily: Fonts.titleMedium }]}>
                    SAVE YOUR PROGRESS TO THE CLOUD
                  </Text>
                  <ChevronRight size={12} color={C.chevronMuted} />
                </AnimatedPressable>
                <Pressable
                  onPress={() => dismissBanner(homeBannerDismissalKey('cloud'))}
                  hitSlop={12}
                  style={styles.bannerDismiss}
                  testID="dismiss-cloud-save-prompt"
                  accessibilityLabel="Dismiss cloud save prompt"
                  accessibilityRole="button"
                >
                  <X size={16} color={C.chevronMuted} />
                </Pressable>
              </View>
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
                    A GENTLE DAILY REMINDER · SET YOURS
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
                  style={[styles.todayCardTitle, { fontFamily: Fonts.serifMedium }]}
                  numberOfLines={2}
                >
                  {dayContent.title}
                </Text>
                <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={3}>
                  {completeSentenceExcerpt(dayContent.settle)}
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
                        <Text style={[styles.todayCardTitle, { fontFamily: Fonts.serifMedium }]} numberOfLines={2}>
                          You finished this journey
                        </Text>
                        <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={2}>
                          Every day is yours to revisit in the Prayer Library, or begin another journey.
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
                      <Text style={[styles.todayCardTitle, { fontFamily: Fonts.serifMedium }]} numberOfLines={2}>
                        {content?.title ?? 'Today’s prayer'}
                      </Text>
                      <Text style={[styles.todayCardDesc, { fontFamily: Fonts.italic }]} numberOfLines={3}>
                        {locked
                          ? `Today's prayer is complete. Day ${fDay} unlocks tomorrow morning. Rest in what you've already received today.`
                          : completeSentenceExcerpt(content?.settle ?? '')}
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

            {/* Sleep Prayer — standalone sleep mode: soundbed, timer &
                spoken declarations. UI/UX audit 2026-11-10 (H4): the
                card now carries its own "YOUR EVENING RHYTHM" eyebrow,
                is named Sleep Prayer (renamed from Night Selah,
                2026-11-10 — the daytime stillness movement keeps
                "Selah"), and sits directly under the today card —
                daily prayer dominant, Sleep Prayer secondary, progress
                after. */}
            <View style={styles.nightSelahSection}>
              <Text style={[styles.nightSelahEyebrow, { fontFamily: Fonts.titleSemiBold }]}>YOUR EVENING RHYTHM</Text>
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
                  <Text style={[styles.nightSelahTitle, { fontFamily: Fonts.titleMedium }]}>Sleep Prayer</Text>
                  <Text style={[styles.nightSelahSub, { fontFamily: Fonts.italic }]} numberOfLines={2}>
                    Drift off to tonight&apos;s truth. Soundbed, sleep timer, spoken truth.
                  </Text>
                </View>
                <ChevronRight size={16} color={C.chevronMuted} />
              </AnimatedPressable>
            </View>

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
                {/* Pro-pass C8 (pixel-verified 2026-11-10): the full
                    "JOURNEY TO WHOLENESS" (247pt) plus the day count
                    (88pt + 12pt gap) overflowed this 326pt row, so one
                    of the two always clipped — first the day count
                    ("Day 1 …"), then the title. "YOUR JOURNEY" (~160pt)
                    leaves both whole; the journey's name lives in the
                    track data, not this header. */}
                <Text style={[styles.progressLabel, { fontFamily: Fonts.titleMedium }]} numberOfLines={1}>YOUR JOURNEY</Text>
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
                    <Text style={[styles.milestoneTick_label, { fontFamily: Fonts.titleLight, color: trackCompletedDays >= d ? C.accentDark : C.textSecondary }]}>W{i + 1}</Text>
                  </View>
                ))}
              </View>
            </AnimatedPressable>

            {/* Journey rows — gated for beginners: "See all journeys" waits
                until Foundations is complete. "Revisit past days" used
                to live here too; it is gone (pro-pass B4) — the Saved
                row above is the one route to the library now. */}
            {foundationsDone ? (
            <View style={styles.journeyRows}>
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
            </View>
            ) : null}

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
                <Text style={[styles.dropRef, { fontFamily: Fonts.titleSemiBold, color: C.textSecondary }]}>
                  {todayVerse.reference}
                </Text>
                <View style={styles.dropShareHint}>
                  <Share2 size={12} color={C.accent} />
                  <Text style={[styles.dropShareHintText, { fontFamily: Fonts.titleSemiBold }]}>READ & SHARE</Text>
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
                  router.push('/profile');
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
                <Text style={[styles.recapTitle, { fontFamily: Fonts.serifSemiBold }]}>
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
                  router.push('/profile');
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
          {/* Finding 11a: explicit insets (hook) instead of SafeAreaView
              inside the Modal — the eyebrow clears the status bar and
              the buttons clear the home indicator. */}
          <View style={[styles.verseModalSafeArea, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.verseModalTopBar}>
              <Text style={[styles.verseModalEyebrow, { fontFamily: Fonts.titleMedium }]}>VERSE OF THE DAY</Text>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVerseModalVisible(false);
                }}
                style={styles.verseModalClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID="verse-modal-close"
                accessibilityLabel="Close verse"
                accessibilityRole="button"
              >
                <X size={20} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.verseModalBody}>
              <Text style={[styles.verseModalText, { fontFamily: Fonts.serifMedium }]}>
                “{todayVerse.text}”
              </Text>
              <View style={styles.verseModalRule} />
              <Text style={[styles.verseModalRef, { fontFamily: Fonts.titleSemiBold }]}>{todayVerse.reference}</Text>
            </View>

            {/* Finding 11b/c: the share button is the app's primary
                button now (GlowButton — 54pt, button token, no stray
                shadow), not a one-off gradient with scripture-size
                caps text. And closing has a second way out: Done below,
                alongside the 44pt X up top. */}
            <View style={styles.verseModalShareWrap} testID="verse-modal-share">
              <GlowButton
                label="SHARE THIS VERSE"
                icon={<Share2 size={17} color="#180C02" />}
                onPress={() => void handleShareVerse()}
                style={{ width: '100%' }}
              />
              <GlowButton
                label="DONE"
                variant="ghost"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVerseModalVisible(false);
                }}
                style={{ width: '100%', marginTop: 12 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Hidden view for Verse of the Day image capture — same pattern
          as session.tsx's Share Truth card. */}
      <View style={{ position: 'absolute', left: -5000, top: 0 }}>
        {VerseViewShot ? (
          <VerseViewShot ref={verseShareCardRef} options={{ format: 'png', quality: 1.0 }}>
            {renderVerseShareCardContent()}
          </VerseViewShot>
        ) : (
          <View ref={verseShareCardRef}>{renderVerseShareCardContent()}</View>
        )}
      </View>

      {/* Verse share preview — the captured card, shown in-app before
          the system share sheet opens, so the user sees what leaves the
          phone. Same pattern as session.tsx's share preview. */}
      <Modal
        visible={verseSharePreviewUri != null}
        transparent
        animationType="fade"
        onRequestClose={() => setVerseSharePreviewUri(null)}
      >
        <View style={styles.verseSharePreviewRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVerseSharePreviewUri(null)} testID="verse-share-preview-backdrop" />
          <View style={[styles.verseSharePreviewCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.verseSharePreviewTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              Your verse, ready to share
            </Text>
            {verseSharePreviewUri ? (
              <Image source={{ uri: verseSharePreviewUri }} style={styles.verseSharePreviewImage} resizeMode="contain" testID="verse-share-preview-image" />
            ) : null}
            <GlowButton
              label="SHARE"
              onPress={() => void confirmVerseSharePreview()}
              variant="amber"
              style={{ width: '100%', marginBottom: 12 }}
            />
            <Pressable
              onPress={() => {
                setVerseSharePreviewUri(null);
                void shareVerseAsText();
              }}
              style={styles.verseSharePreviewAlt}
              testID="verse-share-preview-text-instead"
            >
              <Text style={[styles.verseSharePreviewAltText, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>Share as text instead</Text>
            </Pressable>
            <Pressable onPress={() => setVerseSharePreviewUri(null)} style={styles.verseSharePreviewAlt} testID="verse-share-preview-cancel">
              <Text style={[styles.verseSharePreviewAltText, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
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
  // 4x pass: the cloud prompt is a dismissible row — the action takes the
  // width, the × sits beside it (never nested, so dismissing never
  // navigates), matching the other banners.
  cloudPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  cloudPromptAction: {
    flex: 1,
    marginTop: 0,
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
    fontSize: T.scale(14),
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
  },
  greetingSection: {
    position: 'relative',
    marginBottom: 16,
    paddingBottom: 12,
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
  quickEmoji: { fontSize: T.scale(21), marginBottom: 8 },
  quickLabel: { fontSize: T.size.label, textAlign: 'center', lineHeight: T.leading.label },
  welcomeCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.accentBg,
    marginTop: 28,
    marginBottom: 28,
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
  // 4x pass: PRAY TODAY is the shared amber GlowButton now — this style is
  // layout only (full width inside the centered welcome card).
  welcomeBtn: {
    marginTop: 16,
    width: '100%',
  },
  streakCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.accentBg,
    marginTop: 12,
    marginBottom: 20,
  },
  streakCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Steal C — week dots inside the streak card: one column per day,
  // Sun–Sat (matching the heat map's week). Filled gold = prayed,
  // gold ring = today not yet prayed, dim = a past day with no prayer
  // recorded, faint hollow = a future day this week.
  weekDotsRow: {
    flexDirection: 'row',
  },
  weekDotCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  // Pro-pass B8: 11pt two-letter glyph labels — a sanctioned `T.scale()`
  // use (glyph size, not reading text). Pixel-verified 2026-11-10:
  // `scale()` clamps sub-12 sizes to the 13.4pt legibility floor, so the
  // labels render at 13.4pt / 16.1pt line — not 11pt, and that is the
  // floor working as designed, not an exception. Down from 14.5pt, where
  // the letters dominated the 12pt dots they annotate.
  weekDotLabel: {
    fontSize: T.scale(11),
    lineHeight: T.scale(14),
    color: C.textSecondary,
  },
  weekDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotPrayed: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  weekDotToday: {
    backgroundColor: 'transparent',
    borderColor: C.accent,
    borderWidth: 2,
  },
  // Today is a ring with a filled centre pip — unmistakably "not done
  // yet", never a smaller version of the prayed (filled) dot.
  weekDotTodayPip: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.accent,
  },
  weekDotMissed: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.border,
  },
  weekDotFuture: {
    backgroundColor: 'transparent',
    borderColor: C.border,
    opacity: 0.5,
  },
  streakCardSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  // Steal C — Saved row, directly under the streak card.
  homeLinkRows: {
    gap: 10,
    marginBottom: 20,
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
    fontSize: T.scale(21),
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
    // Pixel-verified 2026-11-10: the day count ("Day 1 of 30") was the
    // clipped one, not the section title — the title held flexShrink 0
    // and the day text shrank to "Day 1 …" (88px needed, 67px given).
    // The day count is the data; the title yields.
    flexShrink: 1,
  },
  progressDay: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    flexShrink: 0,
    textAlign: 'right' as const,
    marginLeft: 12,
  },
  progressTrack: {
    // 4x pass: 7pt read as a hairline against the tab bar — 10pt with a
    // larger end dot so the journey's progress is actually visible.
    height: 10,
    borderRadius: 5,
    backgroundColor: C.border,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: C.accent,
    minWidth: 14,
  },
  progressDot: {
    position: 'absolute',
    right: -5,
    top: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
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
  nightSelahSection: {
    marginBottom: 28,
  },
  nightSelahEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 10,
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
    // Phase 2b sweep 3 (one shadow rule): card shadow converges on the
    // tierCard standard (C.text, 0.06/18/10, elevation 2) — the amber
    // 0.1/10/3 shadow was a second card standard.
    ...Platform.select({
      ios: {
        shadowColor: C.text,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
      },
      android: { elevation: 2 },
      web: { boxShadow: `0 10px 18px rgba(26,15,6,0.06)` },
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
    color: C.accentDark,
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
    fontFamily: Fonts.serifSemiBold,
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
  // Pro-pass C6: sentence-case row labels use the button token
  // (16 SemiBold, the token's own 1pt tracking) — the label token's
  // 2pt eyebrow tracking stretched "Saved" and the longer widget
  // label into broken-looking text.
  libraryLabel: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1,
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
    color: C.accentDark,
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
    color: C.accentDark,
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
    fontSize: T.size.citation,
    lineHeight: T.leading.citation,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 1.2,
    color: C.accentDark,
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
    fontSize: T.size.citation,
    lineHeight: T.leading.citation,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
  },
  verseModalShareWrap: {
    width: '100%',
  },

  /* ── Verse of the Day share card (1080×1080 capture target) ── */
  // Finding 11d: same editorial system as session.tsx's Share Truth
  // card. Canvas pixels are absolute here, NOT screen tokens.
  verseShareCard: {
    width: 1080,
    height: 1080,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 72,
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  verseShareCardGlow: {
    position: 'absolute',
    left: 90,
    top: 90,
  },
  verseShareCardTop: {
    alignItems: 'center',
    gap: 28,
  },
  verseShareCardLogo: {
    width: 620,
    height: 285,
  },
  verseShareCardLabel: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 5,
    textAlign: 'center' as const,
  },
  verseShareCardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verseShareCardVerse: {
    textAlign: 'center' as const,
  },
  verseShareCardDivider: {
    height: 1,
    width: 120,
    backgroundColor: 'rgba(200,137,74,0.35)',
    marginTop: 36,
    marginBottom: 24,
  },
  verseShareCardRef: {
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: 3,
    textAlign: 'center' as const,
  },
  verseShareCardFooter: {
    alignItems: 'center',
    width: '100%',
  },
  verseShareCardAppInfo: {
    fontSize: 24,
    lineHeight: 30,
  },
  verseSharePreviewRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  verseSharePreviewCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  verseSharePreviewTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  verseSharePreviewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 20,
  },
  verseSharePreviewAlt: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verseSharePreviewAltText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    fontSize: T.scale(21),
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
