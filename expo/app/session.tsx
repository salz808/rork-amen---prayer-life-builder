import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  Share,
  Modal,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, Stack, useGlobalSearchParams, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
let ViewShot: React.ComponentType<{ ref?: React.Ref<any>; options?: { format: string; quality: number }; children?: React.ReactNode }> | null = null;
let _captureRef: ((ref: React.RefObject<any>, options?: { format: string; quality: number }) => Promise<string>) | null = null;

if (Platform.OS !== 'web') {
  try {
    const _rvs = require('react-native-view-shot');
    ViewShot = _rvs.default ?? _rvs;
    _captureRef = _rvs.captureRef;
  } catch (error) {
    if (__DEV__) {
      console.log('[Session] react-native-view-shot unavailable in current environment', error);
    }
  }
}
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X, MoreHorizontal, Share2, Flame, PenLine, MoonStar, Lock, ChevronUp, Mic } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenProtection } from '@/hooks/useScreenProtection';
import { getGoogleTTSAudio } from '@/services/tts';
import { useApp } from '@/providers/AppProvider';
import { getTierFromEntitlements } from '@/services/entitlements';
import { UserTier } from '@/types';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { getHtmlDay, getPhaseLabel, getDayContent, BLOCKER_OPENERS, milestones } from '@/mocks/content';
import { EXPLAINERS, ExplainerKey } from '@/mocks/explainers';
import CarryPrayerSection from '@/components/CarryPrayerSection';
import ConnectionCheckinModal from '@/components/ConnectionCheckinModal';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { HtmlDayData } from '@/types';
import { SOUNDSCAPE_MAP } from '@/constants/soundscapes';
import { AudioManager } from '@/lib/audioManager';
import AnimatedPressable from '@/components/AnimatedPressable';
import CelebrationParticles from '@/components/CelebrationParticles';
import RadialGlow from '@/components/RadialGlow';
import GlowButton from '@/components/GlowButton';
import ReflectionModal from '@/components/ReflectionModal';
import { DatabaseService } from '@/lib/database';
import { getSafeSession } from '@/lib/supabase';
import { Fonts } from '@/constants/fonts';

interface PhaseSection {
  id: string;
  icon: string;
  name: string;
  sub: string;
  content: string | null;
  isPrompt: boolean;
}

interface SessionExplainerMatch {
  key: ExplainerKey;
  term: string;
  context: string;
  explanation: string;
}

/**
 * One full-screen movement of the pager. The day's aspects map onto
 * eight moments: SETTLE → THANK → REPENT → INVITE → ASK → DECLARE →
 * SELAH → CLOSING.
 */
interface Movement {
  id: string;
  kicker: string;
  sub: string;
  body: string | null;
  isPrompt: boolean;
  kind: 'settle' | 'triad' | 'ask' | 'declare' | 'selah' | 'closing';
}

const TRIAD_APP_STORE_URL = 'https://apps.apple.com/app/triad-prayer';

const SECTION_LABELS: Record<string, string> = {
  settle: 'Settle',
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

function toExplainerMatch(key: ExplainerKey): SessionExplainerMatch {
  const explainer = EXPLAINERS[key];
  return {
    key,
    term: explainer.term,
    context: explainer.context,
    explanation: explainer.explanation,
  };
}

function getSectionExplainers(
  sectionId: string,
  texts: Array<string | null | undefined>,
): SessionExplainerMatch[] {
  const normalizedText = texts
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  const matches = new Set<ExplainerKey>();
  const isTriadSection = ['thank', 'repent', 'invite', 'ask', 'declare'].includes(sectionId);

  if (isTriadSection) {
    matches.add('triad');
  }

  if (sectionId === 'thank') {
    matches.add('worship');
  }

  if (sectionId === 'repent' || normalizedText.includes('repent')) {
    matches.add('repentance');
  }

  if (sectionId === 'invite' || normalizedText.includes('holy spirit') || normalizedText.includes('comforter')) {
    matches.add('holy_spirit');
  }

  if (sectionId === 'declare' || normalizedText.includes('declare') || normalizedText.includes('declaration')) {
    matches.add('declaration');
  }

  if (sectionId === 'selah' || normalizedText.includes('selah')) {
    matches.add('selah');
  }

  if (normalizedText.includes('grace') || normalizedText.includes('forgiven') || normalizedText.includes('forgiveness')) {
    matches.add('grace');
  }

  if (normalizedText.includes('intercession') || normalizedText.includes('intercede') || normalizedText.includes('someone else')) {
    matches.add('intercession');
  }

  if (normalizedText.includes('kingdom')) {
    matches.add('kingdom_of_god');
  }

  if (normalizedText.includes('promise') || normalizedText.includes('promises') || normalizedText.includes('covenant')) {
    matches.add('covenant');
  }

  if (normalizedText.includes('becoming') || normalizedText.includes('growth') || normalizedText.includes('journey')) {
    matches.add('sanctification');
  }

  if (
    normalizedText.includes('father')
    && normalizedText.includes('holy spirit')
    && (normalizedText.includes('jesus') || normalizedText.includes('christ'))
  ) {
    matches.add('trinity');
  }

  return Array.from(matches).map(toExplainerMatch);
}

function buildPhases(d: HtmlDayData): PhaseSection[] {
  const phases: PhaseSection[] = [];

  const items: { id: string; icon: string; name: string; sub: string; sc: string | null; pr?: string | null }[] = [
    { id: 'thank', icon: '🙏', name: 'Thank & Praise', sub: "Start with what's true", sc: d.thank, pr: d.thankPrompt },
    { id: 'repent', icon: '🤍', name: 'Repent & Forgive', sub: 'Honesty that brings freedom', sc: d.repent, pr: d.repentPrompt },
    { id: 'invite', icon: '🕊️', name: 'Invite Holy Spirit', sub: 'Into your spirit, soul & body', sc: d.invite, pr: d.invitePrompt },
    { id: 'ask', icon: '🙌', name: 'Ask & Receive', sub: 'A loving Father', sc: d.ask, pr: d.askPrompt },
    { id: 'declare', icon: '✨', name: 'Declare', sub: 'Your identity in Christ', sc: d.declare, pr: d.declarePrompt },
  ];

  for (const p of items) {
    if (p.sc) {
      phases.push({ id: p.id, icon: p.icon, name: p.name, sub: p.sub, content: p.sc, isPrompt: false });
    } else if (p.pr) {
      phases.push({ id: p.id, icon: p.icon, name: p.name, sub: p.sub, content: p.pr, isPrompt: true });
    }
  }

  return phases;
}

/** Map the day's content into the eight full-screen movements. */
function buildMovements(d: HtmlDayData, phases: PhaseSection[]): Movement[] {
  const movements: Movement[] = [
    {
      id: 'settle',
      kicker: 'Settle',
      sub: 'Breathe in. Breathe out. You are here.',
      body: d.settle,
      isPrompt: false,
      kind: 'settle',
    },
  ];

  for (const p of phases) {
    const kind: Movement['kind'] = p.id === 'ask' ? 'ask' : p.id === 'declare' ? 'declare' : 'triad';
    movements.push({
      id: p.id,
      kicker: p.name,
      sub: p.sub,
      body: p.content,
      isPrompt: p.isPrompt,
      kind,
    });
  }

  movements.push({
    id: 'selah',
    kicker: 'Selah',
    sub: 'Be still and let Him respond',
    body: d.silence > 0 ? d.silenceTxt : d.silenceTxt,
    isPrompt: false,
    kind: 'selah',
  });

  movements.push({
    id: 'closing',
    kicker: 'Closing',
    sub: 'Go in peace',
    body: null,
    isPrompt: false,
    kind: 'closing',
  });

  return movements;
}

export default function SessionScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const router = useRouter();
  const { state, completeDay, completeDailyPrayer, saveReflection, addPrayerRequest, toggleAmbientMute, setAmbientMute, updatePhaseTimings, startSecondPass, updateActiveSession, startSession, checkinDueToday, hasCompletedSessionToday } = useApp();

  const { day, mode } = useGlobalSearchParams<{ day?: string; mode?: string }>();
  const parsedDay = day ? parseInt(day, 10) : state.currentDay;
  const activeDay = Number.isFinite(parsedDay)
    ? Math.min(30, Math.max(1, parsedDay))
    : state.currentDay;
  const activeTier = useMemo(() => getTierFromEntitlements(state.entitlements), [state.entitlements]);
  const isDailyPrayerSession = mode === 'daily-prayer';
  // Night Selah: standalone sleep mode — soundbed, sleep timer & spoken
  // declarations only. Never touches lesson progress.
  const isSleepMode = mode === 'sleep';
  const isReplay = !isDailyPrayerSession && !!day && activeDay !== state.currentDay;
  const hasLibraryBypassAccess = activeTier >= UserTier.PARTNER;
  const hasDailyPrayerAccess = activeTier >= UserTier.MISSIONS;
  // Enforce the one-day-at-a-time lock at the destination screen: the next day
  // is never accessible on the same day it unlocks — not even by deep link.
  const isSameDayAheadAccess = !isDailyPrayerSession
    && activeDay === state.currentDay
    && hasCompletedSessionToday
    && !hasLibraryBypassAccess;
  const isDayAccessible = isSleepMode || (isDailyPrayerSession
    ? hasDailyPrayerAccess
    : (activeDay <= state.currentDay || hasLibraryBypassAccess) && !isSameDayAheadAccess);

  const dayData = useMemo(() => getHtmlDay(activeDay), [activeDay]);

  const isIntercessionDay = useMemo(
    () => /intercess|someone else/i.test(`${dayData.ask} ${dayData.askPrompt ?? ''}`),
    [dayData]
  );
  const phaseLabel = useMemo(() => getPhaseLabel(activeDay), [activeDay]);
  const phases = useMemo(() => buildPhases(dayData), [dayData]);
  const movements = useMemo(() => buildMovements(dayData, phases), [dayData, phases]);
  const currentSoundscape = useMemo(() => SOUNDSCAPE_MAP[state.soundscape], [state.soundscape]);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);

  useScreenProtection(true, 'session-screen');

  useEffect(() => {
    let mounted = true;
    if (currentSoundscape?.uri && currentSoundscape?.id) {
      void AudioManager.getLocalUri(currentSoundscape.id, currentSoundscape.uri).then(uri => {
        if (mounted) setLocalAudioUrl(uri);
      });
    }
    return () => { mounted = false; };
  }, [currentSoundscape]);

  const viewShotRef = useRef<any>(null);
  const achievementShotRef = useRef<any>(null);

  // ── Pager state ──
  // Night Selah opens directly on the Selah movement.
  const [pageIndex, setPageIndex] = useState(() => {
    if (isSleepMode) {
      const idx = movements.findIndex(m => m.kind === 'selah');
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [isComplete, setIsComplete] = useState(false);
  const [checkinVisible, setCheckinVisible] = useState(false);

  // Offer the periodic "How connected do you feel?" check-in once the
  // completion moment has had a chance to land.
  useEffect(() => {
    if (!isComplete || !checkinDueToday) {
      return;
    }
    const timer = setTimeout(() => setCheckinVisible(true), 1800);
    return () => clearTimeout(timer);
  }, [isComplete, checkinDueToday]);
  const [completedDay, setCompletedDay] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [visitedPhases, setVisitedPhases] = useState<Set<string>>(new Set());
  const [reflectionVisible, setReflectionVisible] = useState(false);
  const [selectedExplainer, setSelectedExplainer] = useState<SessionExplainerMatch | null>(null);
  const [explainerSheetVisible, setExplainerSheetVisible] = useState<boolean>(false);

  // The currently-shown movement — every effect that cared about the open
  // phase keeps working against this derived value.
  const openPhase = movements[Math.min(pageIndex, movements.length - 1)]?.id ?? 'settle';
  const phaseStartRef = useRef<number>(Date.now());
  const completingRef = useRef(false);

  const completedDaysCount = useMemo(
    () => state.progress.filter(p => p.completed).length,
    [state.progress]
  );
  const timerBonus = useMemo(
    () => completedDaysCount < 7 ? 0 : completedDaysCount < 14 ? 1 : 2,
    [completedDaysCount]
  );
  const scaledSilence = useMemo(
    () => dayData.silence + timerBonus,
    [dayData.silence, timerBonus]
  );

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(scaledSilence * 60);
  const timerTotal = useMemo(() => scaledSilence * 60, [scaledSilence]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSecondPass = state.journeyPass > 1;
  const dailyPrayerCompletionDate = useMemo(() => new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }), []);

  useEffect(() => {
    if (!isDayAccessible) {
      const title = isDailyPrayerSession
        ? 'Missions access required'
        : isSameDayAheadAccess
          ? 'You’ve prayed today. 🙏'
          : 'Partner access required';
      const message = isDailyPrayerSession
        ? 'Daily Prayer Mode is included with Missions and Partner plans.'
        : isSameDayAheadAccess
          ? `Day ${activeDay} unlocks tomorrow. Rest in what you’ve already received today.`
          : 'That session is still locked. Unlock the full library to jump ahead anytime.';
      Alert.alert(title, message, [
        {
          text: 'View plans',
          onPress: () => router.replace('/paywall'),
        },
        {
          text: 'Go back',
          style: 'cancel',
          onPress: () => router.back(),
        },
      ]);
      return;
    }

    if (!isSleepMode && !isDailyPrayerSession && !isReplay && activeDay === state.currentDay && !state.activeSession) {
      startSession(activeDay);
    }
  }, [activeDay, isDailyPrayerSession, isSleepMode, isDayAccessible, isReplay, isSameDayAheadAccess, router, startSession, state.activeSession, state.currentDay]);

  // Restore an interrupted session to the movement where they left off.
  // Sleep mode always opens on Selah — nothing to restore.
  useEffect(() => {
    if (!isSleepMode && !isReplay && state.activeSession && state.activeSession.day === activeDay) {
      if (state.activeSession.phase) {
        const idx = movements.findIndex(m => m.id === state.activeSession!.phase);
        if (idx >= 0) setPageIndex(idx);
      }
      if (state.activeSession.secondsElapsed > 0) {
        setTimerSeconds(Math.max(0, timerTotal - state.activeSession.secondsElapsed));
      }
    }
    hasRestoredSessionRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, isReplay, state.activeSession, timerTotal]);

  // Persist the session position as the user moves through the movements.
  useEffect(() => {
    if (isSleepMode) {
      return;
    }
    if (!hasRestoredSessionRef.current) {
      return;
    }
    if (!isReplay && activeDay === state.currentDay && state.activeSession) {
      const nextSecondsElapsed = timerTotal - timerSeconds;

      if (
        state.activeSession.phase === openPhase &&
        state.activeSession.secondsElapsed === nextSecondsElapsed
      ) {
        return;
      }

      updateActiveSession({
        phase: openPhase,
        secondsElapsed: nextSecondsElapsed,
      });
    }
  }, [activeDay, isReplay, openPhase, state.activeSession, state.currentDay, timerSeconds, timerTotal, updateActiveSession]);

  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const completeScaleAnim = useRef(new Animated.Value(0.8)).current;
  const timerPulseAnim = useRef(new Animated.Value(1)).current;
  const recapFadeAnim = useRef(new Animated.Value(0)).current;
  const explainerSheetAnim = useRef(new Animated.Value(420)).current;
  const explainerBackdropAnim = useRef(new Animated.Value(0)).current;

  const hasRestoredSessionRef = useRef<boolean>(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioStartedRef = useRef(false);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);

  // ── Sleep-mode audio ──
  // Timestamp-based sleep timer for the Selah soundscape: stores the expiry
  // epoch, so it stays correct while the app is backgrounded (the audio
  // background mode keeps the JS timer alive while the sound plays).
  const [sleepTimerExpiresAt, setSleepTimerExpiresAt] = useState<number | null>(null);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemainingMs, setSleepTimerRemainingMs] = useState<number | null>(null);
  const sleepTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Immersive spoken narration over the soundbed — Kingdom Partner feature.
  const [narrationOn, setNarrationOn] = useState(false);
  const [narrationLockVisible, setNarrationLockVisible] = useState(false);
  const narrationActiveRef = useRef(false);
  const SELAH_TARGET_VOLUME = 0.3;
  const SLEEP_FADE_MS = 30000;

  // Live soundbed volume — adjustable from the menu sheet, applied immediately.
  const [selahVolume, setSelahVolume] = useState(SELAH_TARGET_VOLUME);
  const selahVolumeRef = useRef(selahVolume);
  selahVolumeRef.current = selahVolume;
  const handleVolumeChange = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    selahVolumeRef.current = clamped;
    setSelahVolume(clamped);
    if (soundRef.current && audioStartedRef.current) {
      void soundRef.current.setVolumeAsync(clamped).catch(() => {});
    }
  }, []);

  const clearSleepTimerInterval = useCallback(() => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
  }, []);

  const stopSleepTimer = useCallback(() => {
    clearSleepTimerInterval();
    setSleepTimerExpiresAt(null);
    setSleepTimerMinutes(null);
    setSleepTimerRemainingMs(null);
  }, [clearSleepTimerInterval]);

  const startSleepTimer = useCallback((minutes: number) => {
    const expiresAt = Date.now() + minutes * 60000;
    clearSleepTimerInterval();
    setSleepTimerMinutes(minutes);
    setSleepTimerExpiresAt(expiresAt);
    setSleepTimerRemainingMs(expiresAt - Date.now());
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // The timer is meaningful only if something is playing; if the user
    // muted the soundscape we still run the countdown (narration may be on).
    if (soundRef.current && audioStartedRef.current && !ambientMutedRef.current) {
      void (async () => {
        try {
          const status = await soundRef.current!.getStatusAsync();
          if (status.isLoaded && !status.isPlaying) await soundRef.current!.playAsync();
        } catch {}
      })();
    }
  }, [clearSleepTimerInterval]);

  // Ticks once per second against the stored expiry — never drifts, works
  // backgrounded, and performs a gentle 30-second fade before stopping.
  useEffect(() => {
    if (sleepTimerExpiresAt == null) return;
    const tick = () => {
      const remaining = sleepTimerExpiresAt - Date.now();
      if (remaining <= 0) {
        clearSleepTimerInterval();
        setSleepTimerExpiresAt(null);
        setSleepTimerRemainingMs(null);
        void (async () => {
          try {
            if (soundRef.current) {
              await soundRef.current.setVolumeAsync(0);
              const status = await soundRef.current.getStatusAsync();
              if (status.isLoaded && status.isPlaying) await soundRef.current.pauseAsync();
            }
          } catch {}
        })();
        return;
      }
      setSleepTimerRemainingMs(remaining);
      if (remaining < SLEEP_FADE_MS && soundRef.current) {
        // Gentle fade-out over the final 30 seconds — never a hard cut.
        const fadeVolume = Math.max((remaining / SLEEP_FADE_MS) * selahVolumeRef.current, 0);
        void soundRef.current.setVolumeAsync(fadeVolume).catch(() => {});
      }
    };
    tick();
    sleepTimerIntervalRef.current = setInterval(tick, 1000);
    return () => clearSleepTimerInterval();
  }, [sleepTimerExpiresAt, clearSleepTimerInterval]);

  // The sleep session belongs to the Selah movement — leaving it (or finishing)
  // ends the timer and narration together; nothing plays on after the prayer.
  useEffect(() => {
    if (openPhase !== 'selah' || isComplete) {
      stopSleepTimer();
      setNarrationOn(false);
    }
  }, [openPhase, isComplete, stopSleepTimer]);

  const formatSleepRemaining = useCallback((ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, []);

  // Narration lines for Selah sleep-loop: the day's truth, the word, and the
  // TRIAD movements — spoken slowly over the soundbed, loopable for sleep.
  const narrationLines = useMemo(() => {
    const lines = [
      dayData.identity,
      dayData.verse,
      ...movements
        .filter(m => m.kind !== 'closing' && m.kind !== 'selah')
        .map((m) => m.body),
    ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0);
    return lines;
  }, [dayData, movements]);

  // Selah sleep-loop narration — Night Selah only; the lesson's Selah stays
  // music + timer (spoken narration lives exclusively in Night Selah).
  useEffect(() => {
    const active = isSleepMode && narrationOn && openPhase === 'selah' && narrationLines.length > 0;
    narrationActiveRef.current = active;
    if (!active) {
      if (openPhase === 'selah') Speech.stop();
      return;
    }

    const duck = async (down: boolean) => {
      try {
        if (soundRef.current && audioStartedRef.current && !ambientMutedRef.current) {
          await soundRef.current.setVolumeAsync(down ? 0.08 : selahVolumeRef.current);
        }
      } catch {}
    };

    let cancelled = false;
    const speakLoop = async (index: number) => {
      if (cancelled || !narrationActiveRef.current) return;
      if (index >= narrationLines.length) {
        // Loop for sleep: rest a few beats, then begin again.
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelled || !narrationActiveRef.current) return;
        void speakLoop(0);
        return;
      }
      await duck(true);
      const line = narrationLines[index];
      Speech.speak(line, {
        language: 'en-US',
        rate: Math.max(0.4, Math.min(1, (state.playbackRate ?? 1) * 0.6)),
        pitch: 1.0,
        onDone: () => {
          if (cancelled || !narrationActiveRef.current) return;
          void duck(false).then(() => {
            setTimeout(() => { void speakLoop(index + 1); }, 1200);
          });
        },
        onError: () => {
          void duck(false);
        },
      });
    };

    void speakLoop(0);

    return () => {
      cancelled = true;
      narrationActiveRef.current = false;
      Speech.stop();
      void duck(false);
    };
  }, [narrationOn, openPhase, narrationLines, state.playbackRate, isSleepMode]);

  // Audio-led movement narration: with narration on, each screen speaks its
  // own text as you arrive — the words on screen and the voice stay in sync.
  const currentMovement = movements[Math.min(pageIndex, movements.length - 1)];
  const pageNarrationText = useMemo(() => {
    if (!currentMovement) return null;
    if (currentMovement.kind === 'selah' || currentMovement.kind === 'closing') return null;
    if (currentMovement.body) return `${currentMovement.kicker}. ${currentMovement.body}`;
    return null;
  }, [currentMovement]);

  useEffect(() => {
    if (!narrationOn || isComplete) return;
    if (openPhase === 'selah') return; // the sleep-loop effect owns Selah
    if (!pageNarrationText) return;

    const duck = async (down: boolean) => {
      try {
        if (soundRef.current && audioStartedRef.current && !ambientMutedRef.current) {
          await soundRef.current.setVolumeAsync(down ? 0.08 : selahVolumeRef.current);
        }
      } catch {}
    };

    let cancelled = false;
    void duck(true);
    Speech.speak(pageNarrationText, {
      language: 'en-US',
      rate: Math.max(0.4, Math.min(1, (state.playbackRate ?? 1) * 0.6)),
      pitch: 1.0,
      onDone: () => {
        if (!cancelled) void duck(false);
      },
      onError: () => {
        void duck(false);
      },
    });
    return () => {
      cancelled = true;
      Speech.stop();
      void duck(false);
    };
  }, [narrationOn, openPhase, pageNarrationText, isComplete, state.playbackRate]);

  const handleNarrationToggle = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTier < UserTier.MISSIONS) {
      setNarrationLockVisible(true);
      return;
    }
    setNarrationOn((v) => !v);
  }, [activeTier]);

  const ambientMutedRef = useRef(state.ambientMuted);
  ambientMutedRef.current = state.ambientMuted;

  // Belt-and-braces against audio leaking past the session: if the screen
  // loses focus (deep link away, back navigation mid-teardown), stop the
  // soundscape immediately. The unmount cleanup is the primary guard.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
      return () => {
        if (soundRef.current) {
          void soundRef.current.pauseAsync().catch(() => {});
        }
        if (ttsSoundRef.current) {
          void ttsSoundRef.current.unloadAsync().catch(() => {});
          ttsSoundRef.current = null;
        }
      };
    }, [])
  );

  // Load the soundscape on mount but do NOT start it — music plays only
  // during the Selah movement (see the movement effect below).
  useEffect(() => {
    if (!localAudioUrl) return;
    let mounted = true;
    const loadAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          // Sleep-mode audio: the soundscape (and narration) keep playing with
          // the screen locked. The sleep timer is timestamp-based, so it still
          // fires — and fades — while backgrounded.
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: localAudioUrl },
          { shouldPlay: false, isLooping: true, volume: 0 }
        );
        if (!mounted) { await sound.unloadAsync(); return; }
        soundRef.current = sound;
        await sound.setIsLoopingAsync(true);
        await sound.setVolumeAsync(0);
        audioStartedRef.current = true;
      } catch (e) {
        if (__DEV__) {
          console.log('[Session] Audio load error:', e);
        }
      }
    };
    void loadAudio();
    return () => {
      mounted = false;
      if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }
      if (soundRef.current) { void soundRef.current.unloadAsync(); soundRef.current = null; }
      audioStartedRef.current = false;
    };
  }, [localAudioUrl, state.soundscape, isReplay, setAmbientMute]);

  // Music only during Selah: fade in when the stillness movement shows, fade
  // out and pause as soon as it leaves (or the user mutes / leaves the screen).
  useEffect(() => {
    const fadeToSelah = async () => {
      if (!soundRef.current || !audioStartedRef.current) return;
      try {
        if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }

        if (openPhase === 'selah' && !isComplete && !state.ambientMuted) {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && !status.isPlaying) await soundRef.current.playAsync();
          const TARGET = selahVolumeRef.current;
          const STEPS = 12;
          let s = 0;
          fadeInIntervalRef.current = setInterval(async () => {
            s++;
            try { await soundRef.current?.setVolumeAsync(Math.min((s / STEPS) * TARGET, TARGET)); } catch {}
            if (s >= STEPS && fadeInIntervalRef.current) {
              clearInterval(fadeInIntervalRef.current);
              fadeInIntervalRef.current = null;
            }
          }, 150);
        } else {
          await soundRef.current.setVolumeAsync(0);
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && status.isPlaying) await soundRef.current.pauseAsync();
        }
      } catch {}
    };
    void fadeToSelah();
  }, [openPhase, isComplete, state.ambientMuted, localAudioUrl, focusTick]);

  useEffect(() => {
    if (isComplete && soundRef.current) {
      const fadeOut = async () => {
        try {
          for (let v = selahVolumeRef.current; v >= 0; v -= 0.05) {
            await soundRef.current!.setVolumeAsync(Math.max(v, 0));
            await new Promise(r => setTimeout(r, 80));
          }
          await soundRef.current!.pauseAsync();
        } catch {}
      };
      void fadeOut();
    }
  }, [isComplete]);

  const handleToggleMute = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAmbientMute();
  }, [toggleAmbientMute]);

  const openExplainer = useCallback((explainer: SessionExplainerMatch) => {
    if (__DEV__) {
      console.log('[Session] Opening explainer', { key: explainer.key, term: explainer.term });
    }

    explainerSheetAnim.setValue(420);
    explainerBackdropAnim.setValue(0);
    setSelectedExplainer(explainer);
    setExplainerSheetVisible(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [explainerBackdropAnim, explainerSheetAnim]);

  const closeExplainer = useCallback(() => {
    Animated.parallel([
      Animated.timing(explainerSheetAnim, {
        toValue: 420,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(explainerBackdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setExplainerSheetVisible(false);
      setSelectedExplainer(null);
    });

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [explainerBackdropAnim, explainerSheetAnim]);

  const renderExplainerLinks = useCallback((
    sectionId: string,
    texts: Array<string | null | undefined>,
  ) => {
    const explainers = getSectionExplainers(sectionId, texts);

    if (explainers.length === 0) {
      return null;
    }

    return (
      <View style={styles.explainerWrap} testID={`session-explainer-row-${sectionId}`}>
        <View style={styles.explainerLinksRow}>
          {explainers.map((explainer) => (
            <Pressable
              key={`${sectionId}-${explainer.key}`}
              onPress={() => openExplainer(explainer)}
              style={({ pressed, hovered }: any) => [
                styles.explainerLink,
                hovered && styles.explainerLinkHovered,
                pressed && styles.explainerLinkPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open explainer for ${explainer.term}`}
              testID={`session-explainer-${sectionId}-${explainer.key}`}
            >
              <Text style={[styles.explainerLinkText, { fontFamily: Fonts.titleMedium }]}>{explainer.term}</Text>
              <View style={styles.explainerQuestionDot}>
                <Text style={[styles.explainerQuestionText, { fontFamily: Fonts.titleBold }]}>?</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [openExplainer, styles]);

  // ── Movement navigation ──
  const pagerRef = useRef<ScrollView>(null);
  const pageHeight = Dimensions.get('window').height;

  const goToPage = useCallback((index: number, animated = true) => {
    const clamped = Math.max(0, Math.min(movements.length - 1, index));
    pagerRef.current?.scrollTo({ y: clamped * pageHeight, animated });
  }, [movements.length, pageHeight]);

  // Night Selah: jump the locked pager to the Selah page once it's laid out.
  const selahPageIndex = useMemo(
    () => movements.findIndex(m => m.kind === 'selah'),
    [movements]
  );
  useEffect(() => {
    if (!isSleepMode || selahPageIndex < 0) return;
    const timer = setTimeout(() => {
      pagerRef.current?.scrollTo({ y: selahPageIndex * pageHeight, animated: false });
    }, 120);
    return () => clearTimeout(timer);
  }, [isSleepMode, selahPageIndex, pageHeight]);

  const handleStartTimer = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!timerRunning) {
      setTimerRunning(true);
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimerRunning(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, [timerRunning]);

  // Record time spent in a movement when leaving it — the Insights TRIAD
  // balance and heatmap run on exactly these numbers.
  const recordMovementTime = useCallback((movementId: string, startedAt: number) => {
    if (!['thank', 'repent', 'invite', 'ask', 'declare'].includes(movementId)) return;
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed > 0) updatePhaseTimings(movementId, elapsed);
  }, [updatePhaseTimings]);

  // Per-movement Google TTS voiceover (Settings toggle) — spoken as the
  // movement arrives.
  const speakMovementVoiceover = useCallback((movement: Movement) => {
    // Immersive narration owns the voice when it's on — never let both speak.
    if (!state.voiceoverEnabled || narrationOn) return;
    let textToRead = '';
    if (movement.kind === 'settle') textToRead = 'Settle. ' + dayData.focus;
    else if (movement.kind === 'selah') textToRead = 'Selah. ' + dayData.silenceTxt;
    else if (movement.body) textToRead = `${movement.kicker}. ${movement.sub}. ${movement.body}`;

    if (!textToRead) return;
    void (async () => {
      try {
        if (ttsSoundRef.current) {
          await ttsSoundRef.current.unloadAsync();
          ttsSoundRef.current = null;
        }
        const cacheKey = `${activeDay}-${movement.id}`;
        const audioUrl = await getGoogleTTSAudio(textToRead, cacheKey);
        if (audioUrl) {
          const rate = Math.max(0.5, Math.min(2, state.playbackRate ?? 1));
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioUrl },
            { shouldPlay: true, rate, shouldCorrectPitch: true }
          );
          try {
            await newSound.setRateAsync(rate, true);
          } catch {}
          ttsSoundRef.current = newSound;
        }
      } catch (e) {
        if (__DEV__) console.log('[Session] TTS Error:', e);
      }
    })();
  }, [activeDay, dayData, state.voiceoverEnabled, state.playbackRate, narrationOn]);

  const handlePageChange = useCallback((nextIndex: number) => {
    if (isSleepMode) return;
    const prevIndex = pageIndex;
    if (nextIndex === prevIndex) return;

    const prevMovement = movements[prevIndex];
    if (prevMovement) {
      recordMovementTime(prevMovement.id, phaseStartRef.current);
    }

    setPageIndex(nextIndex);
    phaseStartRef.current = Date.now();

    const nextMovement = movements[nextIndex];
    if (nextMovement) {
      setVisitedPhases(prev => new Set(prev).add(nextMovement.id));
      speakMovementVoiceover(nextMovement);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Arriving at the Closing movement IS the completion moment — the
      // existing streak/progress logic fires here.
      if (nextMovement.kind === 'closing' && !completingRef.current) {
        completingRef.current = true;
        handleCompleteRef.current();
      }
    }
  }, [pageIndex, movements, recordMovementTime, speakMovementVoiceover, isSleepMode]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (ttsSoundRef.current) {
        void ttsSoundRef.current.unloadAsync();
        ttsSoundRef.current = null;
      }
    };
  }, []);

  const handleComplete = useCallback(() => {
    recordMovementTime(openPhase, phaseStartRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerRunning(false);

    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    setCompletedDay(activeDay);

    if (isDailyPrayerSession) {
      completeDailyPrayer(activeDay, duration);
    } else if (!isReplay) {
      completeDay(activeDay, duration);
    }

    setIsComplete(true);

    // Reset and start recap animations
    recapFadeAnim.setValue(0);
    completeScaleAnim.setValue(0.88);

    Animated.parallel([
      Animated.spring(completeScaleAnim, {
        toValue: 1,
        tension: 38,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(recapFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const isMilestone = milestones.some(m => m.day === activeDay);
    if (isMilestone) setTimeout(() => setShowCelebration(true), 400);
  }, [openPhase, recordMovementTime, sessionStartTime, activeDay, isDailyPrayerSession, isReplay, completeDailyPrayer, completeDay, completeScaleAnim, recapFadeAnim]);

  // handleComplete is fired from handlePageChange before its own definition
  // order settles — keep a stable ref.
  const handleCompleteRef = useRef(handleComplete);
  handleCompleteRef.current = handleComplete;

  const handleClose = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  // "..." menu — a bottom sheet: soundbed, live volume, share.
  const handleMenuPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuVisible(true);
  }, []);

  const formatTimer = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }, []);

  const timerProgress = useMemo(
    () => timerTotal > 0 ? 1 - (timerSeconds / timerTotal) : 0,
    [timerSeconds, timerTotal]
  );

  const handleShareTruth = async () => {
    const shareDay = isComplete ? completedDay : activeDay;
    const shareText = `Day ${shareDay}: ${dayData.title}\n\nTHE TRUTH\n"${dayData.identity}"\n\nTHE WORD\n${dayData.verse}\n\nTHE DECLARATION\n${dayData.declare || 'I am a beloved child of God.'}\n\n— Shared from TRIAD Prayer\nGet the app: ${TRIAD_APP_STORE_URL}`;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Web: use Web Share API if available, else clipboard fallback
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: `Day ${shareDay}: Truth`, text: shareText });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(shareText);
          Alert.alert('Copied', "Today's Truth has been copied to your clipboard.");
          return;
        }
        Alert.alert('Sharing unavailable', 'Your browser does not support sharing. Please try on the mobile app.');
      } catch (error) {
        if (__DEV__) console.log('[Share] web error:', error);
      }
      return;
    }

    // Native: try image share first, fall back to text share on any failure
    const tryImageShare = async (): Promise<boolean> => {
      if (!_captureRef || !ViewShot) {
        if (__DEV__) console.log('[Share] view-shot unavailable, falling back to text');
        return false;
      }
      const target = viewShotRef.current;
      if (!target) {
        if (__DEV__) console.log('[Share] viewShotRef.current is null');
        return false;
      }
      try {
        const uri = await _captureRef(target, { format: 'png', quality: 1 });
        if (__DEV__) console.log('[Share] captured uri:', uri);

        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Day ${shareDay}: Truth`,
            UTI: 'public.png',
          });
          return true;
        }
        // iOS-only: Share.share supports url
        if (Platform.OS === 'ios') {
          await Share.share({
            url: uri,
            title: `Day ${shareDay}: Truth`,
            message: shareText,
          });
          return true;
        }
        return false;
      } catch (error) {
        if (__DEV__) console.log('[Share] image share error:', error);
        return false;
      }
    };

    const imageOk = await tryImageShare();
    if (imageOk) return;

    // Text fallback — works on iOS & Android via RN Share
    try {
      await Share.share({
        message: shareText,
        title: `Day ${shareDay}: Truth`,
      });
    } catch (error) {
      if (__DEV__) console.log('[Share] text share error:', error);
      Alert.alert('Sharing failed', 'We could not open the share sheet. Please try again.');
    }
  };
  const handleShareTruthRef = useRef(handleShareTruth);
  handleShareTruthRef.current = handleShareTruth;

  // ── Streak share: a celebration card for the Closing screen ──
  const handleShareAchievement = useCallback(async () => {
    const count = Math.max(1, state.streakCount || 1);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shareText = `${count}-day prayer streak on TRIAD Prayer \u{1F525}\n\nPrayer isn't a streak — it's a relationship.\n\n— Shared from TRIAD Prayer\nGet the app: ${TRIAD_APP_STORE_URL}`;

    const tryImageShare = async (): Promise<boolean> => {
      if (!_captureRef || !ViewShot) return false;
      const target = achievementShotRef.current;
      if (!target) return false;
      try {
        const uri = await _captureRef(target, { format: 'png', quality: 1 });
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `${count}-day prayer streak`,
            UTI: 'public.png',
          });
          return true;
        }
        return false;
      } catch (error) {
        if (__DEV__) console.log('[Share] achievement image error:', error);
        return false;
      }
    };

    if (await tryImageShare()) return;

    try {
      await Share.share({ message: shareText, title: `${count}-day prayer streak` });
    } catch (error) {
      if (__DEV__) console.log('[Share] achievement text share error:', error);
    }
  }, [state.streakCount]);

  // ── Ask movement: private-by-default prayer composer ──
  const [menuVisible, setMenuVisible] = useState(false);
  const [askComposerVisible, setAskComposerVisible] = useState(false);
  const [askText, setAskText] = useState('');
  const [askShare, setAskShare] = useState(false);

  const handleAddPrayer = async () => {
    const text = askText.trim();
    if (!text) return;

    // Private record always saves first — sharing must never lose the prayer.
    addPrayerRequest(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (askShare) {
      const session = await getSafeSession();
      if (!session?.user || session.user.is_anonymous === true) {
        Alert.alert(
          'Sign in to share',
          'Your prayer is saved here, private. Create a free account to share it on the wall.',
          [
            { text: 'Keep private', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.push('/auth') },
          ],
        );
      } else {
        try {
          await DatabaseService.createCommunityEcho(text, null);
        } catch {
          Alert.alert('Couldn’t share your prayer', 'Your words are still here, saved privately. Check your connection and try again.');
        }
      }
    }

    setAskText('');
    setAskShare(false);
    setAskComposerVisible(false);
  };

  // ── Declare movement: SPEAK the declaration aloud ──
  const [speakingDeclaration, setSpeakingDeclaration] = useState(false);
  const handleSpeakDeclaration = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (speakingDeclaration) {
      Speech.stop();
      setSpeakingDeclaration(false);
      return;
    }
    const declaration = dayData.declare || 'I am a beloved child of God.';
    setSpeakingDeclaration(true);
    Speech.speak(declaration, {
      language: 'en-US',
      rate: Math.max(0.4, Math.min(1, (state.playbackRate ?? 1) * 0.75)),
      pitch: 1.0,
      onDone: () => setSpeakingDeclaration(false),
      onError: () => setSpeakingDeclaration(false),
    });
  }, [speakingDeclaration, dayData.declare, state.playbackRate]);

  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

  useEffect(() => {
    if (!explainerSheetVisible) {
      return;
    }

    Animated.parallel([
      Animated.spring(explainerSheetAnim, {
        toValue: 0,
        tension: 68,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.timing(explainerBackdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [explainerBackdropAnim, explainerSheetAnim, explainerSheetVisible]);

  useEffect(() => {
    if (!timerRunning || openPhase !== 'selah' || timerSeconds === 0) {
      timerPulseAnim.setValue(1);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulseAnim, {
          toValue: 1.02,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(timerPulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
      timerPulseAnim.setValue(1);
    };
  }, [openPhase, timerPulseAnim, timerRunning, timerSeconds]);

  const isMilestoneDay = useMemo(
    () => milestones.some(m => m.day === completedDay),
    [completedDay]
  );
  const milestone = useMemo(
    () => milestones.find(m => m.day === completedDay),
    [completedDay]
  );

  const lookBackEntry = useMemo(() => {
    if (!isMilestoneDay || state.prayerRequests.length === 0) return null;
    return state.prayerRequests[0];
  }, [isMilestoneDay, state.prayerRequests]);

  if (!isDayAccessible) {
    return null;
  }

  const blockerIdx = state.user?.blocker ?? -1;

  /** Full-bleed page: kicker, large serif text, optional scripture + guidance. */
  const renderMovementBody = (movement: Movement) => {
    if (movement.kind === 'closing') return null;

    return (
      <View>
        {movement.kind === 'settle' && (
          <Text style={[styles.movementEyebrowSmall, { fontFamily: Fonts.titleMedium }]}>
            {isDailyPrayerSession
              ? `Daily Prayer · Day ${activeDay} · ${phaseLabel}`
              : `Day ${activeDay} · ${phaseLabel} · ${currentSoundscape.label}`}
          </Text>
        )}
        <Text style={[styles.movementKicker, { fontFamily: Fonts.titleSemiBold }]}>{movement.kicker.toUpperCase()}</Text>

        {movement.kind === 'settle' && state.user?.firstName ? (
          <Text style={[styles.settleWelcome, { fontFamily: Fonts.italic }]}>
            Welcome back, {state.user.firstName}.
          </Text>
        ) : null}

        {movement.isPrompt ? (
          <Text style={[styles.movementBody, styles.movementBodyPrompt, { fontFamily: Fonts.serifRegular }]}>
            {movement.body}
          </Text>
        ) : (
          <Text style={[styles.movementBody, { fontFamily: Fonts.serifRegular }]}>{movement.body}</Text>
        )}

        {/* The day's teaching rides with Settle — welcome first, truth beneath */}
        {movement.kind === 'settle' && (
          <>
            {blockerIdx >= 0 && activeDay === 1 && BLOCKER_OPENERS[blockerIdx] && (
              <View style={styles.identityBar}>
                <Text style={styles.identityIcon}>💬</Text>
                <Text style={[styles.identityText, { fontFamily: Fonts.italic }]}>{BLOCKER_OPENERS[blockerIdx]}</Text>
              </View>
            )}
            {dayData.focus ? (
              <View style={styles.settleTeachWrap}>
                <View style={styles.scriptureBorder} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settleTeachLabel, { fontFamily: Fonts.titleMedium }]}>TODAY&apos;S TRUTH</Text>
                  <Text style={[styles.settleTeachText, { fontFamily: Fonts.serifRegular }]}>{dayData.focus}</Text>
                  {dayData.identity ? (
                    <Text style={[styles.settleTeachIdentity, { fontFamily: Fonts.serifSemiBold }]}>{dayData.identity}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* Scripture gets the left-border treatment, on Declare */}
        {movement.kind === 'declare' && (
          <>
            {dayData.verse ? (
              <View style={styles.scriptureBlock}>
                <View style={styles.scriptureBorder} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scriptureLabel, { fontFamily: Fonts.titleMedium }]}>THE WORD</Text>
                  <Text style={[styles.scriptureText, { fontFamily: Fonts.serifRegular }]}>{dayData.verse}</Text>
                </View>
              </View>
            ) : null}
            {dayData.identity ? (
              <Text style={[styles.declareIdentity, { fontFamily: Fonts.serifSemiBold }]}>&quot;{dayData.identity}&quot;</Text>
            ) : null}
            <AnimatedPressable
              onPress={handleSpeakDeclaration}
              style={[styles.speakBtn, speakingDeclaration && styles.speakBtnActive]}
              scaleValue={0.96}
              testID="declare-speak-button"
              accessibilityLabel={speakingDeclaration ? 'Stop speaking' : 'Speak the declaration aloud'}
            >
              <Mic size={15} color={C.accent} strokeWidth={2.2} />
              <Text style={[styles.speakBtnText, { fontFamily: Fonts.titleBold }]}>
                {speakingDeclaration ? 'STOP' : 'SPEAK'}
              </Text>
            </AnimatedPressable>
          </>
        )}

        {movement.kind === 'ask' && (
          <>
            {/* Add Prayer — private by default, opt-in share */}
            {!askComposerVisible ? (
              <AnimatedPressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAskComposerVisible(true);
                }}
                style={styles.askAddBtn}
                scaleValue={0.97}
                testID="ask-add-prayer"
              >
                <Text style={[styles.askAddBtnText, { fontFamily: Fonts.titleBold }]}>ADD A PRAYER</Text>
              </AnimatedPressable>
            ) : (
              <View style={styles.askComposer}>
                <TextInput
                  style={[styles.askInput, { fontFamily: Fonts.italic }]}
                  placeholder="What do you need? Ask your Father…"
                  placeholderTextColor={C.textMuted}
                  value={askText}
                  onChangeText={setAskText}
                  multiline
                  autoFocus
                  testID="ask-prayer-input"
                />
                <Text style={[styles.askPrivacyNote, { fontFamily: Fonts.italic }]}>
                  Your prayer is private, until you choose to share it.
                </Text>
                <Pressable
                  onPress={() => setAskShare((v) => !v)}
                  style={[styles.askShareToggle, askShare && styles.askShareToggleActive]}
                  testID="ask-share-toggle"
                >
                  <View style={[styles.askShareBox, askShare && styles.askShareBoxActive]}>
                    {askShare ? <Text style={styles.askShareCheck}>{'\u2713'}</Text> : null}
                  </View>
                  <Text style={[styles.askShareLabel, { fontFamily: Fonts.titleMedium }]}>Share on the prayer wall</Text>
                </Pressable>
                <View style={styles.askComposerActions}>
                  <Pressable onPress={() => setAskComposerVisible(false)}>
                    <Text style={[styles.askCancelText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleAddPrayer()} style={styles.askSaveBtn} testID="ask-save-prayer">
                    <Text style={[styles.askSaveText, { fontFamily: Fonts.titleBold }]}>SAVE</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <CarryPrayerSection isIntercessionDay={isIntercessionDay} />
          </>
        )}

        {renderExplainerLinks(movement.id, [movement.kicker, movement.sub, movement.body, movement.kind === 'settle' ? dayData.focus : null])}

        {isSecondPass && movement.kind !== 'selah' && (
          <View style={styles.reflectivePrompt}>
            <View style={styles.reflectiveDivider} />
            <Text style={[styles.reflectiveLabel, { fontFamily: Fonts.titleSemiBold }]}>SECOND PASS REFLECTION</Text>
            <Text style={[styles.reflectiveText, { fontFamily: Fonts.italic }]}>What did I notice this time?</Text>
          </View>
        )}

        <Text style={[styles.movementGuidance, { fontFamily: Fonts.italic }]}>{movement.sub}</Text>
      </View>
    );
  };

  /** Selah — stillness with the ring timer, soundbed, sleep timer & narration. */
  const renderSelahBody = () => (
    <View>
      <Text style={[styles.movementKicker, { fontFamily: Fonts.titleSemiBold }]}>SELAH</Text>
      {dayData.silence > 0 ? (
        <View style={styles.timerCard}>
          <Text style={[styles.timerEyebrow, { fontFamily: Fonts.italic }]}>
            You&apos;ve spoken. Now be still and let Him respond.
          </Text>
          {/* The 1-minute stillness exercise is a lesson mechanic — in Night
              Selah the user came to fall asleep, so only the rest copy shows. */}
          {!isSleepMode && (
            <View style={styles.timerRingWrap}>
              <View style={styles.timerRing}>
                <View style={styles.timerCenter}>
                  <Text style={[styles.timerDisplay, { fontFamily: Fonts.titleLight }]}>
                    {timerSeconds === 0 ? '✓' : formatTimer(timerSeconds)}
                  </Text>
                </View>
              </View>
              <View style={[styles.timerProgressRing, { borderColor: `rgba(200,137,74,${0.15 + timerProgress * 0.55})` }]}>
                <View style={[
                  styles.timerProgressFill,
                  { transform: [{ rotate: `${timerProgress * 360}deg` }] },
                ]} />
              </View>
            </View>
          )}
          <Text style={[styles.timerTxt, { fontFamily: Fonts.serifRegular }]}>{dayData.silenceTxt}</Text>
          {!isSleepMode && renderExplainerLinks('selah', ['Selah', dayData.silenceTxt])}
          {!isSleepMode && (
            <AnimatedPressable
              style={styles.timerBtn}
              onPress={handleStartTimer}
              scaleValue={0.96}
              accessibilityLabel={timerSeconds === 0 ? 'Timer complete' : timerRunning ? 'Pause timer' : 'Start timer'}
              testID="selah-timer-button"
            >
              <Text style={[styles.timerBtnText, { fontFamily: Fonts.titleLight }]}>
                {timerSeconds === 0 ? 'DONE ✓' : timerRunning ? 'PAUSE' : timerSeconds < timerTotal ? 'RESUME' : 'START'}
              </Text>
            </AnimatedPressable>
          )}
        </View>
      ) : (
        <Text style={[styles.timerOpenTxt, { fontFamily: Fonts.serifRegular }]}>{dayData.silenceTxt}</Text>
      )}

      {/* The day's truth gives the stillness somewhere to land —
          shown in both sleep mode and the lesson's Selah. */}
      {dayData.identity ? (
        <View style={styles.selahRestOnWrap}>
          <Text style={[styles.selahRestOnEyebrow, { fontFamily: Fonts.titleMedium }]}>REST ON THIS</Text>
          <Text style={[styles.selahRestOnText, { fontFamily: Fonts.serifRegular }]}>{dayData.identity}</Text>
        </View>
      ) : null}

      {/* Sleep timer + immersive narration — rest here as long as you need */}
      <View style={styles.selahRestWrap}>
        <View style={styles.selahRestHeader}>
          <MoonStar size={14} color={C.accent} />
          <Text style={[styles.selahRestLabel, { fontFamily: Fonts.titleSemiBold }]}>REST HERE</Text>
          {sleepTimerRemainingMs != null && (
            <Text style={[styles.selahCountdown, { fontFamily: Fonts.titleMedium }]}>
              {formatSleepRemaining(sleepTimerRemainingMs)}
            </Text>
          )}
        </View>
        <View style={styles.selahRestChips}>
          {[15, 30, 45, 60].map((m) => {
            const isActive = sleepTimerMinutes === m && sleepTimerRemainingMs != null;
            return (
              <Pressable
                key={m}
                onPress={() => startSleepTimer(m)}
                style={[styles.selahChip, isActive && styles.selahChipActive]}
                testID={`sleep-timer-${m}`}
              >
                <Text
                  style={[
                    styles.selahChipText,
                    { fontFamily: isActive ? Fonts.titleBold : Fonts.titleMedium },
                    isActive && styles.selahChipTextActive,
                  ]}
                >
                  {m}m
                </Text>
              </Pressable>
            );
          })}
          {sleepTimerExpiresAt != null && (
            <Pressable onPress={stopSleepTimer} style={styles.selahChip} testID="sleep-timer-off">
              <Text style={[styles.selahChipText, { fontFamily: Fonts.titleMedium }]}>OFF</Text>
            </Pressable>
          )}
        </View>
        {/* Spoken narration belongs to Night Selah alone — the lesson's
            Selah stays music + sleep timer. */}
        {isSleepMode && (
          <Pressable
            onPress={handleNarrationToggle}
            style={[styles.selahNarrationRow, narrationOn && styles.selahNarrationRowActive]}
            testID="narration-toggle"
          >
            <View style={styles.selahNarrationCopy}>
              <Text style={[styles.selahNarrationTitle, { fontFamily: Fonts.titleSemiBold }]}>
                {narrationOn ? 'Narration playing' : 'Immersive Narration'}
              </Text>
              <Text style={[styles.selahNarrationSub, { fontFamily: Fonts.italic }]}>
                {narrationOn
                  ? 'Truth and scripture, spoken softly — looping you to sleep.'
                  : 'Declarations & scripture spoken over the soundbed.'}
              </Text>
            </View>
            {activeTier < UserTier.MISSIONS ? (
              <Lock size={14} color={C.iconMuted} />
            ) : (
              <Text style={[styles.selahNarrationState, { fontFamily: Fonts.titleBold }]}>
                {narrationOn ? 'ON' : 'OFF'}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {isSecondPass && (
        <View style={styles.reflectivePrompt}>
          <View style={styles.reflectiveDivider} />
          <Text style={[styles.reflectiveLabel, { fontFamily: Fonts.titleSemiBold }]}>SECOND PASS REFLECTION</Text>
          <Text style={[styles.reflectiveText, { fontFamily: Fonts.italic }]}>What did I notice this time?</Text>
        </View>
      )}
    </View>
  );

  /** Closing — the completion moment; day-complete has already fired. */
  const renderClosingBody = () => (
    <View style={styles.closingWrap}>
      <Animated.View style={[styles.completeBadgeOuter, { transform: [{ scale: completeScaleAnim }] }]}>
        <View style={styles.completeBadgeInner}>
          <Check size={28} color={C.accent} strokeWidth={2.4} />
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: recapFadeAnim, alignItems: 'center' }}>
        {isDailyPrayerSession ? (
          <>
            <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>DAILY PRAYER</Text>
            <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>You prayed today.</Text>
            <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
              Come back tomorrow.{dailyPrayerCompletionDate ? ` · ${dailyPrayerCompletionDate}` : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>
              {isReplay ? `DAY ${completedDay || activeDay} · REVISITED` : `DAY ${completedDay || activeDay}`}
            </Text>
            <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Prayer Complete</Text>
            <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
              Feel free to stay in this space for as long as you need.
            </Text>
          </>
        )}

        {isMilestoneDay && milestone && (
          <View style={styles.milestoneCard}>
            <Text style={styles.milestoneEmoji}>✨</Text>
            <View style={styles.milestoneTextWrap}>
              <Text style={[styles.milestoneLabel, { fontFamily: Fonts.titleBold }]}>MILESTONE REACHED</Text>
              <Text style={[styles.milestoneMessage, { fontFamily: Fonts.italic }]}>{milestone.message}</Text>
            </View>
          </View>
        )}

        {isMilestoneDay && lookBackEntry && !isReplay && (
          <View style={styles.lookBackCard}>
            <Text style={[styles.lookBackEyebrow, { fontFamily: Fonts.titleMedium }]}>A THOUGHT FROM YOUR PAST</Text>
            <Text style={[styles.lookBackText, { fontFamily: Fonts.serifRegular }]}>&quot;{lookBackEntry.text}&quot;</Text>
          </View>
        )}

        {!isReplay && (completedDay || activeDay) < 30 && (() => {
          const tomorrowContent = getDayContent((completedDay || activeDay) + 1);
          return (
            <View style={styles.tomorrowCard}>
              <Text style={[styles.tomorrowEyebrow, { fontFamily: Fonts.titleMedium }]}>UP NEXT · DAY {(completedDay || activeDay) + 1}</Text>
              <Text style={[styles.tomorrowTitle, { fontFamily: Fonts.serifLight }]}>{tomorrowContent.title}</Text>
            </View>
          );
        })()}

        {isComplete && (
          <View style={styles.recapActions}>
            {!isDailyPrayerSession && !isReplay && (
              <GlowButton
                label="CAPTURE DAILY REFLECTION"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReflectionVisible(true);
                }}
                variant="ghost"
                icon={<PenLine size={16} color="rgba(200,137,74,0.7)" />}
                style={{ marginBottom: 16 }}
              />
            )}

            <GlowButton
              label="SHARE TRUTH"
              onPress={() => void handleShareTruth()}
              variant="ghost"
              icon={<Share2 size={16} color={C.accent} />}
              style={{ marginBottom: 16 }}
              textStyle={{ fontFamily: Fonts.titleMedium }}
            />

            <GlowButton
              label={`SHARE ${state.streakCount > 1 ? `${state.streakCount}-DAY STREAK` : 'STREAK'}`}
              onPress={() => void handleShareAchievement()}
              variant="ghost"
              icon={<Flame size={16} color={C.accent} />}
              style={{ marginBottom: 16 }}
              textStyle={{ fontFamily: Fonts.titleMedium }}
            />

            {!state.user?.id && (
              <GlowButton
                label="SAVE PROGRESS"
                onPress={() => router.push('/auth')}
                variant="amber"
                style={{ marginBottom: 16 }}
                textStyle={{ fontFamily: Fonts.titleMedium }}
              />
            )}

            <GlowButton
              label={isReplay ? "FINISH REVISITING ✓" : "DONE"}
              onPress={() => router.replace('/')}
              variant="primary"
              style={{ marginBottom: 16 }}
            />

            {(completedDay || activeDay) === 30 && !isReplay && (
              <GlowButton
                label="BEGIN SECOND PASS"
                onPress={() => {
                  startSecondPass();
                  router.replace('/');
                }}
                variant="amber"
                icon={<Flame size={18} color="#180C02" />}
              />
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root} testID="session-screen">
        {/* Full-bleed, dark, warm, atmospheric — Triad's own aesthetic */}
        <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
          locations={[0, 0.24, 0.62, 1]}
          style={styles.ambientVeil}
        />
        <View style={styles.ambientGlowWrap} pointerEvents="none">
          <RadialGlow size={520} maxOpacity={openPhase === 'selah' ? 0.16 : 0.1} />
        </View>
        <CelebrationParticles active={showCelebration} />

        <SafeAreaView style={styles.safeArea}>
          {/* Chrome: X close, movement count, "..." menu */}
          <View style={styles.chromeBar}>
            <AnimatedPressable
              onPress={handleClose}
              style={styles.chromeBtn}
              scaleValue={0.94}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="session-back-button"
              accessibilityLabel="Close session"
            >
              <X size={20} color={C.textSecondary} />
            </AnimatedPressable>
            <Text style={[styles.chromeProgress, { fontFamily: Fonts.titleMedium }]}>
              {isSleepMode
                ? 'SELAH'
                : `${String(Math.min(pageIndex + 1, movements.length)).padStart(2, '0')} · ${String(movements.length).padStart(2, '0')}`}
            </Text>
            <AnimatedPressable
              onPress={handleMenuPress}
              style={styles.chromeBtn}
              scaleValue={0.94}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="session-menu-button"
              accessibilityLabel="Session options"
            >
              <MoreHorizontal size={22} color={C.textSecondary} />
            </AnimatedPressable>
          </View>

          {/* Vertical page dots on the right edge — progress through movements */}
          {!isSleepMode && (
            <View style={styles.dotsRail} pointerEvents="box-none">
              {movements.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => goToPage(i)}
                  style={styles.dotHit}
                  testID={`session-dot-${m.id}`}
                  accessibilityLabel={`Go to ${m.kicker}`}
                >
                  <View
                    style={[
                      styles.dot,
                      i === pageIndex && styles.dotActive,
                      i < pageIndex && styles.dotVisited,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}

          {/* Full-screen vertical pager — one movement per screen */}
          <ScrollView
            ref={pagerRef}
            style={styles.pager}
            pagingEnabled
            nestedScrollEnabled
            scrollEnabled={!isSleepMode}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
              handlePageChange(Math.max(0, Math.min(movements.length - 1, idx)));
            }}
            testID="session-pager"
          >
            {movements.map((movement, mIdx) => (
              <View key={movement.id} style={[styles.page, { height: pageHeight }]} testID={`movement-${movement.id}`}>
                <ScrollView
                  contentContainerStyle={styles.pageContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {movement.kind === 'closing'
                    ? renderClosingBody()
                    : movement.kind === 'selah'
                      ? renderSelahBody()
                      : renderMovementBody(movement)}

                  {/* Swipe-up hint — every movement leads onward */}
                  {mIdx < movements.length - 1 && !(isSleepMode && movement.kind === 'selah') && (
                    <AnimatedPressable
                      onPress={() => goToPage(mIdx + 1)}
                      style={styles.nextHint}
                      scaleValue={0.94}
                      testID={`session-next-${movement.id}`}
                      accessibilityLabel={`Continue to ${movements[mIdx + 1].kicker}`}
                    >
                      <Text style={[styles.nextHintText, { fontFamily: Fonts.titleMedium }]}>
                        {movement.kind === 'selah' ? 'CONTINUE WHEN READY' : 'CONTINUE'}
                      </Text>
                      <ChevronUp size={14} color={C.accent} />
                    </AnimatedPressable>
                  )}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* "..." menu — bottom sheet with soundbed, live volume & share */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuSheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuVisible(false)} testID="session-menu-backdrop" />
          <View style={[styles.menuSheet, { backgroundColor: C.surface, borderColor: C.border }]} testID="session-menu-sheet">
            <View style={[styles.menuSheetHandle, { backgroundColor: C.border }]} />
            <Text style={[styles.menuSheetTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              {isSleepMode ? 'Selah' : 'Session'}
            </Text>

            <Pressable onPress={handleToggleMute} style={styles.menuRow} testID="menu-soundbed-row">
              <Text style={[styles.menuRowLabel, { color: C.text, fontFamily: Fonts.titleMedium }]}>Soundbed</Text>
              <Text style={[styles.menuRowState, { color: C.accent, fontFamily: Fonts.titleBold }]}>
                {state.ambientMuted ? 'OFF' : 'ON'}
              </Text>
            </Pressable>

            <View style={styles.menuRow} testID="menu-volume-row">
              <Text style={[styles.menuRowLabel, { color: C.text, fontFamily: Fonts.titleMedium }]}>Volume</Text>
              {Platform.OS !== 'web' ? (
                <Slider
                  style={styles.menuSlider}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.01}
                  value={selahVolume}
                  onValueChange={handleVolumeChange}
                  minimumTrackTintColor={C.accent}
                  maximumTrackTintColor="rgba(200,137,74,0.2)"
                  thumbTintColor={C.accent}
                  accessibilityLabel="Soundbed volume"
                />
              ) : (
                <Text style={[styles.menuRowState, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                  {Math.round(selahVolume * 100)}%
                </Text>
              )}
            </View>

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                void handleShareTruthRef.current();
              }}
              style={styles.menuRow}
              testID="menu-share-row"
            >
              <Text style={[styles.menuRowLabel, { color: C.text, fontFamily: Fonts.titleMedium }]}>Share this day</Text>
              <Share2 size={16} color={C.accent} />
            </Pressable>

            <Pressable onPress={() => setMenuVisible(false)} style={styles.menuCloseBtn} testID="menu-close">
              <Text style={[styles.menuCloseText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <FeatureLockSheet
        visible={narrationLockVisible}
        onClose={() => setNarrationLockVisible(false)}
        featureName="Immersive Narration"
        requirement="Kingdom Partner"
      />

      <Modal
        visible={explainerSheetVisible && selectedExplainer !== null}
        transparent
        animationType="none"
        onRequestClose={closeExplainer}
      >
        <View style={styles.explainerModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExplainer} testID="session-explainer-backdrop">
            <Animated.View style={[styles.explainerBackdrop, { opacity: explainerBackdropAnim }]} />
          </Pressable>

          <Animated.View
            style={[
              styles.explainerSheet,
              {
                backgroundColor: C.surface,
                borderColor: C.border,
                transform: [{ translateY: explainerSheetAnim }],
              },
            ]}
            testID="session-explainer-sheet"
          >
            <View style={[styles.explainerSheetHandle, { backgroundColor: C.border }]} />
            <Text style={[styles.explainerSheetTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              {selectedExplainer?.term ?? ''}
            </Text>
            <Text style={[styles.explainerSheetContext, { color: C.accent, fontFamily: Fonts.titleMedium }]}>
              {selectedExplainer?.context ?? ''}
            </Text>
            <Text style={[styles.explainerSheetBody, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
              {selectedExplainer?.explanation ?? ''}
            </Text>
            <Pressable onPress={closeExplainer} style={styles.explainerSheetClose} testID="session-explainer-close">
              <Text style={[styles.explainerSheetCloseText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>CLOSE</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {/* Daily Reflection Modal */}
      <ReflectionModal
        visible={reflectionVisible}
        day={completedDay || activeDay}
        onSave={(reflection) => {
          saveReflection(reflection);
          setReflectionVisible(false);
        }}
        onClose={() => setReflectionVisible(false)}
      />

      <ConnectionCheckinModal
        visible={checkinVisible}
        onClose={() => setCheckinVisible(false)}
      />

      {/* Hidden view for image capturing */}
      <View style={{ position: 'absolute', left: -5000, top: 0 }}>
        {ViewShot ? (
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>
            <View style={[styles.shareCard, { backgroundColor: C.background }]}>
            <View style={styles.shareCardTop}>
              <Text style={[styles.shareCardHeader, { fontFamily: Fonts.titleBold, color: C.accent }]}>
                DAY {completedDay || activeDay} · {dayData.title.toUpperCase()}
              </Text>
            </View>

            <View style={styles.shareCardBody}>
              <View style={styles.shareCardSection}>
                <Text style={[styles.shareCardLabel, { fontFamily: Fonts.titleBold }]}>THE TRUTH</Text>
                <Text style={[styles.shareCardTruth, { fontFamily: Fonts.serifSemiBold, color: C.text }]}>
                  &quot;{dayData.identity}&quot;
                </Text>
              </View>

              <View style={styles.shareCardSection}>
                <View style={styles.shareCardDivider} />
                <Text style={[styles.shareCardLabel, { fontFamily: Fonts.titleBold }]}>THE WORD</Text>
                <Text style={[styles.shareCardVerse, { fontFamily: Fonts.serifRegular, color: C.text }]}>
                  {dayData.verse}
                </Text>
              </View>

              <View style={styles.shareCardSection}>
                <View style={styles.shareCardDivider} />
                <Text style={[styles.shareCardLabel, { fontFamily: Fonts.titleBold }]}>THE DECLARATION</Text>
                <Text style={[styles.shareCardDeclare, { fontFamily: Fonts.serifRegular, color: C.textSecondary }]}>
                  {dayData.declare || "I am a beloved child of God."}
                </Text>
              </View>
            </View>

            <View style={styles.shareCardFooter}>
              <Text style={[styles.shareCardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>TRIAD PRAYER</Text>
              <Text style={[styles.shareCardAppInfo, { fontFamily: Fonts.serifRegular, color: C.textMuted }]}>Available on the App Store</Text>
            </View>
            </View>
          </ViewShot>
        ) : (
          <View ref={viewShotRef}>
            <View style={[styles.shareCard, { backgroundColor: C.background }]}>
              <View style={styles.shareCardTop}>
                <Text style={[styles.shareCardHeader, { fontFamily: Fonts.titleBold, color: C.accent }]}>
                  DAY {completedDay || activeDay} · {dayData.title.toUpperCase()}
                </Text>
              </View>
              <View style={styles.shareCardBody} />
              <View style={styles.shareCardFooter}>
                <Text style={[styles.shareCardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>TRIAD PRAYER</Text>
                <Text style={[styles.shareCardAppInfo, { fontFamily: Fonts.serifRegular, color: C.textMuted }]}>Available on the App Store</Text>
              </View>
            </View>
          </View>
        )}

        {/* Streak celebration card — captured by handleShareAchievement */}
        {ViewShot ? (
          <ViewShot ref={achievementShotRef} options={{ format: 'png', quality: 1.0 }}>
            <View style={[styles.achievementCard, { backgroundColor: C.background }]}>
              <View style={styles.achievementCenter}>
                <Text style={styles.achievementEmoji}>{'\u{1F525}'}</Text>
                <Text style={[styles.achievementStreak, { fontFamily: Fonts.serifLight, color: C.text }]}>
                  {Math.max(1, state.streakCount || 1)}-day streak
                </Text>
                <Text style={[styles.achievementQuote, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
                  Prayer isn&apos;t a streak — it&apos;s a relationship.
                </Text>
              </View>
              <View style={styles.shareCardFooter}>
                <Text style={[styles.shareCardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>TRIAD PRAYER</Text>
                <Text style={[styles.shareCardAppInfo, { fontFamily: Fonts.serifRegular, color: C.textMuted }]}>Available on the App Store</Text>
              </View>
            </View>
          </ViewShot>
        ) : null}
      </View>
    </>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safeArea: {
    flex: 1,
  },
  ambientVeil: {
    ...StyleSheet.absoluteFillObject,
  },
  ambientGlowWrap: {
    position: 'absolute',
    top: -120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // ── Chrome ──
  chromeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chromeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
  },
  chromeProgress: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    color: C.textMuted,
  },

  // ── Page dots (right edge) ──
  dotsRail: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    gap: 14,
    zIndex: 20,
  },
  dotHit: {
    padding: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(200,137,74,0.22)',
    alignSelf: 'center',
  },
  dotActive: {
    backgroundColor: C.accent,
    width: 5,
    height: 18,
    borderRadius: 3,
  },
  dotVisited: {
    backgroundColor: 'rgba(200,137,74,0.5)',
  },

  // ── Pager pages ──
  pager: {
    flex: 1,
  },
  page: {
    justifyContent: 'center',
  },
  pageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 24,
    paddingBottom: 48,
  },
  movementEyebrowSmall: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
    marginBottom: 18,
  },
  movementKicker: {
    fontSize: T.scale(11),
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 20,
  },
  movementBody: {
    fontSize: T.scale(27),
    lineHeight: T.scale(40),
    color: C.text,
    marginBottom: 28,
  },
  movementBodyPrompt: {
    fontStyle: 'italic' as const,
    color: C.textSecondary,
  },
  movementGuidance: {
    fontSize: T.scale(14),
    lineHeight: 22,
    color: C.textMuted,
    marginTop: 28,
    maxWidth: 300,
  },
  settleWelcome: {
    fontSize: T.scale(17),
    color: C.textSecondary,
    marginTop: -10,
    marginBottom: 14,
  },
  settleTeachWrap: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  settleTeachLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.55)',
    marginBottom: 8,
    marginTop: 2,
  },
  settleTeachText: {
    fontSize: T.scale(16),
    lineHeight: 27,
    color: C.textSecondary,
  },
  settleTeachIdentity: {
    fontSize: T.scale(16),
    lineHeight: 26,
    color: C.accentDark,
    marginTop: 12,
  },
  identityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    marginBottom: 8,
  },
  identityIcon: {
    fontSize: 15,
  },
  identityText: {
    flex: 1,
    fontSize: T.scale(14),
    lineHeight: 21,
    color: C.textSecondary,
  },

  // ── Scripture (left-border treatment) ──
  scriptureBlock: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 16,
  },
  scriptureBorder: {
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(200,137,74,0.55)',
  },
  scriptureLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.55)',
    marginBottom: 8,
    marginTop: 2,
  },
  scriptureText: {
    fontSize: T.scale(17),
    lineHeight: 28,
    color: C.text,
  },
  declareIdentity: {
    fontSize: T.scale(20),
    lineHeight: 32,
    color: C.accentDark,
    marginVertical: 18,
  },
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(200,137,74,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    minHeight: 44,
  },
  speakBtnActive: {
    backgroundColor: 'rgba(200,137,74,0.2)',
    borderColor: C.accent,
  },
  speakBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    color: C.accent,
  },

  // ── Ask movement: private-by-default composer ──
  askAddBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    marginTop: 8,
  },
  askAddBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    color: C.accent,
  },
  askComposer: {
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 16,
    marginTop: 16,
  },
  askInput: {
    fontSize: T.scale(17),
    lineHeight: 26,
    color: C.text,
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  askPrivacyNote: {
    fontSize: T.scale(13),
    lineHeight: 19,
    color: C.textMuted,
    marginTop: 12,
  },
  askShareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    padding: 4,
  },
  askShareToggleActive: {
    borderColor: 'rgba(200,137,74,0.3)',
  },
  askShareBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askShareBoxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  askShareCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 15,
  },
  askShareLabel: {
    fontSize: T.scale(14),
    color: C.textSecondary,
  },
  askComposerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  askCancelText: {
    fontSize: T.scale(11),
    color: C.textMuted,
    letterSpacing: 1.5,
  },
  askSaveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 100,
  },
  askSaveText: {
    fontSize: T.scale(11),
    color: '#FFF',
    letterSpacing: 1.5,
  },

  // ── Selah ──
  timerCard: {
    alignItems: 'center',
    marginVertical: 8,
  },
  timerEyebrow: {
    fontSize: T.scale(15),
    lineHeight: 23,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  timerRingWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  timerRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCenter: {
    alignItems: 'center',
  },
  timerDisplay: {
    fontSize: T.scale(42),
    letterSpacing: 1,
    color: C.text,
  },
  timerProgressRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  timerProgressFill: {
    position: 'absolute',
    top: -2,
    left: 88,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  timerTxt: {
    fontSize: T.scale(17),
    lineHeight: 27,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  timerBtn: {
    backgroundColor: 'rgba(200,137,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.28)',
    borderRadius: 100,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  timerBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.text,
  },
  timerOpenTxt: {
    fontSize: T.scale(24),
    lineHeight: 36,
    color: C.text,
    textAlign: 'center',
    marginVertical: 24,
  },
  selahRestOnWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  selahRestOnEyebrow: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 10,
  },
  selahRestOnText: {
    fontSize: T.scale(20),
    lineHeight: 30,
    color: C.text,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  selahRestWrap: {
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(200,137,74,0.14)',
  },
  selahRestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  selahRestLabel: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  selahCountdown: {
    fontSize: T.scale(12),
    color: C.text,
    marginLeft: 'auto' as const,
  },
  selahRestChips: {
    flexDirection: 'row',
    gap: 8,
  },
  selahChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selahChipActive: {
    backgroundColor: 'rgba(200,137,74,0.16)',
    borderColor: C.accent,
  },
  selahChipText: {
    fontSize: T.scale(13),
    letterSpacing: 1,
    color: C.textSecondary,
  },
  selahChipTextActive: {
    color: C.accent,
  },
  selahNarrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  selahNarrationRowActive: {
    backgroundColor: 'rgba(200,137,74,0.14)',
    borderColor: C.accent,
  },
  selahNarrationCopy: {
    flex: 1,
  },
  selahNarrationTitle: {
    fontSize: T.scale(13),
    lineHeight: 18,
    color: C.text,
  },
  selahNarrationSub: {
    fontSize: T.scale(11),
    lineHeight: 16,
    color: C.textMuted,
    marginTop: 2,
  },
  selahNarrationState: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    color: C.accent,
  },

  // ── Closing ──
  closingWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  completeBadgeOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    backgroundColor: 'rgba(200,137,74,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeBadgeInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeDayLabel: {
    fontSize: T.scale(11),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  completeTitle: {
    fontSize: T.scale(36),
    lineHeight: T.scale(44),
    color: C.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  closingStayCopy: {
    fontSize: T.scale(16),
    lineHeight: 25,
    color: C.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 24,
  },
  milestoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.25)',
    borderRadius: 18,
    padding: 16,
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  milestoneEmoji: {
    fontSize: T.scale(24),
  },
  milestoneTextWrap: {
    flex: 1,
  },
  milestoneLabel: {
    fontSize: T.scale(10),
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 4,
  },
  milestoneMessage: {
    fontSize: T.scale(14),
    lineHeight: 21,
    color: C.textSecondary,
  },
  lookBackCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(200,137,74,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  lookBackEyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: 'rgba(200,137,74,0.55)',
    marginBottom: 8,
  },
  lookBackText: {
    fontSize: T.scale(16),
    lineHeight: 26,
    color: C.textSecondary,
  },
  tomorrowCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(200,137,74,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 8,
  },
  tomorrowEyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: 'rgba(200,137,74,0.55)',
    marginBottom: 6,
  },
  tomorrowTitle: {
    fontSize: T.scale(19),
    lineHeight: 27,
    color: C.text,
  },
  recapActions: {
    alignSelf: 'stretch',
    marginTop: 16,
  },

  // ── Continue hint ──
  nextHint: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    marginTop: 28,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  nextHintText: {
    fontSize: T.scale(10),
    letterSpacing: 2.5,
    color: C.textMuted,
  },

  // ── Explainers ──
  explainerWrap: {
    marginTop: 16,
  },
  explainerLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  explainerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
  },
  explainerLinkHovered: {
    backgroundColor: 'rgba(200,137,74,0.12)',
  },
  explainerLinkPressed: {
    backgroundColor: 'rgba(200,137,74,0.16)',
  },
  explainerLinkText: {
    fontSize: T.scale(12),
    color: C.textMuted,
  },
  explainerQuestionDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(200,137,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerQuestionText: {
    fontSize: 9,
    lineHeight: 12,
    color: C.accentDark,
  },
  reflectivePrompt: {
    marginTop: 20,
  },
  reflectiveDivider: {
    width: 44,
    height: 1,
    backgroundColor: 'rgba(200,137,74,0.35)',
    marginBottom: 10,
  },
  reflectiveLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 6,
  },
  reflectiveText: {
    fontSize: T.scale(15),
    lineHeight: 23,
    color: C.textSecondary,
  },

  // ── Explainer sheet ──
  explainerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  explainerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  explainerSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 52,
  },
  explainerSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  explainerSheetTitle: {
    fontSize: T.scale(24),
    marginBottom: 6,
  },
  explainerSheetContext: {
    fontSize: T.scale(13),
    letterSpacing: 1,
    marginBottom: 14,
  },
  explainerSheetBody: {
    fontSize: T.scale(16),
    lineHeight: 27,
    marginBottom: 20,
  },
  explainerSheetClose: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  explainerSheetCloseText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
  },

  // ── Share card (hidden capture target) ──
  shareCard: {
    width: 640,
    height: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 32,
    justifyContent: 'space-between',
  },
  shareCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shareCardHeader: {
    fontSize: 14,
    letterSpacing: 2.5,
  },
  shareCardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  shareCardSection: {},
  shareCardDivider: {
    height: 1,
    backgroundColor: 'rgba(200,137,74,0.25)',
    marginBottom: 12,
  },
  shareCardLabel: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: 'rgba(200,137,74,0.7)',
    marginBottom: 6,
  },
  shareCardTruth: {
    fontSize: 24,
    lineHeight: 34,
  },
  shareCardVerse: {
    fontSize: 17,
    lineHeight: 26,
  },
  shareCardDeclare: {
    fontSize: 15,
    lineHeight: 23,
  },
  shareCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareCardWatermark: {
    fontSize: 13,
    letterSpacing: 3,
  },
  shareCardAppInfo: {
    fontSize: 12,
  },

  // ── Streak celebration card (hidden capture target) ──
  achievementCard: {
    width: 340,
    height: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 28,
    justifyContent: 'space-between',
  },
  achievementCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  achievementEmoji: {
    fontSize: 44,
  },
  achievementStreak: {
    fontSize: 34,
    textAlign: 'center' as const,
  },
  achievementQuote: {
    fontSize: 15,
    textAlign: 'center' as const,
  },

  // ── "..." menu bottom sheet ──
  menuSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  menuSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 52,
  },
  menuSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  menuSheetTitle: {
    fontSize: T.scale(24),
    marginBottom: 18,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 16,
  },
  menuRowLabel: {
    fontSize: T.scale(16),
  },
  menuRowState: {
    fontSize: T.scale(13),
    letterSpacing: 2,
  },
  menuSlider: {
    flex: 1,
    height: 40,
  },
  menuCloseBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 6,
  },
  menuCloseText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
  },
});
