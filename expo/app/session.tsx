import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
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
  AppState,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X, MoreHorizontal, Share2, Flame, PenLine, MoonStar, Lock, ChevronUp, ChevronRight, Mic } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenProtection } from '@/hooks/useScreenProtection';
import { getGoogleTTSAudio, voiceoverCacheKey } from '@/services/tts';
import { deviceFallbackSpeechRate, getSelahLoopUrl, speakText, stopSpokenAudio } from '@/services/narration';
import { useApp } from '@/providers/AppProvider';
import { getTierFromEntitlements, getFeatureRequirement, hasFeature } from '@/services/entitlements';
import { UserTier , HtmlDayData } from '@/types';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { getHtmlDay, getPhaseLabel, getDayContent, getDeclarationText, BLOCKER_OPENERS, milestones } from '@/mocks/content';
import {
  foundationsCompleteFromProgress,
  getActiveTrackId,
  getFrontierStatus,
  isGraduateFromProgress,
  recordTrackCompletedDay,
  recordTrackCompletion,
  resolveEffectiveTrackId,
  setActiveTrackId,
  setTrackDay,
  type FrontierStatus,
} from '@/lib/trackProgress';
import { getTrack, getTrackDay, TRACKS } from '@/mocks/tracks';
import { isSelectionInPool } from '@/lib/dailyPrayer';
import type { DailyPrayerSelection } from '@/types';
import { EXPLAINERS, ExplainerKey } from '@/mocks/explainers';
import { reportError } from '@/lib/crashReporter';
import ConnectionCheckinModal from '@/components/ConnectionCheckinModal';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { SOUNDSCAPE_MAP } from '@/constants/soundscapes';
import { AudioManager } from '@/lib/audioManager';
import AnimatedPressable from '@/components/AnimatedPressable';
import CelebrationParticles from '@/components/CelebrationParticles';
import RadialGlow from '@/components/RadialGlow';
import GlowButton from '@/components/GlowButton';
import ReflectionModal from '@/components/ReflectionModal';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import WallGuidelinesSheet from '@/components/WallGuidelinesSheet';
import { DatabaseService } from '@/lib/database';
import { isHeldWallPost, supportCardVariantForBlock, supportCardVariantForHold } from '@/lib/moderation';
import { getSafeSession } from '@/lib/supabase';
import { Fonts } from '@/constants/fonts';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { allNonClosingMovementsVisited, firstUnvisitedMovementIndex, resolvePageHeight } from '@/lib/sessionPager';
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
  kind: 'settle' | 'triad' | 'ask' | 'declare' | 'selah' | 'act' | 'closing';
}

const TRIAD_APP_STORE_URL = 'https://apps.apple.com/app/id6767898619';

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
  texts: (string | null | undefined)[],
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

  // Deliverance-family terms (also wired into the declarations reader).
  if (normalizedText.includes('deliver')) {
    matches.add('deliverance');
  }

  if (normalizedText.includes('generational')) {
    matches.add('generational_curse');
  }

  if (normalizedText.includes('agreement')) {
    matches.add('break_agreement');
  }

  if (normalizedText.includes('enemy')) {
    matches.add('the_enemy');
  }

  if (normalizedText.includes('in christ')) {
    matches.add('in_christ');
  }

  if (normalizedText.includes('spirit, soul') || normalizedText.includes('i am a spirit')) {
    matches.add('spirit_soul_body');
  }

  if (normalizedText.includes('gospel')) {
    matches.add('gospel');
  }

  return Array.from(matches).map(toExplainerMatch);
}

function buildPhases(d: HtmlDayData): PhaseSection[] {
  const phases: PhaseSection[] = [];

  const items: { id: string; icon: string; name: string; sub: string; sc: string | null; pr?: string | null }[] = [
    { id: 'thank', icon: '🙏', name: 'Thank & Praise', sub: "Start with what's true", sc: d.thank, pr: d.thankPrompt },
    { id: 'repent', icon: '🤍', name: 'Repent & Forgive', sub: 'Honesty that brings freedom', sc: d.repent, pr: d.repentPrompt },
    { id: 'invite', icon: '🕊️', name: 'Invite Holy Spirit', sub: 'Into every part of you — spirit, soul, and body', sc: d.invite, pr: d.invitePrompt },
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
      kicker: "Let's Pray",
      sub: 'There is no rush. Father God is already here.',
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
    sub: 'Listen — He responds',
    body: d.silence > 0 ? d.silenceTxt : d.silenceTxt,
    isPrompt: false,
    kind: 'selah',
  });

  // Live It — the day's act was written for every day but never rendered;
  // it now stands as the final movement before the closing.
  if (d.act) {
    movements.push({
      id: 'act',
      kicker: 'Live It',
      sub: 'Carry it into your day',
      body: d.act,
      isPrompt: false,
      kind: 'act',
    });
  }

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
  const { state, completeDay, completeDailyPrayer, saveReflection, addPrayerRequest, toggleAmbientMute, setAmbientMute, updatePhaseTimings, startSecondPass, updateActiveSession, startSession, clearActiveSession, checkinDueToday, hasCompletedSessionToday, hasOnlyJumpedCompletionsToday, cancelNeglectedPhaseReminders, requestSupportCard, dailyPrayerPool, dailyPrayerPoolReady, refreshDailyPrayerPool, getTodayDailyPrayerSelection, recordTrackPrayerToday, rescheduleDailyReminder } = useApp();

  // Local params, not global: they carry THIS navigation's values at first
  // render. Global params still describe the previous route on the opening
  // frame, so mode==='sleep' (and the Selah start page) resolved a beat late
  // and the journey's first page flashed before the pager jumped to Selah.
  const { day, mode, track: trackParam, phase: phaseParam } = useLocalSearchParams<{ day?: string; mode?: string; track?: string; phase?: string }>();
  const parsedDay = day ? parseInt(day, 10) : state.currentDay;

  // ── Track awareness ──
  // Foundations uses the global progress (state.currentDay).
  // Other tracks use per-track progress from trackProgress, with gating
  // (locked until Foundations is finished) and pacing (one day per prayer
  // day) resolved from the frontier status.
  // Daily Prayer expansion (Kai, 2026-10-26): a Daily Prayer session
  // is a revisit of a (track, day) selection, not always Foundations.
  // The track arrives as a route param from Home and is validated
  // synchronously here — a live track with days, otherwise Foundations
  // — so the first render already carries the right track and nothing
  // can flash as Foundations first. An unvalidated or tampered param
  // (unknown id, coming_soon track, empty days) falls back to
  // Foundations, never to an empty day. This is NOT persisted as the
  // user's active track preference: the mount effect below skips the
  // active-track resolution for Daily Prayer sessions.
  const dailyTrackId = mode === 'daily-prayer'
    ? (() => {
        const t = trackParam ? getTrack(trackParam) : undefined;
        return t && t.status === 'live' && t.days.length > 0 ? t.id : 'foundations';
      })()
    : 'foundations';
  const [activeTrackId, setActiveTrackIdState] = useState<string>(dailyTrackId);
  const [trackDay, setTrackDayState] = useState<number>(1);
  const [frontierStatus, setFrontierStatus] = useState<FrontierStatus | null>(null);
  // The active track resolves asynchronously; until it does, every value
  // derived below (activeDay, dayData, movements, access) silently assumes
  // Foundations. The render gate at the bottom holds the pager back until
  // this flips, so a Freedom session can never flash — or start — as a
  // Foundations one (the Selah-flash pattern, one layer deeper).
  const [trackStateReady, setTrackStateReady] = useState<boolean>(false);
  // Audit fix F2: Daily Prayer route trust — if the requested
  // (track, day) is not in the reached pool (tampered deep link, stale
  // Home card), the session falls back to today's selection instead of
  // opening an unreached day. Null = no fallback needed. Validated once
  // per mount, only after the pool refresh lands (dailyPrayerPoolReady),
  // so the Foundations-only initial pool can never false-trigger it.
  const [dailyPrayerFallback, setDailyPrayerFallback] = useState<DailyPrayerSelection | null>(null);
  const dailyPrayerValidatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Daily Prayer expansion: the session track is the selection's
      // track from the route param (already in state above), NOT the
      // user's active track — resolving the active track here would
      // overwrite it with the user's current journey and load the
      // wrong day's content. No frontier is needed: Daily Prayer is
      // access-gated on graduation/tier only, never on frontier day.
      if (mode === 'daily-prayer') {
        setActiveTrackIdState(dailyTrackId);
        // Audit fix F2: refresh the reached pool even on a cold deep
        // link, so the validation effect below checks against the real
        // pool, not the Foundations-only initial state.
        void refreshDailyPrayerPool();
        setTrackStateReady(true);
        return;
      }
      try {
        const tid = await getActiveTrackId();
        // Kai-approved 2026-10-26: gating uses the sticky graduate flag,
        // so a second pass does not bounce a graduate back to Foundations.
        const foundationsDone = isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated);
        const effective = resolveEffectiveTrackId(tid, foundationsDone);
        if (cancelled) return;
        setActiveTrackIdState(effective);
        if (effective !== 'foundations') {
          const status = await getFrontierStatus(effective);
          if (cancelled) return;
          setFrontierStatus(status);
          setTrackDayState(status.day);
        }
      } catch {
        // Track resolution failed — fall back to the Foundations assumption
        // rather than holding the session closed forever.
      } finally {
        if (!cancelled) setTrackStateReady(true);
      }
    })();
    return () => { cancelled = true; };
    // Mount-time snapshot: AppProvider state is loaded before Home renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFoundations = activeTrackId === 'foundations';
  const trackDayCount = getTrack(activeTrackId)?.dayCount ?? 30;

  const requestedDayRaw = day ? parseInt(day, 10) : NaN;
  const requestedDay = Number.isFinite(requestedDayRaw) ? requestedDayRaw : null;

  // Daily Prayer expansion (Kai, 2026-10-26): Daily Prayer advertises
  // a (track, day) selection on Home. The old J-B6 bug — deriving
  // content from the user's ACTIVE track and clamping to its dayCount,
  // so a Freedom user got Freedom Day min(dailyPrayerDay, 21) instead
  // of the promised Foundations day — stays fixed by a different
  // mechanism now: the session track IS the selection's track
  // (dailyTrackId above, never the active track), and the day is
  // clamped to THAT track's dayCount. A Foundations selection still
  // loads Foundations content exactly as before.
  // (mode is read directly here: isDailyPrayerSession is declared below.)
  const activeDay = mode === 'daily-prayer' && dailyPrayerFallback
    ? dailyPrayerFallback.day
    : mode === 'daily-prayer'
    ? Math.min(trackDayCount, Math.max(1, requestedDay ?? state.currentDay))
    : isFoundations
      ? (Number.isFinite(parsedDay) ? Math.min(30, Math.max(1, parsedDay)) : state.currentDay)
      : Math.min(trackDayCount, Math.max(1, requestedDay ?? trackDay));
  // "Today" for session start/record: Foundations uses the global
  // currentDay; tracks use their own frontier day. Comparing a track
  // session against state.currentDay (as the old code did) meant track
  // sessions never started or recorded an active session.
  const todayDay = isFoundations ? state.currentDay : trackDay;
  const activeTier = useMemo(() => getTierFromEntitlements(state.entitlements), [state.entitlements]);
  const isDailyPrayerSession = mode === 'daily-prayer';
  // Night Selah: standalone sleep mode — soundbed, sleep timer & spoken
  // declarations only. Never touches lesson progress.
  const isSleepMode = mode === 'sleep';
  const isReplay = !isDailyPrayerSession && !!day && (isFoundations
    ? activeDay !== state.currentDay
    : activeDay !== trackDay);
  // Track replays: an explicitly requested day at or behind the completed
  // frontier — revisiting never advances progress or consumes pacing.
  const isTrackReplay = !isFoundations && !isDailyPrayerSession && requestedDay != null
    && requestedDay <= (frontierStatus?.completedDays ?? Math.max(0, trackDay - 1));
  const isAnyReplay = isReplay || isTrackReplay;
  // Pacing gate: today's frontier day was already completed this prayer day —
  // the next day unlocks tomorrow morning (4 AM boundary).
  const isPacingLocked = !isFoundations && !isSleepMode && !isDailyPrayerSession && !isTrackReplay
    && frontierStatus != null && !frontierStatus.available && !frontierStatus.isComplete
    && activeDay === trackDay;
  // F39: Daily Prayer Mode is free for all graduates — journey completion
  // (the journeyComplete flag, or 30 completed days in progress) grants
  // access regardless of tier. The MISSIONS-tier check stays as a fallback.
  // (The narration/voiceover gates below stay at MISSIONS — separate feature.)
  const isGraduate = isGraduateFromProgress(state.progress, state.journeyComplete, state.hasGraduated);
  const hasDailyPrayerAccess = activeTier >= UserTier.MISSIONS || isGraduate;
  // Partner Library jump-ahead (revises the old "partners can revisit,
  // never jump ahead" rule, deliberately and narrowly): Partners —
  // BROWSE_LIBRARY tier via getTierFromEntitlements, so the 'missions'
  // entitlement counts as Partner exactly as the entitlement system
  // defines it — may open any day from the Library. Free users keep the
  // old lock exactly. This is NOT a binge exemption for the frontier:
  // completing a jumped day records that day only and never advances
  // the frontier (completeDay's resolver / recordTrackCompletedDay), so
  // the daily walk still advances one frontier day per prayer day.
  // Audit round 3, J-S12's warning still applies to the frontier path:
  // nothing here lets a Partner advance the frontier faster.
  const canBrowseLibrary = hasFeature('BROWSE_LIBRARY', activeTier) === true;
  const isFoundationsJumpAhead = isFoundations && canBrowseLibrary && activeDay > state.currentDay;
  const isTrackJumpAhead = !isFoundations && canBrowseLibrary && frontierStatus != null && activeDay > trackDay;
  const isJumpAhead = !isDailyPrayerSession && !isSleepMode && (isFoundationsJumpAhead || isTrackJumpAhead);
  // Enforce the one-day-at-a-time lock at the destination screen: the next day
  // is never accessible until the current day is completed — not even by deep
  // link or subscription — except for a Partner jump-ahead day, which the
  // Library opened tier-checked. Replays (activeDay < currentDay) bypass
  // the lock by definition.
  // Jump-ahead same-day carve-out: a jumped completion must not lock the
  // real frontier day for the rest of the prayer day. hasCompletedSessionToday
  // is progress-based, so completing Day 20 would otherwise make reopening
  // Day 5 look like "already prayed today". Only a day whose completions
  // are ALL jumped-ahead (no frontier / Daily Prayer / track session
  // today) lifts the lock; every other combination keeps it.
  const isSameDayAheadAccess = !isDailyPrayerSession
    && activeDay === state.currentDay
    && hasCompletedSessionToday
    && !hasOnlyJumpedCompletionsToday;
  // Tracks used to be exempt from the gate entirely (`!isFoundations` made
  // every track day accessible), so a deep link to a future Freedom day
  // opened it — and completing it advanced the frontier past uncompleted
  // days. The frontier guard: a track day is open only when it is a
  // revisit, the whole track is complete, the pacing screen owns it, or
  // it is today's available frontier day. Audit fix F12 (fail closed):
  // a null frontier (resolution failed — the mount effect still flips
  // trackStateReady so the screen does not hang forever) must NOT read
  // as accessible: with no frontier there is no proof this day is
  // reached, so the inaccessible alert + back path owns the screen
  // instead of the day's content.
  const isTrackDayAccessible = frontierStatus != null && (frontierStatus.isComplete || isTrackReplay
    || isPacingLocked
    || isTrackJumpAhead
    || (activeDay === trackDay && frontierStatus.available));
  const isDayAccessible = isSleepMode || (isDailyPrayerSession
    ? hasDailyPrayerAccess
    : isFoundations
      ? (activeDay <= state.currentDay || isFoundationsJumpAhead) && !isSameDayAheadAccess
      : isTrackDayAccessible);

  // Audit fix F2 (validation half): once the reached pool is ready,
  // check the requested Daily Prayer selection against it. A mismatch
  // (deep link to a day the user has not reached, or a stale card)
  // falls back to today's selection — the session never opens an
  // unreached day's content. Track (non-Daily-Prayer) sessions are
  // NOT validated here: their frontier gate (isTrackDayAccessible,
  // fail-closed per F12 below) already owns that check.
  useEffect(() => {
    if (!isDailyPrayerSession || !dailyPrayerPoolReady || dailyPrayerValidatedRef.current) return;
    dailyPrayerValidatedRef.current = true;
    // State updates live inside the async callback (the mount effect's
    // own pattern), not synchronously in the effect body.
    void (async () => {
      const requested: DailyPrayerSelection = {
        trackId: dailyTrackId,
        day: Math.min(
          getTrack(dailyTrackId)?.dayCount ?? 30,
          Math.max(1, requestedDay ?? state.currentDay),
        ),
      };
      if (!isSelectionInPool(dailyPrayerPool, requested)) {
        const fallback = getTodayDailyPrayerSelection();
        setDailyPrayerFallback(fallback);
        setActiveTrackIdState(fallback.trackId);
      }
    })();
    // Mount-time validation only; the pool/ready values are read at
    // the moment the gate opens, not tracked afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDailyPrayerSession, dailyPrayerPoolReady]);

  const dayData = useMemo(
    () => {
      // Daily Prayer expansion (Kai, 2026-10-26): Daily Prayer loads
      // the SELECTION track's day — a Freedom selection loads Freedom
      // content, a Foundations selection loads Foundations content
      // exactly as before. It never loads the user's active track's
      // day, because the session track is the selection's track.
      if (isDailyPrayerSession) {
        if (!isFoundations) {
          return getTrackDay(activeTrackId, activeDay) ?? getHtmlDay(activeDay);
        }
        return getHtmlDay(activeDay);
      }
      if (!isFoundations) {
        return getTrackDay(activeTrackId, activeDay) ?? getHtmlDay(activeDay);
      }
      return getHtmlDay(activeDay);
    },
    [isFoundations, activeTrackId, activeDay, isDailyPrayerSession]
  );

  // Session verse lines are spoken-word fragments, not the whole verse the
  // citation names — and the words are baked into narration audio, so
  // the WORDS cannot change without a re-bake. The display marks the
  // citation as an excerpt instead (render-only; narration audio and
  // dayData wording are unchanged). Shared text carries the SAME
  // "(excerpt)" marker via formatVerseForShare below — it is not
  // unmarked. Lines without the 'REF — TEXT' shape render unmarked
  // rather than garbled, on both surfaces.
  const verseExcerpt = useMemo(() => {
    if (!dayData.verse) return null;
    const idx = dayData.verse.indexOf(' — ');
    if (idx <= 0) return null;
    return { ref: dayData.verse.slice(0, idx), text: dayData.verse.slice(idx + 3) };
  }, [dayData.verse]);

  const renderVerse = (style: any) => verseExcerpt ? (
    <Text style={style}>
      {verseExcerpt.ref} <Text style={{ color: C.textSecondary }}>(excerpt)</Text> — {verseExcerpt.text}
    </Text>
  ) : (
    <Text style={style}>{dayData.verse}</Text>
  );

  // PL-H4 ruling (Kai, 2026-10-25, settled, as refined by the batch
  // pass): day-verse lines carry disclosure on every visual surface.
  // The in-session rendering above marks the citation as "(excerpt)"
  // after the ref; shared text carries the same marker, so a share
  // never presents a paraphrase/fragment line as verbatim WEB. Lines
  // without the 'REF — TEXT' shape stay unmarked, exactly as
  // in-session (never garbled). Citations themselves are unchanged.
  // WEB switch (batch pass, Kai 2026-10-25): the 16 divergence lines
  // were WEB-aligned against the scripture bank — wording replaced
  // where it came from another translation, truncation spans kept
  // where retained words were already verbatim WEB (2 lines kept
  // unchanged). Lines with no bank entry were NOT reworded.
  // Audio carve-out (Kai, 2026-10-25, after round 6): Night Selah
  // audio is formally exempt from disclosure — it speaks day-verse
  // lines undisclosed, by decision, not oversight. The Selah re-bake
  // owed by this switch is tracked in the batch report, not waived
  // by the carve-out.
  const formatVerseForShare = (verse: string): string => {
    const idx = verse.indexOf(' — ');
    if (idx <= 0) return verse;
    return `${verse.slice(0, idx)} (excerpt) — ${verse.slice(idx + 3)}`;
  };

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

  // ── Pager state ──
  // Night Selah opens directly on the Selah movement.
  // Round-2 M4: a ?phase= jump is honored exactly once — the restore
  // effect below re-runs when activeSession changes (every page turn),
  // and must not yank the pager back to the tapped movement afterwards.
  const phaseJumpDoneRef = useRef(false);
  const [pageIndex, setPageIndex] = useState(() => {
    if (isSleepMode) {
      const idx = movements.findIndex(m => m.kind === 'selah');
      return idx >= 0 ? idx : 0;
    }
    // Round-2 M4: a neglected-phase notification tap carries ?phase=
    // (a movement id). The tap's intent wins over resume: open directly
    // on that movement, never on the closing screen.
    if (phaseParam) {
      const idx = movements.findIndex(m => m.id === phaseParam);
      if (idx >= 0 && movements[idx].kind !== 'closing') return idx;
    }
    // Resume where the user left off on the FIRST frame, not one effect
    // later — otherwise the pager paints page 0 and then jumps (the same
    // first-frame flash the Selah fix removed). The layout-effect restore
    // below re-checks once the async track state resolves.
    // Track guard: a session belongs to one track. Legacy sessions carry
    // no trackId: they resume by day alone ONLY on Foundations screens
    // (audit round 3, J-S8 — resuming one into a track's content showed
    // the wrong track's day under the old guard).
    if (!isReplay && !isDailyPrayerSession && state.activeSession && state.activeSession.day === activeDay && state.activeSession.phase
      && ((!state.activeSession.trackId && isFoundations) || state.activeSession.trackId === activeTrackId)) {
      const idx = movements.findIndex(m => m.id === state.activeSession!.phase);
      if (idx >= 0 && movements[idx].kind !== 'closing') return idx;
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
  const [sessionStartTime] = useState(() => Date.now());
  // Audit round 3, J-S4: the old code kept only the setter — the visited
  // set itself was discarded, so nothing could guard the dot path. The set
  // now lives here and every rendered movement adds itself (below), so the
  // Closing guard in handlePageChange can tell a prayed-through session
  // from a dot-jump. Seeded with every movement up to the opening page:
  // a resumed session (opened mid-way after a kill) must not have to
  // re-walk pages it already prayed to earn its completion.
  const [visitedPhases, setVisitedPhases] = useState<Set<string>>(
    () => new Set(movements.slice(0, pageIndex + 1).map((m) => m.id)),
  );
  const [reflectionVisible, setReflectionVisible] = useState(false);
  const [selectedExplainer, setSelectedExplainer] = useState<SessionExplainerMatch | null>(null);
  const [explainerSheetVisible, setExplainerSheetVisible] = useState<boolean>(false);

  // The currently-shown movement — every effect that cared about the open
  // phase keeps working against this derived value.
  const openPhase = movements[Math.min(pageIndex, movements.length - 1)]?.id ?? 'settle';

  // Audit round 3, J-S4: record every movement the user actually sees, so
  // arriving at Closing only completes the day when the session was prayed
  // through. Returning the previous set when unchanged avoids a render loop.
  useEffect(() => {
    setVisitedPhases((prev) => {
      if (prev.has(openPhase)) return prev;
      return new Set(prev).add(openPhase);
    });
  }, [openPhase]);
  const phaseStartRef = useRef<number>(Date.now());
  const completingRef = useRef(false);
  // Wave 2, fix 4: set when the user lands on Closing WITHOUT having
  // visited every movement (dot-tap/fling skip). The closing page then
  // renders an explicit "not complete" variant instead of the "Prayer
  // Complete" title with no actions and no explanation. Cleared on
  // leaving Closing or on a real completion.
  const [closingIncomplete, setClosingIncomplete] = useState(false);
  // Wave 2, fix 5: set when a track completion save fails, so the
  // closing page can offer an in-session TRY AGAIN instead of stranding
  // the user. Cleared when a completion attempt starts or succeeds.
  const [completionSaveFailed, setCompletionSaveFailed] = useState(false);
  // Wave 2, fix 5: the single guarded completion runner, shared by the
  // pager arrival (handlePageChange, defined before handleComplete)
  // and the closing page's TRY AGAIN button. Assigned once
  // handleComplete exists (see the mirror effect below); a no-op
  // until then, which cannot happen for a real page turn.
  const attemptCompletionRef = useRef<() => void>(() => {});

  const completedDaysCount = useMemo(
    () => state.progress.filter(p => p.completed).length,
    [state.progress]
  );
  // Audit round 3, J-S9: the silence bonus padded track days by Foundations
  // progress. Tracks use their own completed-days count (frontier record);
  // Foundations keeps its progress count.
  const bonusDaysCount = !isFoundations
    ? (frontierStatus?.completedDays ?? 0)
    : completedDaysCount;
  const timerBonus = useMemo(
    () => bonusDaysCount < 7 ? 0 : bonusDaysCount < 14 ? 1 : 2,
    [bonusDaysCount]
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
    if (!trackStateReady) return;
    if (!isDayAccessible) {
      const title = isDailyPrayerSession
        ? 'Finish the 30-day journey first'
        : isSameDayAheadAccess
          ? 'You’ve prayed today. 🙏'
          : 'Not yet — one day at a time';
      const message = isDailyPrayerSession
        // Kai-approved verbiage ("one prayer each day, chosen for
        // you"), worded for the tree's expanded pool (lib/
        // dailyPrayer.ts): a revisit from a started journey, never
        // fresh, never an unstarted track's day. NOT Foundations-only
        // wording — see the conflict note in the final report.
        ? 'Daily Prayer opens when you finish the 30-day journey — one prayer each day, chosen for you, a revisit of a day from a journey you have started. It is free for everyone who completes it.'
        : isSameDayAheadAccess
          ? `Day ${activeDay} unlocks tomorrow. Rest in what you’ve already received today.`
          : `Day ${activeDay} unlocks after you finish your current day. Today's prayer is waiting for you first.`;
      // Daily Prayer Mode is no longer a paid gate (F39), so this alert no
      // longer routes to the paywall — it simply sends non-graduates back.
      Alert.alert(title, message, [
        {
          text: 'Got it',
          style: 'cancel',
          onPress: () => router.back(),
        },
      ]);
      return;
    }

    // Audit round 3, J-S2: the pacing screen must not start a session for
    // an already-completed day (it used to, leaving a stale record behind).
    if (!isSleepMode && !isDailyPrayerSession && !isReplay && !isPacingLocked && activeDay === todayDay && !state.activeSession) {
      startSession(activeDay, activeTrackId);
    }
  }, [activeDay, isDailyPrayerSession, isSleepMode, isDayAccessible, isReplay, isSameDayAheadAccess, isPacingLocked, router, startSession, state.activeSession, state.currentDay, trackStateReady, todayDay, activeTrackId]);

  // A stored session belongs to one track: if the user switched tracks
  // since, drop it instead of letting it resume into — or block — the
  // new track's session. Within-day progress is lost; completed days are
  // not (they live in progress/frontier, not in the active session).
  // Audit round 3, J-S8 + J-S15: also drop legacy no-trackId sessions on
  // non-Foundations screens, and drop any session whose day is no longer
  // today — a kill during completion used to leave a stale record that
  // blocked the next day's start effect (guarded by !state.activeSession)
  // and let Home's RESUME badge advertise the wrong day's phase.
  useEffect(() => {
    if (!trackStateReady) return;
    if (isSleepMode || isDailyPrayerSession) return;
    const s = state.activeSession;
    if (!s) return;
    if (s.trackId && s.trackId !== activeTrackId) {
      clearActiveSession();
    } else if (!s.trackId && !isFoundations) {
      clearActiveSession();
    } else if (s.day !== todayDay) {
      clearActiveSession();
    }
  }, [trackStateReady, isSleepMode, isDailyPrayerSession, state.activeSession, activeTrackId, clearActiveSession, isFoundations, todayDay]);

  // Restore an interrupted session to the movement where they left off.
  // Sleep mode always opens on Selah — nothing to restore. A layout effect,
  // and gated on the track state: the correction must land before the
  // pager paints, and against the resolved track's movements — not the
  // Foundations set that exists on the first render.
  useLayoutEffect(() => {
    if (!trackStateReady) return;
    // Round-2 M4: a ?phase= tap must survive the async track
    // resolution — the restore below would otherwise jump the pager
    // back to the saved resume point. Jump to the tapped movement
    // (fresh entry, no restored timer) and mark restored so later page
    // turns persist from here. Honored once (see phaseJumpDoneRef).
    if (phaseParam && !phaseJumpDoneRef.current) {
      const idx = movements.findIndex(m => m.id === phaseParam);
      if (idx >= 0 && movements[idx].kind !== 'closing') {
        phaseJumpDoneRef.current = true;
        setPageIndex(idx);
        hasRestoredSessionRef.current = true;
        return;
      }
    }
    // Audit round 3, J-B7: Daily Prayer must never restore a journey
    // session — the old effect jumped the Daily Prayer pager to the
    // journey's saved movement and let it overwrite the journey's resume
    // point. Legacy sessions resume on Foundations screens only (J-S8).
    if (!isSleepMode && !isDailyPrayerSession && !isReplay && state.activeSession && state.activeSession.day === activeDay
      && ((!state.activeSession.trackId && isFoundations) || state.activeSession.trackId === activeTrackId)) {
      if (state.activeSession.phase) {
        const idx = movements.findIndex(m => m.id === state.activeSession!.phase);
        // Never restore directly onto the closing screen: arriving there
        // outside a page change means completion never ran, and the recap
        // animations stay at their invisible initial values — a frozen
        // "Prayer Complete" screen. Always re-enter at the first movement.
        if (idx >= 0 && movements[idx].kind !== 'closing') setPageIndex(idx);
      }
      if (state.activeSession.secondsElapsed > 0) {
        // Audit round 3, J-S6: a finished timer persisted secondsElapsed
        // === timerTotal, which re-seeded timerSeconds to 0 — a DONE button
        // with no reset path short of completing the day. Re-enter with a
        // fresh timer instead.
        setTimerSeconds(
          state.activeSession.secondsElapsed >= timerTotal
            ? timerTotal
            : Math.max(0, timerTotal - state.activeSession.secondsElapsed)
        );
      }
    }
    hasRestoredSessionRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, isReplay, isDailyPrayerSession, state.activeSession, timerTotal, trackStateReady, activeTrackId, isFoundations]);

  // Persist the session position as the user moves through the movements.
  // Audit round 3, J-B7: Daily Prayer is excluded — its page turns used to
  // overwrite the journey day's resume point with Daily Prayer silence
  // totals whenever the day numbers coincided. Legacy sessions persist on
  // Foundations screens only (J-S8).
  useEffect(() => {
    if (isSleepMode || isDailyPrayerSession) {
      return;
    }
    if (!hasRestoredSessionRef.current) {
      return;
    }
    if (!isReplay && activeDay === todayDay && state.activeSession
      && ((!state.activeSession.trackId && isFoundations) || state.activeSession.trackId === activeTrackId)) {
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
  }, [activeDay, isReplay, isSleepMode, isDailyPrayerSession, isFoundations, openPhase, state.activeSession, state.currentDay, timerSeconds, timerTotal, updateActiveSession, todayDay, activeTrackId]);

  const completeScaleAnim = useState(() => new Animated.Value(0.8))[0]
  const timerPulseAnim = useState(() => new Animated.Value(1))[0]
  const recapFadeAnim = useState(() => new Animated.Value(0))[0]
  const explainerSheetAnim = useState(() => new Animated.Value(420))[0]
  const explainerBackdropAnim = useState(() => new Animated.Value(0))[0]

  const hasRestoredSessionRef = useRef<boolean>(false);
  const soundRef = useRef<AudioPlayer | null>(null);
  const audioStartedRef = useRef(false);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ttsSoundRef = useRef<AudioPlayer | null>(null);
  // Baked Night Selah loop player (Helio @75) — separate from the
  // soundscape (soundRef) so the two can duck/fade independently.
  const selahLoopRef = useRef<AudioPlayer | null>(null);

  // ── Sleep-mode audio ──
  // Timestamp-based sleep timer for the Selah soundscape: stores the expiry
  // epoch, so it stays correct while the app is backgrounded (the audio
  // background mode keeps the JS timer alive while the sound plays).
  const [sleepTimerExpiresAt, setSleepTimerExpiresAt] = useState<number | null>(null);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemainingMs, setSleepTimerRemainingMs] = useState<number | null>(null);
  const sleepTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Immersive spoken narration over the soundbed — Partner feature.
  const [narrationOn, setNarrationOn] = useState(false);
  const [narrationLockVisible, setNarrationLockVisible] = useState(false);
  // Kai-approved 2026-10-26: session Declare SPEAK lock sheet (same
  // featureName/requirement as the declarations reader SPEAK).
  const [speakLockVisible, setSpeakLockVisible] = useState(false);
  const narrationActiveRef = useRef(false);
  const SELAH_TARGET_VOLUME = 0.3;
  const SLEEP_FADE_MS = 30000;

  // Live soundbed volume — adjustable from the menu sheet, applied immediately.
  const [selahVolume, setSelahVolume] = useState(SELAH_TARGET_VOLUME);
  const selahVolumeRef = useRef(selahVolume);
  useEffect(() => {
    selahVolumeRef.current = selahVolume;
  }, [selahVolume]);
  const handleVolumeChange = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    selahVolumeRef.current = clamped;
    setSelahVolume(clamped);
    if (soundRef.current && audioStartedRef.current) {
      soundRef.current.volume = clamped;
    }
    // Kai-approved 2026-10-26: the Selah loop follows the soundscape
    // volume too, so the voice is not loud at night when the bed is
    // quiet. (A running sleep-timer fade re-applies its own curve
    // within a second; the tick below owns the fade.)
    if (selahLoopRef.current) {
      try { selahLoopRef.current.volume = clamped; } catch {}
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
    // Audit round 11, M19: cancelling mid-fade used to strand the loop
    // (and the bed) at the last faded level, because the fade effect
    // only restores volume while a timer is set. Restore both here.
    // Kai-approved 2026-10-26: the loop's normal level is the user's
    // soundscape level (it used to sit at full volume 1, louder than
    // the bed at night). Guarded: a released player ignores this.
    try { if (selahLoopRef.current) selahLoopRef.current.volume = selahVolumeRef.current; } catch {}
    try { if (soundRef.current) soundRef.current.volume = selahVolumeRef.current; } catch {}
  }, [clearSleepTimerInterval]);

  const stopSelahLoop = useCallback(() => {
    try {
      selahLoopRef.current?.pause();
      selahLoopRef.current?.release();
    } catch {}
    selahLoopRef.current = null;
  }, []);

  // Audit round 11, M16: the session has three spoken-audio players —
  // the Google voiceover player (ttsSoundRef), the baked Selah loop
  // (selahLoopRef), and the shared one-shot player / device voice
  // (stopSpokenAudio) — and voiceover / SPEAK previously stopped only
  // their own, so two voices could layer. This one helper stops all
  // three spoken players. It deliberately does NOT touch the soundscape
  // bed (soundRef): the bed is ambient, not spoken, and its duck/fade
  // effects own its volume. Focus/unmount cleanups already stop all
  // three individually and are left as-is.
  const stopAllSpokenAudio = useCallback(() => {
    try {
      if (ttsSoundRef.current) {
        ttsSoundRef.current.release();
        ttsSoundRef.current = null;
      }
    } catch {}
    stopSelahLoop();
    stopSpokenAudio();
  }, [stopSelahLoop]);

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
      try {
        if (!soundRef.current.playing) soundRef.current.play();
      } catch {}
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
              soundRef.current.volume = 0;
              if (soundRef.current.playing) soundRef.current.pause();
            }
          } catch {}
          // The narration loop ends with the timer too — nothing plays
          // on after the prayer (see the design note below).
          stopSelahLoop();
          stopSpokenAudio();
          // Audit round 11, M20: expiry previously left narrationOn
          // true and narrationActiveRef permissive, so a device-voice
          // fallback loop whose Speech.stop() fires onDone could resume
          // speaking after the timer. Clearing both flags here makes
          // the loop effect's onDone guard refuse any post-timer line.
          // (The baked loop is safe regardless — its player is released
          // above and nothing re-creates it.)
          narrationActiveRef.current = false;
          setNarrationOn(false);
        })();
        return;
      }
      setSleepTimerRemainingMs(remaining);
      if (remaining < SLEEP_FADE_MS && soundRef.current) {
        // Gentle fade-out over the final 30 seconds — never a hard cut.
        const fadeVolume = Math.max((remaining / SLEEP_FADE_MS) * selahVolumeRef.current, 0);
        try { soundRef.current.volume = fadeVolume; } catch {}
      }
      if (remaining < SLEEP_FADE_MS && selahLoopRef.current) {
        // Kai-approved 2026-10-26: the baked narration loop fades on
        // the same curve as the bed, scaled by the soundscape volume
        // (it used to fade from full volume 1, louder than the bed).
        const fadeVolume = Math.max((remaining / SLEEP_FADE_MS) * selahVolumeRef.current, 0);
        try { selahLoopRef.current.volume = fadeVolume; } catch {}
      } else if (selahLoopRef.current) {
        // Outside the fade window the loop sits at the soundscape
        // volume (also restores it if a previous timer was cancelled
        // mid-fade).
        try { selahLoopRef.current.volume = selahVolumeRef.current; } catch {}
      }
    };
    tick();
    sleepTimerIntervalRef.current = setInterval(tick, 1000);
    return () => clearSleepTimerInterval();
  }, [sleepTimerExpiresAt, clearSleepTimerInterval, stopSelahLoop]);

  // The sleep session belongs to the Selah movement — leaving it (or finishing)
  // ends the timer and narration together; nothing plays on after the prayer.
  // Lesson-mode narration is NOT scoped this way: it is a per-movement
  // toggle (menu row, below) that must survive page turns, or the
  // per-movement narration effect could never fire past the first page —
  // the old unconditional setNarrationOn(false) here killed it on every
  // non-Selah page, which is part of why the baked narration units were
  // unreachable in lessons. The timer still ends on leaving Selah in
  // every mode; only the narration auto-off is sleep-only, plus the
  // completion moment in lessons (a finished session goes quiet).
  useEffect(() => {
    if (openPhase !== 'selah' || isComplete) {
      stopSleepTimer();
      if (isSleepMode || isComplete) {
        setNarrationOn(false);
      }
    }
  }, [openPhase, isComplete, stopSleepTimer, isSleepMode]);

  const formatSleepRemaining = useCallback((ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, []);

  // Spoken forms (verbiage finding 5.2): a few fields keep fill-in blanks
  // on screen but are spoken in a proposed form. The bake pipeline
  // (tools/narration/extract.mjs SPOKEN_OVERRIDES) applies the same map,
  // so composing spoken text through this helper is what lets the baked
  // hash resolve. Display text is never affected.
  const spokenBodyFor = useCallback(
    (m: Movement): string | null => {
      if (activeTrackId === 'foundations' && activeDay === 4 && m.id === 'thank') {
        return '"Father God, I thank You." Now name three gifts out loud, one by one, and thank Him for each.';
      }
      return m.body;
    },
    [activeTrackId, activeDay],
  );

  // Narration lines for Selah sleep-loop: the day's truth, the word, and the
  // TRIAD movements — spoken slowly over the soundbed, loopable for sleep.
  // (Used by the device-voice fallback; the baked loop is a single file.)
  const narrationLines = useMemo(() => {
    const lines = [
      dayData.identity,
      dayData.verse,
      ...movements
        .filter(m => m.kind !== 'closing' && m.kind !== 'selah')
        .map((m) => spokenBodyFor(m)),
    ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0);
    return lines;
  }, [dayData, movements, spokenBodyFor]);

  // Selah sleep-loop narration — Night Selah only; the lesson's Selah stays
  // music + timer (spoken narration lives exclusively in Night Selah).
  // Primary path: the baked Helio loop for this day (one file, lines
  // already joined with pauses) played on repeat over the ducked bed.
  // Fallback: the original per-line device-voice loop, unchanged.
  useEffect(() => {
    const active = isSleepMode && narrationOn && openPhase === 'selah' && narrationLines.length > 0;
    narrationActiveRef.current = active;
    if (!active) {
      stopSelahLoop();
      if (openPhase === 'selah') stopSpokenAudio();
      return;
    }

    const duck = async (down: boolean) => {
      try {
        if (soundRef.current && audioStartedRef.current && !ambientMutedRef.current) {
          soundRef.current.volume = down ? 0.08 : selahVolumeRef.current;
        }
      } catch {}
    };

    // Baked loop: the bed stays ducked while the loop plays; the player
    // loops the file itself (the file's tail pause is the loop gap).
    // Defined before the baked branch so a loop failure can fall through
    // to it instead of leaving a silent, ducked sleep screen.
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
      void speakText(line, {
        rate: state.playbackRate ?? 1,
        speechRate: deviceFallbackSpeechRate(state.playbackRate),
        onDone: () => {
          if (cancelled || !narrationActiveRef.current) return;
          void duck(false).then(() => {
            setTimeout(() => { void speakLoop(index + 1); }, 1200);
          });
        },
        // Audit fix F8: a TTS error used to stall the Night Selah loop
        // forever (unduck, then silence — the bed stayed down and no
        // line ever followed). Advance exactly like onDone does, so a
        // single failed line can never wedge the night's loop.
        onError: () => {
          if (cancelled || !narrationActiveRef.current) return;
          void duck(false).then(() => {
            setTimeout(() => { void speakLoop(index + 1); }, 1200);
          });
        },
      });
    };

    const loopUrl = getSelahLoopUrl(activeTrackId, activeDay);
    if (loopUrl) {
      void duck(true);
      let loopSub: { remove: () => void } | null = null;
      try {
        const player = createAudioPlayer({ uri: loopUrl });
        player.loop = true;
        // Audit round 11, H8 (mechanical safe choice): the baked Night
        // Selah loop is rendered at speed 75 and its player gets NO
        // setPlaybackRate — the slider does not change loop speed, and
        // changing the slider must not restart the loop. Only the
        // restart-on-slider-change is removed.
        // Kai-approved 2026-10-26: the loop starts at the soundscape
        // volume, not full volume, so it never out-shouts the bed.
        try { player.volume = selahVolumeRef.current; } catch {}
        selahLoopRef.current = player;
        // A failed loop URL never throws here — without this listener the
        // bed would stay ducked at 0.08 and the user would get a silent
        // sleep screen. On a playback error, fall back to device voice.
        loopSub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.error) {
            loopSub?.remove();
            loopSub = null;
            stopSelahLoop();
            void duck(false);
            void speakLoop(0);
          }
        });
        player.play();
      } catch {
        loopSub?.remove();
        stopSelahLoop();
        void duck(false);
        void speakLoop(0);
        return () => {
          cancelled = true;
          narrationActiveRef.current = false;
          stopSpokenAudio();
          void duck(false);
        };
      }
      return () => {
        narrationActiveRef.current = false;
        loopSub?.remove();
        stopSelahLoop();
        void duck(false);
      };
    }

    void speakLoop(0);

    return () => {
      cancelled = true;
      narrationActiveRef.current = false;
      stopSpokenAudio();
      void duck(false);
    };
  // Audit round 11, H8: state.playbackRate is deliberately NOT a dep.
  // The baked loop plays at its fixed baked speed (75) and the fallback
  // loop reads the rate per line from the closure; re-running this
  // effect on a slider change used to tear down and restart the loop
  // mid-night. Night Selah loop speed is fixed at 75.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationOn, openPhase, narrationLines, isSleepMode, activeTrackId, activeDay, stopSelahLoop]);

  // Audio-led movement narration: with narration on, each screen speaks its
  // own text as you arrive — the words on screen and the voice stay in sync.
  const currentMovement = movements[Math.min(pageIndex, movements.length - 1)];
  const pageNarrationText = useMemo(() => {
    if (!currentMovement) return null;
    if (currentMovement.kind === 'selah' || currentMovement.kind === 'closing') return null;
    const body = spokenBodyFor(currentMovement);
    if (body) return `${currentMovement.kicker}. ${body}`;
    return null;
  }, [currentMovement, spokenBodyFor]);

  useEffect(() => {
    if (!narrationOn || isComplete) return;
    if (openPhase === 'selah') return; // the sleep-loop effect owns Selah
    if (!pageNarrationText) return;

    const duck = async (down: boolean) => {
      try {
        if (soundRef.current && audioStartedRef.current && !ambientMutedRef.current) {
          soundRef.current.volume = down ? 0.08 : selahVolumeRef.current;
        }
      } catch {}
    };

    let cancelled = false;
    void duck(true);
    // Baked Helio narration for this movement when it exists (the text
    // composition matches the bake exactly); device voice otherwise.
    void speakText(pageNarrationText, {
      rate: state.playbackRate ?? 1,
      speechRate: deviceFallbackSpeechRate(state.playbackRate),
      onDone: () => {
        if (!cancelled) void duck(false);
      },
      onError: () => {
        void duck(false);
      },
    });
    return () => {
      cancelled = true;
      stopSpokenAudio();
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
  // Latest-ref mirror: audio callbacks read this outside render. The
  // immutability rule's suggested alternative (re-creating the ref) does
  // not apply to a value that changes over the session's lifetime.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    ambientMutedRef.current = state.ambientMuted;
  }, [state.ambientMuted]);

  // Belt-and-braces against audio leaking past the session: if the screen
  // loses focus (deep link away, back navigation mid-teardown), stop the
  // soundscape immediately. The unmount cleanup is the primary guard.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
      return () => {
        if (soundRef.current) {
          try { soundRef.current.pause(); } catch {}
        }
        if (ttsSoundRef.current) {
          ttsSoundRef.current.release();
          ttsSoundRef.current = null;
        }
        stopSelahLoop();
        stopSpokenAudio();
        // Audit round 3, S2: the silence-timer interval was never cleared
        // on blur/unmount — it kept firing setState on an unmounted screen
        // until it counted to 0. Clear it and mark the timer stopped, so a
        // later tap resumes cleanly from the preserved seconds value.
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setTimerRunning(false);
      };
    }, [stopSelahLoop])
  );

  // Audit round 3, J-S1: backgrounding used to leave the Selah timer and
  // the phase clock running against wall-clock time — the timer froze or
  // kept ticking unpredictably, and backgrounded minutes were credited to
  // Insights and first-step auto-marks. On background/inactive (never in
  // sleep mode, whose background audio is intentional), pause the timer
  // and re-anchor the phase clock on return, so backgrounded time is never
  // credited. A phone call surfaces as inactive, so it is covered too.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        phaseStartRef.current = Date.now();
        return;
      }
      if (isSleepMode) return;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimerRunning(false);
    });
    return () => subscription.remove();
  }, [isSleepMode]);

  // Load the soundscape on mount but do NOT start it — music plays only
  // during the Selah movement (see the movement effect below).
  useEffect(() => {
    if (!localAudioUrl) return;
    let mounted = true;
    const loadAudio = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          // Sleep-mode audio: the soundscape (and narration) keep playing with
          // the screen locked. The sleep timer is timestamp-based, so it still
          // fires — and fades — while backgrounded.
          shouldPlayInBackground: true,
          interruptionModeAndroid: 'duckOthers',
        });
        const player = createAudioPlayer({ uri: localAudioUrl });
        if (!mounted) { player.release(); return; }
        soundRef.current = player;
        player.loop = true;
        player.volume = 0;
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
      if (soundRef.current) { try { soundRef.current.release(); } catch {} soundRef.current = null; }
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
          if (!soundRef.current.playing) soundRef.current.play();
          const TARGET = selahVolumeRef.current;
          const STEPS = 12;
          let s = 0;
          fadeInIntervalRef.current = setInterval(() => {
            s++;
            try { if (soundRef.current) soundRef.current.volume = Math.min((s / STEPS) * TARGET, TARGET); } catch {}
            if (s >= STEPS && fadeInIntervalRef.current) {
              clearInterval(fadeInIntervalRef.current);
              fadeInIntervalRef.current = null;
            }
          }, 150);
        } else {
          soundRef.current.volume = 0;
          if (soundRef.current.playing) soundRef.current.pause();
        }
      } catch {}
    };
    void fadeToSelah();
  }, [openPhase, isComplete, state.ambientMuted, localAudioUrl, focusTick]);

  useEffect(() => {
    if (isComplete && soundRef.current) {
      // A new session starting mid-fade must not have its player muted by
      // this stale loop: the cleanup flag stops the writes and the pause.
      let cancelled = false;
      const fadeOut = async () => {
        try {
          for (let v = selahVolumeRef.current; v >= 0; v -= 0.05) {
            if (cancelled) return;
            if (soundRef.current) soundRef.current.volume = Math.max(v, 0);
            await new Promise(r => setTimeout(r, 80));
          }
          if (!cancelled) soundRef.current?.pause();
        } catch {}
      };
      void fadeOut();
      return () => {
        cancelled = true;
      };
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
    texts: (string | null | undefined)[],
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
  const windowHeight = Dimensions.get('window').height;
  // Wave 2, fix 2 (feedback #26, #29–#34): pages used to be window-height
  // tall while the pager viewport is shorter (SafeArea insets + chrome
  // bar above it) — the old code itself admitted a 79pt overflow on
  // iPhone 17 Pro. That one mismatch cut content top and bottom, let
  // the previous page peek into view, and de-centred every page, since
  // paging snapped to window-height multiples. Pages are now sized to
  // the pager's MEASURED viewport height (its onLayout height, flex:1
  // below the chrome bar), so snap points, page height, and the visual
  // centre all agree with what is actually on screen. Before the first
  // layout pass the window height is the one-frame fallback; the
  // lock-back effect below re-seats the pager once measured. The
  // CONTINUE dock needs no offset anymore: page bottom IS viewport
  // bottom, so its static bottom:26 is the viewport bottom.
  const [pagerHeight, setPagerHeight] = useState<number | null>(null);
  const pageHeight = resolvePageHeight(pagerHeight, windowHeight);
  // Tracks scrolls started by goToPage (dots, continue button) so a fling
  // landing far from the current movement can be distinguished from them.
  const programmaticScrollRef = useRef(false);

  const goToPage = useCallback((index: number, animated = true) => {
    const clamped = Math.max(0, Math.min(movements.length - 1, index));
    programmaticScrollRef.current = true;
    pagerRef.current?.scrollTo({ y: clamped * pageHeight, animated });
  }, [movements.length, pageHeight]);

  // Keep the pager's resting position locked to the saved movement: a fast
  // fling (especially on web, where nested scroll momentum chains) can
  // overshoot several pages at once and land on the closing screen.
  useEffect(() => {
    if (isSleepMode) return;
    const timer = setTimeout(() => {
      const clamped = Math.min(pageIndex, movements.length - 1);
      if (clamped >= 0) {
        pagerRef.current?.scrollTo({ y: clamped * pageHeight, animated: false });
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pageHeight]);

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
    // Audit round 3, J-S6: after a finished run the button reads DONE with
    // no reset path. Tapping DONE now resets to a fresh timer instead of
    // sitting at 0 until the day completes.
    if (timerSeconds === 0 && !timerRunning) {
      setTimerSeconds(timerTotal);
      return;
    }
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
  }, [timerRunning, timerSeconds, timerTotal]);

  // Record time spent in a movement when leaving it — the Insights TRIAD
  // balance and heatmap run on exactly these numbers.
  // Audit round 12, H3: page-turns used to feed phaseTimings even for
  // Daily Prayer sessions and Library replays, polluting Insights and
  // firing silence/thanked-when-hard auto-marks for sessions that are
  // not the journey. Gate here, matching the handleComplete gate:
  // only a real (non-replay) journey session records movement time.
  const recordMovementTime = useCallback((movementId: string, startedAt: number) => {
    if (isDailyPrayerSession || isAnyReplay) return;
    if (!['thank', 'repent', 'invite', 'ask', 'declare'].includes(movementId)) return;
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed > 0) updatePhaseTimings(movementId, elapsed);
  }, [updatePhaseTimings, isDailyPrayerSession, isAnyReplay]);

  // Audit round 11, M15: generation counter for voiceover fetches.
  // Rapid page turns used to fire overlapping getGoogleTTSAudio calls
  // that both resolved and both played. Only the latest generation may
  // play; a stale resolution returns without touching the player.
  const voiceoverGenerationRef = useRef(0);

  // Per-movement Google TTS voiceover (Settings toggle) — spoken as the
  // movement arrives.
  const speakMovementVoiceover = useCallback((movement: Movement) => {
    // Immersive narration owns the voice when it's on — never let both speak.
    if (!state.voiceoverEnabled || narrationOn) return;
    const generation = ++voiceoverGenerationRef.current;
    let textToRead = '';
    if (movement.kind === 'settle') textToRead = "Let's Pray. " + dayData.focus;
    else if (movement.kind === 'selah') textToRead = 'Selah. ' + dayData.silenceTxt;
    else {
      const body = spokenBodyFor(movement);
      if (body) textToRead = `${movement.kicker}. ${movement.sub}. ${body}`;
    }

    if (!textToRead) return;
    void (async () => {
      try {
        // M16: stop every spoken player first (voiceover, Selah loop,
        // one-shot/device voice) — the old path released only the
        // voiceover player, so SPEAK or narration could layer over it.
        stopAllSpokenAudio();
        // H1: the cache key MUST include the track (see voiceoverCacheKey
        // in services/tts.ts) — the old `${day}-${movement}` key returned
        // Foundations audio for the same Freedom day/movement.
        const cacheKey = voiceoverCacheKey(activeTrackId, activeDay, movement.id);
        const audioUrl = await getGoogleTTSAudio(textToRead, cacheKey);
        // M15: a newer page turn superseded this fetch while it was in
        // flight — drop the stale result instead of playing over the
        // current movement's voiceover.
        if (generation !== voiceoverGenerationRef.current) return;
        if (!audioUrl) {
          // Audit round 3, J-S7: the old path left a voiceover-dependent
          // user in silence on any TTS failure (offline, timeout, edge
          // error) — only a __DEV__ log. Fall back to device voice, the
          // same fallback immersive narration already uses.
          void speakText(textToRead, {
            rate: state.playbackRate ?? 1,
            speechRate: deviceFallbackSpeechRate(state.playbackRate),
          });
        }
        if (audioUrl) {
          // M15, release-before-play: whatever is current at resolve
          // time (e.g. a voice started by another path during the
          // fetch) is released immediately before this player starts,
          // so two players can never overlap on resolve.
          // M16 ducking exception, documented not changed: unlike
          // narration paths, the lesson voiceover does NOT duck the
          // Selah bed — the bed keeps playing at full user volume
          // under the voiceover. Changing ducking here would need a
          // finish listener + restore path; the exception is recorded
          // rather than silently altered.
          try {
            if (ttsSoundRef.current) {
              ttsSoundRef.current.release();
              ttsSoundRef.current = null;
            }
          } catch {}
          const rate = Math.max(0.5, Math.min(2, state.playbackRate ?? 1));
          const newSound = createAudioPlayer({ uri: audioUrl });
          try { newSound.setPlaybackRate(rate, 'high'); } catch {}
          newSound.play();
          ttsSoundRef.current = newSound;
        }
      } catch (e) {
        if (__DEV__) console.log('[Session] TTS Error:', e);
      }
    })();
  }, [activeDay, activeTrackId, dayData, state.voiceoverEnabled, state.playbackRate, narrationOn, spokenBodyFor, stopAllSpokenAudio]);

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
      // existing streak/progress logic fires here. Completion runs
      // inside the pager's scroll-end event: contain it, so a failure in
      // any completion side-effect (day recording, streak, scheduling) can
      // never surface as an uncaught error and take down the final
      // screen — the completion UI still lands and the failure is
      // reported instead. handleComplete is async (track writes await);
      // rejections are caught here, never unhandled.
      // Audit round 3, J-S4: a dot-tap straight to Closing used to
      // complete the day (and bank streak credit) in seconds. Completion
      // now requires every non-closing movement visited; otherwise the
      // user still sees the Closing page but nothing is recorded — they
      // go back, pray through, and return to complete.
      // Wave 2, fix 4: that unvisited arrival no longer renders the
      // "Prayer Complete" page. It sets closingIncomplete, and
      // renderClosingBody shows an explicit not-complete variant with
      // a way back instead — a skipped arrival can never look like a
      // completion, and nothing is recorded for it.
      if (nextMovement.kind === 'closing') {
        const allVisited = allNonClosingMovementsVisited(movements, visitedPhases);
        if (allVisited) {
          setClosingIncomplete(false);
          // Wave 2, fix 5: the runner owns the completingRef guard, so
          // a failed save (which resets the ref, see handleComplete)
          // is retryable by re-arriving at Closing — previously the
          // ref was set once and never reset, so re-arrival could not
          // retry without leaving and re-entering the session.
          attemptCompletionRef.current();
        } else {
          setClosingIncomplete(true);
        }
      } else {
        setClosingIncomplete(false);
      }
    }
  }, [pageIndex, movements, recordMovementTime, speakMovementVoiceover, isSleepMode, visitedPhases]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (ttsSoundRef.current) {
        ttsSoundRef.current.release();
        ttsSoundRef.current = null;
      }
    };
  }, []);

  const handleComplete = useCallback(async () => {
    if (!isDailyPrayerSession) recordMovementTime(openPhase, phaseStartRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerRunning(false);

    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    setCompletedDay(activeDay);

    // Audit round 3, J-S21: a completed session un-neglects every phase —
    // the one-off "linger in this phase" nudge must not fire after the user
    // just prayed. (The daily rescheduler only preserves existing neglected
    // reminders; it never creates them.)
    void cancelNeglectedPhaseReminders();

    if (isDailyPrayerSession) {
      // Daily Prayer expansion: completion records the selection's
      // (track, day) in the dailyPrayerLog ONLY — it never advances
      // the selection track's frontier or Foundations progress.
      completeDailyPrayer(activeDay, duration, activeTrackId);
    } else if (!isAnyReplay) {
      if (isFoundations) {
        completeDay(activeDay, duration);
      } else {
        // Per-track progress: advance to the next day and record the
        // completion prayer day — pacing unlocks the next day tomorrow.
        // Audit round 3, J-S2: the old fire-and-forget writes could land
        // split across a kill (frontier advanced without a record, or a
        // record without a frontier), breaking pacing either way. Await
        // both, in order, and only then clear the session; on failure,
        // report and do NOT show the completion UI for an unrecorded day.
        try {
          await setTrackDay(activeTrackId, Math.min(trackDayCount, activeDay + 1));
          await recordTrackCompletion(activeTrackId, activeDay);
        } catch (err) {
          reportError('SessionCompleteTrack', err);
          // Wave 2, fix 5: reset the guard so the save is retryable
          // in-session (re-arrive at Closing, or TRY AGAIN below) —
          // previously completingRef stayed true forever, so the only
          // recovery was leaving and re-entering the session.
          completingRef.current = false;
          setCompletionSaveFailed(true);
          Alert.alert(
            'Couldn’t save track progress',
            // [NEW] copy — needs Kai's review before shipping. The old
            // line sent the user out of the session to retry; the
            // closing page now offers TRY AGAIN in place.
            'Your completion wasn’t recorded yet. Tap Try again below to retry — you don’t need to leave this prayer.',
          );
          return;
        }
        // Audit must-fix #6: the Foundations branch clears the active
        // session on completion; the track branch never did, so the next
        // day's start effect (guarded by !state.activeSession) never fired
        // and the persist effect overwrote yesterday's record onto the new
        // day. Clear it here, exactly like Foundations does.
        clearActiveSession();
        // Audit fix F5: the track branch never rescheduled the daily
        // reminder (completeDay does it for Foundations), so tomorrow's
        // reminder kept pointing at the day just prayed. Reschedule
        // from the NEW frontier — reminder taps carry no day, so this
        // is copy/day-tracking only.
        rescheduleDailyReminder(Math.min(trackDayCount, activeDay + 1));
      }
    } else if (isJumpAhead) {
      // Partner Library jump-ahead completion: record ONLY this day.
      // Foundations: completeDay's resolver leaves the frontier (and
      // journeyComplete) untouched for a jumped day. Tracks: the
      // completed-days set only — setTrackDay / recordTrackCompletion
      // are deliberately NOT called, or the frontier would leap past
      // uncompleted days and pacing for the real frontier day would
      // break. The session still counts as prayed (streak / greeting
      // via completeDay; the gate's jumped-only exemption keeps the
      // frontier day open afterwards).
      if (isFoundations) {
        completeDay(activeDay, duration);
      } else {
        try {
          await recordTrackCompletedDay(activeTrackId, activeDay);
        } catch (err) {
          reportError('SessionCompleteTrackJumped', err);
          // Wave 2, fix 5: same guard reset as the frontier branch —
          // a failed jumped-day save is retryable in-session too.
          completingRef.current = false;
          setCompletionSaveFailed(true);
          Alert.alert(
            'Couldn’t save track progress',
            // [NEW] copy — needs Kai's review before shipping (see above).
            'Your completion wasn’t recorded yet. Tap Try again below to retry — you don’t need to leave this prayer.',
          );
          return;
        }
        // Audit fix F4: a jumped completion writes no frontier or
        // last-completion record, so the provider's refresh can never
        // see it — without this note the jumped day missed the streak
        // and hasCompletedSessionToday entirely. The frontier is
        // deliberately NOT rescheduled here: a jumped day does not
        // move the frontier, so tomorrow's reminder still points at it.
        recordTrackPrayerToday();
        clearActiveSession();
      }
    }

    setCompletionSaveFailed(false);
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
  }, [openPhase, recordMovementTime, sessionStartTime, activeDay, isDailyPrayerSession, isAnyReplay, isJumpAhead, completeDailyPrayer, completeDay, completeScaleAnim, recapFadeAnim, activeTrackId, trackDayCount, isFoundations, clearActiveSession, cancelNeglectedPhaseReminders, recordTrackPrayerToday, rescheduleDailyReminder]);

  // handleComplete is fired from handlePageChange before its own definition
  // order settles — keep a stable ref.
  const handleCompleteRef = useRef(handleComplete);
  // Latest-ref mirror: handlePageChange fires this before definition order
  // settles (see the comment above the ref). Same rule note as above.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    handleCompleteRef.current = handleComplete;
    // Wave 2, fix 5: the guarded runner behind attemptCompletionRef.
    // The guard is set here and reset on every failure path (the two
    // track branches above, plus the catch below for anything
    // handleComplete itself throws), so a failed save never wedges
    // the session: re-arriving at Closing or tapping TRY AGAIN retries.
    // A success deliberately leaves the guard set — completion must
    // fire exactly once per session.
    attemptCompletionRef.current = () => {
      if (completingRef.current) return;
      completingRef.current = true;
      setCompletionSaveFailed(false);
      void (async () => {
        try {
          await handleCompleteRef.current();
        } catch (err) {
          completingRef.current = false;
          setCompletionSaveFailed(true);
          reportError('SessionComplete', err);
        }
      })();
    };
  }, [handleComplete]);

  const handleClose = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  // "..." menu — a bottom sheet: soundbed, live volume, share.
  const [menuVisible, setMenuVisible] = useState(false);
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
    const shareText = `Day ${shareDay}: ${dayData.title}\n\nTHE TRUTH\n"${dayData.identity}"\n\nTHE WORD\n${formatVerseForShare(dayData.verse)}\n\nTHE DECLARATION\n${getDeclarationText(dayData)}\n\n— Shared from TRIAD Prayer\nGet the app: ${TRIAD_APP_STORE_URL}`;

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
  // No dep array on purpose: handleShareTruth is a plain function recreated
  // each render, and the ref must always hold the latest one. A dep array
  // would either warn or go stale; this effect simply re-syncs every commit.
  useEffect(() => {
    handleShareTruthRef.current = handleShareTruth;
  });


  // ── Ask movement: private-by-default prayer composer ──
  const [askComposerVisible, setAskComposerVisible] = useState(false);
  const [askText, setAskText] = useState('');
  const [askShare, setAskShare] = useState(false);
  // Fix-everything G1: the session Ask share is a wall-write path
  // too, so it gets the same quiet guidelines link as the
  // community composer (shown only once sharing is toggled on).
  const [guidelinesVisible, setGuidelinesVisible] = useState(false);

  // Pre-launch audit PL-H3 (re-opened): the session Ask share was the
  // third wall-write path and the only one without the 13+ gate — the
  // community composer and the journal testimony share both gate, this
  // one checked only non-anonymous. It now goes through the same
  // pending-write + modal-confirm + retry pattern those screens use
  // (requestWallAttestation / requestJournalAttestation). The check was
  // deliberately NOT put inside createCommunityEcho: the community
  // confirm retry calls createCommunityEcho while the attestation is
  // still unrecorded (recordAgeAttestation runs AFTER the write there),
  // so a hard check inside would make every modal-confirmed community
  // share fail — fixing that would mean reordering another screen's
  // confirm flow. The pending retry here is the share step only, never
  // re-enters the gate, so no bypass ref is needed (unlike community /
  // journal, whose retries re-enter their gated handlers).
  const [showAskAgeGate, setShowAskAgeGate] = useState(false);
  const pendingAskShareRef = useRef<(() => Promise<void>) | null>(null);

  // Re-audit N1: decline leaves composer text + share toggle in place,
  // so a re-tap of SAVE would otherwise save the same private prayer a
  // second time. Remember the exact text already saved; a re-tap with
  // unchanged text skips the private save (the share step still runs).
  // The ref clears only when the composer fully resets (share success,
  // private-only save, anonymous branch) — never on keystroke, so an
  // edited prayer still saves as new text.
  const askPrivateSavedRef = useRef<string | null>(null);

  // Round-2 lane-A M1: in-flight SAVE guard (see handleAddPrayer).
  const askSavingRef = useRef<boolean>(false);

  const requestAskAttestation = async (retry: () => Promise<void>): Promise<boolean> => {
    try {
      if (await DatabaseService.getAgeAttested()) return true;
      // Anonymous guests: device-local attestation counts too (see the
      // community gate). Always false for signed-in users.
      if (await DatabaseService.getAnonymousAgeAttested()) return true;
    } catch {
      // Unknown (offline, no profile row yet): gate, don't assume.
    }
    pendingAskShareRef.current = retry;
    setShowAskAgeGate(true);
    return false;
  };

  // Round-3 A-M2: the modal-confirm path runs outside handleAddPrayer's
  // guard, so a SAVE re-tap during a confirmed share flight used to
  // re-run createCommunityEcho (server 1/day ledger turned the duplicate
  // into a spurious failure alert after a successful post). Hold the
  // same ref here: a SAVE re-tap during the flight early-returns at
  // handleAddPrayer's guard check, and double-Confirm is still safe
  // (pending ref is nulled synchronously above).
  const confirmAskAgeGate = async () => {
    setShowAskAgeGate(false);
    const share = pendingAskShareRef.current;
    pendingAskShareRef.current = null;
    if (!share || askSavingRef.current) return;
    askSavingRef.current = true;
    try {
      // Audit round 8, H22 (session part): the attestation is recorded
      // BEFORE the pending write, not after it. The old order made the
      // first modal-confirmed share fail against the server's
      // RESTRICTIVE INSERT policy (attestation still unrecorded) and
      // surface as a generic "Couldn't share", with only a retry
      // succeeding. A failed attestation write is still swallowed —
      // the server stays fail-closed and denies the write if the user
      // is genuinely unattested. No bypass ref is needed here: the
      // pending retry is the share step only and never re-enters the
      // gate (unlike the community/journal confirm flows).
      await DatabaseService.recordAgeAttestation().catch(() => {});
      await DatabaseService.recordAnonymousAgeAttestation().catch(() => {});
      await share();
      // Consume (never re-record) after the share: a minted
      // anonymous id gets stamped into the map; a seed-style
      // write that minted none drops the flag, so the next
      // write re-prompts instead of riding a standing pass.
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
    } finally {
      askSavingRef.current = false;
    }
  };

  const declineAskAgeGate = () => {
    setShowAskAgeGate(false);
    pendingAskShareRef.current = null;
    // Decline shares nothing: the pending share is dropped, so no post
    // is published. Defensive clear of any pending anonymous pass.
    void DatabaseService.clearAnonymousAgeAttestationPending().catch(() => {});
    Alert.alert(
      'The Prayer Wall is for ages 13 and up',
      'You can keep using TRIAD for your personal prayer journey. The community wall needs someone who is 13 or older.',
    );
  };

  const handleAddPrayer = async () => {
    const text = askText.trim();
    if (!text) return;

    // Round-2 lane-A M1: exactly-once share. The private-save ref above
    // guards only the private save; a second SAVE tap while the first
    // createCommunityEcho is in flight used to re-run the share step,
    // and the server 1/day ledger turned the duplicate into a spurious
    // "Couldn't share your prayer" alert after a successful post. Set
    // synchronously before the first await, cleared in finally.
    if (askSavingRef.current) return;
    askSavingRef.current = true;
    try {
    // Private record always saves first — sharing must never lose the prayer.
    // ... but exactly once per text: see askPrivateSavedRef above.
    if (askPrivateSavedRef.current !== text) {
      addPrayerRequest(text);
      askPrivateSavedRef.current = text;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // The share step alone, so the modal-confirmed retry re-runs only
    // the wall write — never a second private save. It also clears the
    // composer, so a gated tap leaves the text in place until the user
    // confirms or declines.
    const shareAskPrayer = async () => {
      try {
        const shared = await DatabaseService.createCommunityEcho(text, null);
        // Fix-everything (support lane G6): a null return is a
        // failure, not a success — without this the success path
        // below would clear the text with no alert at all.
        if (shared == null) throw new Error('Share returned no row');
        // Moderation tiers (migration 00019): a held post is a
        // success with hidden_at set — not a failure, and never a
        // retry. Self-harm and threat holds replace the generic
        // notice with the support card (rendered once from the
        // root layout via context); every other hold keeps the
        // generic notice. The post stays held either way.
        const supportVariant = supportCardVariantForHold(shared);
        if (supportVariant) {
          requestSupportCard(supportVariant);
        } else if (isHeldWallPost(shared)) {
          Alert.alert(
            'Under review',
            'Not on the wall yet. It is saved for review, and only you can see it here.',
          );
        }
        setAskText('');
        setAskShare(false);
        setAskComposerVisible(false);
        askPrivateSavedRef.current = null;
      } catch (err) {
        // Fix-everything D1: a blocked or daily-limit share must NOT
        // clear the draft — the composer keeps the text so the user
        // can reword (blocked) or try tomorrow (daily limit), and
        // the private-save ref stays so a retry does not duplicate
        // the private record. Generic failures keep the draft too;
        // the prayer is already saved privately.
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('MODERATION_BLOCKED')) {
          // Block-wins card: ONLY on a server-signalled self_harm/
          // threat block (supportCardVariantForBlock — no client
          // text scan, see its oracle note). The card replaces the
          // generic alert and its blocked line states the post was
          // not shared; it publishes nothing, and the draft is
          // still kept (D1) so the user can reword and try again.
          // Profanity-only and all other blocks keep the alert.
          const blockVariant = supportCardVariantForBlock(message);
          if (blockVariant) {
            requestSupportCard(blockVariant, { blocked: true });
          } else {
            Alert.alert(
              'Not shared',
              'This prayer contains language that can’t appear on the wall, so it wasn’t shared. Your words are still here, saved privately — you can reword and try again.',
            );
          }
        } else if (message.includes('MODERATION_DAILY_LIMIT')) {
          Alert.alert(
            'Already shared today',
            'You’ve already shared a prayer today. Your words are still here, saved privately — come back tomorrow to share another one.',
          );
        } else {
          Alert.alert('Couldn’t share your prayer', 'Your words are still here, saved privately. Check your connection and try again.');
        }
      }
    };

    if (!askShare) {
      setAskText('');
      setAskShare(false);
      setAskComposerVisible(false);
      askPrivateSavedRef.current = null;
      return;
    }

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
      // Audit round 12, H21: mirror the wall composer, which returns
      // before clearing on the anonymous branch. The old code cleared
      // askText/askShare and closed the composer here, so after
      // signing in the user had to retype the prayer to share it.
      // Keeping text + share toggle + composer (and the
      // private-saved ref, so a post-sign-in SAVE does not duplicate
      // the private record) lets the return trip complete the share
      // with one more SAVE tap.
      return;
    }

    if (!(await requestAskAttestation(shareAskPrayer))) return;
    await shareAskPrayer();
    // Audit fix F7: consume a pending pre-session attestation once it
    // has authorized this write (stamped under the minted id when one
    // exists, otherwise dropped) — it must never survive as a standing
    // pass for a later account. Best-effort; the write already done.
    void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
    } finally {
      askSavingRef.current = false;
    }
  };

  // ── Declare movement: SPEAK the declaration aloud ──
  const [speakingDeclaration, setSpeakingDeclaration] = useState(false);
  const handleSpeakDeclaration = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (speakingDeclaration) {
      // M16: stopping SPEAK stops every spoken player, including a
      // voiceover that started while the declaration was queued.
      stopAllSpokenAudio();
      setSpeakingDeclaration(false);
      return;
    }
    // Kai-approved 2026-10-26: session Declare SPEAK is gated behind
    // the same VOICEOVER tier check as the declarations reader SPEAK
    // (previously free here — a leak in the same feature). The lock
    // sheet below reuses the reader's exact featureName/requirement;
    // no new copy. Stopping above stays ungated.
    // NOTE: this file's hasFeature is the module-level
    // services/entitlements function (feature, tier) — NOT the
    // context-bound one the declarations reader uses — so the
    // user's activeTier MUST be passed, or the check is always
    // false and SPEAK would lock for Partners too.
    if (!hasFeature('VOICEOVER', activeTier)) {
      setSpeakLockVisible(true);
      return;
    }
    // Wave 2, fix 7, adjacent: the SPEAK button had the same
    // declare-only read as the share builders, so on prompt-only days
    // it spoke the generic fallback instead of the day's declaration.
    // Same plumbing fix, no wording change.
    const declaration = getDeclarationText(dayData);
    setSpeakingDeclaration(true);
    // Baked Helio declare-button file when it exists; device voice
    // otherwise (speakText owns the fallback).
    void (async () => {
      stopAllSpokenAudio();
      const started = await speakText(declaration, {
        rate: state.playbackRate ?? 1,
        // Kai-approved 2026-10-26: unified device-voice fallback
        // rate — deviceFallbackSpeechRate (services/narration.ts),
        // the same formula on every surface (closes audit round 11,
        // M17: this SPEAK button used 0.75x, the declarations reader
        // was uncapped, session voiceover/narration 0.6x).
        speechRate: deviceFallbackSpeechRate(state.playbackRate),
        onDone: () => setSpeakingDeclaration(false),
        onError: () => setSpeakingDeclaration(false),
      });
      if (!started) {
        // Neither the baked file nor the device voice could start —
        // never leave a stuck "STOP" button.
        if (__DEV__) console.log('[Session] Speech unavailable');
        setSpeakingDeclaration(false);
        Alert.alert('Voice unavailable', 'Your device could not start the voice. The declaration is right here to read aloud yourself.');
      }
    })();
  }, [speakingDeclaration, dayData.declare, state.playbackRate, stopAllSpokenAudio, activeTier]);

  useEffect(() => {
    return () => { stopSpokenAudio(); };
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

  if (isPacingLocked) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root} testID="session-pacing-locked">
          <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.pacingWrap}>
              <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>
                {(getTrack(activeTrackId)?.title ?? 'JOURNEY').toUpperCase()}
              </Text>
              <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Today&apos;s prayer is complete</Text>
              <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
                Day {activeDay} unlocks tomorrow morning. Rest in what you&apos;ve already received today.
              </Text>
              <View style={styles.pacingActions}>
                <GlowButton
                  label="REVISIT PAST DAYS"
                  onPress={() => router.replace('/tracks')}
                  variant="amber"
                  style={{ marginBottom: 14 }}
                />
                <GlowButton
                  label="SELAH · DRIFT OFF IN TRUTH"
                  onPress={() => router.replace('/session?mode=sleep')}
                  variant="ghost"
                  style={{ marginBottom: 14 }}
                />
                <GlowButton
                  label="DONE"
                  onPress={() => router.replace('/')}
                  variant="ghost"
                />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </>
    );
  }

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
              ? `Daily Prayer · ${!isFoundations ? `${getTrack(activeTrackId)?.title ?? 'Journey'} ` : ''}Day ${activeDay} · ${phaseLabel}`
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
                  {/* Identity statement intentionally NOT repeated here — it
                      belongs to Declare (spoken) and Selah (REST ON THIS). */}
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
                  {renderVerse([styles.scriptureText, { fontFamily: Fonts.serifRegular }])}
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
              disableGlow
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
                disableGlow
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
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: askShare }}
                  accessibilityLabel="Share on the prayer wall"
                >
                  <View style={[styles.askShareBox, askShare && styles.askShareBoxActive]}>
                    {askShare ? <Text style={styles.askShareCheck}>{'\u2713'}</Text> : null}
                  </View>
                  <Text style={[styles.askShareLabel, { fontFamily: Fonts.titleMedium }]}>Share on the prayer wall</Text>
                </Pressable>
                {askShare && (
                  <Pressable
                    onPress={() => setGuidelinesVisible(true)}
                    testID="ask-wall-guidelines-open"
                    accessibilityRole="button"
                    accessibilityLabel="Open wall guidelines"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={[styles.askPrivacyNote, { fontFamily: Fonts.titleMedium }]}>Wall guidelines</Text>
                  </Pressable>
                )}
                <View style={styles.askComposerActions}>
                  <Pressable onPress={() => setAskComposerVisible(false)} style={styles.askCancelBtn}>
                    <Text style={[styles.askCancelText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleAddPrayer()} style={styles.askSaveBtn} testID="ask-save-prayer">
                    <Text style={[styles.askSaveText, { fontFamily: Fonts.titleBold }]}>SAVE</Text>
                  </Pressable>
                </View>
              </View>
            )}
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
          <Text style={[styles.timerEyebrow, { fontFamily: Fonts.titleSemiBold }]}>
            You&apos;ve spoken. Now listen — He responds.
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
        {/* The looping Night Selah narration row is sleep-only — the
            lesson's Selah itself stays music + timer. Lesson
            per-movement narration is toggled from the "..." menu
            (testID "menu-narration-row"), not from here. */}
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
  const renderClosingBody = () => {
    // Wave 2, fix 4: an arrival at Closing without visiting every
    // movement is NOT a completion — nothing is recorded, and the page
    // must not claim otherwise. Show what happened, what was (not)
    // recorded, and a way back to the first unvisited movement, instead
    // of the "Prayer Complete" title with no DONE/SHARE actions and no
    // explanation. The check badge stays hidden here: it implies done.
    // [NEW] copy below — needs Kai's review before shipping.
    if (closingIncomplete && !isComplete) {
      const firstUnvisitedIdx = firstUnvisitedMovementIndex(movements, visitedPhases);
      return (
        <View style={styles.closingWrap}>
          {/* Plain View, NOT the recapFadeAnim wrapper: that animation
              only runs to 1 inside handleComplete, so it is still 0
              on an unvisited arrival — wrapping this variant in it
              would render the explanation invisible. */}
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>
              {`DAY ${completedDay || activeDay}`}
            </Text>
            <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Almost there</Text>
            <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
              You jumped ahead to the end, so nothing has been recorded yet. Pray through each
              movement, then return here — today&apos;s prayer completes once you&apos;ve walked
              through all of it.
            </Text>
            <View style={styles.recapActions}>
              <GlowButton
                label="GO BACK AND PRAY THROUGH"
                onPress={() => goToPage(firstUnvisitedIdx >= 0 ? firstUnvisitedIdx : 0)}
                variant="primary"
                style={{ marginBottom: 16 }}
              />
            </View>
          </View>
        </View>
      );
    }
    // Wave 2, fix 5: a failed track save leaves the user ON Closing
    // with a retry in place — no re-entry required. The variant shows
    // only while the save is failed and the day is not complete; a
    // retry re-runs the guarded runner above.
    // [NEW] copy below — needs Kai's review before shipping.
    if (completionSaveFailed && !isComplete) {
      return (
        <View style={styles.closingWrap}>
          {/* Plain View, NOT the recapFadeAnim wrapper: a failed save
              returns before handleComplete's fade-in runs, so the
              wrapper would still be at opacity 0 here. */}
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>
              {`DAY ${completedDay || activeDay}`}
            </Text>
            <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Couldn&apos;t save your progress</Text>
            <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
              Your prayer wasn&apos;t recorded yet. You can try again right now — nothing is lost
              from this session.
            </Text>
            <View style={styles.recapActions}>
              <GlowButton
                label="TRY AGAIN"
                onPress={() => attemptCompletionRef.current()}
                variant="primary"
                style={{ marginBottom: 16 }}
              />
            </View>
          </View>
        </View>
      );
    }
    return (
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
              {isAnyReplay ? `DAY ${completedDay || activeDay} · REVISITED` : `DAY ${completedDay || activeDay}`}
            </Text>
            <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Prayer Complete</Text>
            <Text style={[styles.closingStayCopy, { fontFamily: Fonts.italic }]}>
              Feel free to stay in this space for as long as you need.
            </Text>
          </>
        )}

        {/* Round-5 lane 1, M1: the milestones array is Foundations-only
            (days 1/3/7/14/21/30). On a non-Foundations track it produced a
            keep-going line on Freedom's completion day, so the card is
            suppressed there and the JOURNEY COMPLETE card carries the
            moment instead. Copy-guard only; no scheduler change. */}
        {isFoundations && isMilestoneDay && milestone && (
          <View style={styles.milestoneCard}>
            <Text style={styles.milestoneEmoji}>✨</Text>
            <View style={styles.milestoneTextWrap}>
              <Text style={[styles.milestoneLabel, { fontFamily: Fonts.titleBold }]}>MILESTONE REACHED</Text>
              <Text style={[styles.milestoneMessage, { fontFamily: Fonts.titleMedium }]}>{milestone.message}</Text>
            </View>
          </View>
        )}

        {isMilestoneDay && lookBackEntry && !isAnyReplay && (
          <View style={styles.lookBackCard}>
            <Text style={[styles.lookBackEyebrow, { fontFamily: Fonts.titleMedium }]}>A THOUGHT FROM YOUR PAST</Text>
            <Text style={[styles.lookBackText, { fontFamily: Fonts.serifRegular }]}>&quot;{lookBackEntry.text}&quot;</Text>
          </View>
        )}

        {!isAnyReplay && !isDailyPrayerSession && (() => {
          const doneDay = completedDay || activeDay;
          if (doneDay < trackDayCount) {
            const nextContent = isFoundations
              ? getDayContent(doneDay + 1)
              : getTrackDay(activeTrackId, doneDay + 1);
            if (!nextContent) return null;
            return (
              <View style={styles.tomorrowCard}>
                <Text style={[styles.tomorrowEyebrow, { fontFamily: Fonts.titleMedium }]}>UP NEXT · DAY {doneDay + 1}</Text>
                <Text style={[styles.tomorrowTitle, { fontFamily: Fonts.serifLight }]}>{nextContent.title}</Text>
                <Text style={[styles.tomorrowSub, { fontFamily: Fonts.italic }]}>Unlocks tomorrow morning — one day at a time.</Text>
              </View>
            );
          }
          // Final day of the journey — a completion moment, never a dead end.
          if (isFoundations) {
            const unlocked = TRACKS.filter((t) => t.status === 'live' && t.id !== 'foundations');
            const coming = TRACKS.filter((t) => t.status === 'coming_soon');
            return (
              <View style={styles.unlockCard}>
                <Text style={[styles.tomorrowEyebrow, { fontFamily: Fonts.titleMedium }]}>FOUNDATIONS COMPLETE · NEW JOURNEYS UNLOCKED</Text>
                {unlocked.map((t) => (
                  <View key={t.id} style={{ marginTop: 10 }}>
                    <Text style={[styles.unlockTrackTitle, { fontFamily: Fonts.serifLight }]}>{t.title} · {t.dayCount} days</Text>
                    <Text style={[styles.unlockTrackDesc, { fontFamily: Fonts.italic }]}>{t.description}</Text>
                    <GlowButton
                      label={`BEGIN ${t.title.toUpperCase()}`}
                      onPress={() => {
                        void (async () => {
                          await setActiveTrackId(t.id);
                          router.replace('/');
                        })();
                      }}
                      variant="amber"
                    />
                  </View>
                ))}
                {coming.length > 0 && (
                  <Text style={[styles.tomorrowSub, { fontFamily: Fonts.italic }]}>
                    Still to come: {coming.map((t) => t.title).join(' · ')}
                  </Text>
                )}
              </View>
            );
          }
          const others = TRACKS.filter((t) => t.status === 'live' && t.id !== activeTrackId);
          return (
            <View style={styles.unlockCard}>
              <Text style={[styles.tomorrowEyebrow, { fontFamily: Fonts.titleMedium }]}>JOURNEY COMPLETE</Text>
              <Text style={[styles.unlockTrackDesc, { fontFamily: Fonts.italic, marginTop: 8 }]}>
                You finished {getTrack(activeTrackId)?.title ?? 'this journey'}. Keep walking — pick your next journey, or revisit any day from the Prayer Library.
              </Text>
              {others.map((t) => (
                <GlowButton
                  key={t.id}
                  label={`BEGIN ${t.title.toUpperCase()}`}
                  onPress={() => {
                    void (async () => {
                      await setActiveTrackId(t.id);
                      router.replace('/');
                    })();
                  }}
                  variant="ghost"
                  style={{ marginBottom: 10 }}
                />
              ))}
            </View>
          );
        })()}

        {isComplete && (
          <View style={styles.recapActions}>
            {!isDailyPrayerSession && !isAnyReplay && (
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
              label={isAnyReplay ? "FINISH REVISITING ✓" : "DONE"}
              onPress={() => router.replace('/')}
              variant="primary"
              style={{ marginBottom: 16 }}
            />

            {isFoundations && (completedDay || activeDay) === 30 && !isAnyReplay && (
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

        {/* Post-session intercession prompt (Kai's standing directive):
            prayer requests live on the wall, not inside the session — so
            once today's prayer is done, gently point there. */}
        {isComplete && (
          <AnimatedPressable
            onPress={() => router.replace('/(tabs)/community')}
            style={styles.intercedeCard}
            scaleValue={0.98}
            testID="session-intercede-prompt"
          >
            <Text style={[styles.intercedeText, { fontFamily: Fonts.italic }]}>
              You&apos;ve prayed today. Others are carrying heavy things — want to pray for someone?
            </Text>
            <View style={styles.intercedeLinkRow}>
              <Text style={[styles.intercedeLinkText, { fontFamily: Fonts.titleBold }]}>GO TO THE PRAYER WALL</Text>
              <ChevronRight size={14} color={C.accent} strokeWidth={2} />
            </View>
          </AnimatedPressable>
        )}
      </Animated.View>
    </View>
    );
  };

  // Hold the pager until the active track has resolved — the first frames
  // would otherwise be a Foundations session wearing this route's params.
  if (!trackStateReady) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root} testID="session-screen-loading">
          <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
        </View>
      </>
    );
  }

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
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
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

          {/* Full-screen vertical pager — one movement per screen.
              contentOffset seats the pager on its start page at first paint
              (Selah in sleep mode) instead of page 0 + a post-mount jump. */}
          <ScrollView
            ref={pagerRef}
            style={styles.pager}
            // Round-5 lane 9, a11y (additive only): announce the pager's
            // position so a VoiceOver user knows which movement they are on.
            accessibilityLabel={`Prayer session, movement ${pageIndex + 1} of ${movements.length}`}
            accessibilityLiveRegion="polite"
            onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
            contentOffset={{ x: 0, y: pageIndex * pageHeight }}
            pagingEnabled
            nestedScrollEnabled
            scrollEnabled={!isSleepMode}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const offset = e.nativeEvent.contentOffset?.y;
              if (typeof offset !== 'number' || !Number.isFinite(offset) || pageHeight <= 0) return;
              const rawIdx = Math.round(offset / pageHeight);
              // One fling = one movement. A user fling that overshoots lands
              // on the adjacent screen; programmatic scrolls (dots, continue)
              // always accept their exact target.
              const idx = programmaticScrollRef.current
                ? rawIdx
                : Math.max(pageIndex - 1, Math.min(pageIndex + 1, rawIdx));
              programmaticScrollRef.current = false;
              handlePageChange(Math.max(0, Math.min(movements.length - 1, idx)));
            }}
            testID="session-pager"
          >
            {movements.map((movement, mIdx) => (
              <View
                key={movement.id}
                style={[styles.page, { height: pageHeight }]}
                testID={`movement-${movement.id}`}
                // Round-5 lane 9, a11y (additive only): each page names
                // itself in linear VoiceOver navigation.
                accessibilityLabel={`Movement ${mIdx + 1} of ${movements.length}: ${movement.kicker}`}
              >
                <ScrollView
                  contentContainerStyle={styles.pageContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {movement.kind === 'closing'
                    ? renderClosingBody()
                    : movement.kind === 'selah'
                      ? renderSelahBody()
                      : renderMovementBody(movement)}

                </ScrollView>

                {/* Continue hint — docked bottom-center of the page so it
                    sits in the page's bottom rhythm on every movement,
                    instead of riding in-flow under the centered content
                    (too high, and off-center relative to the page). */}
                {mIdx < movements.length - 1 && !(isSleepMode && movement.kind === 'selah') && (
                  <View
                    // Wave 2, fix 2: pages are viewport-height now, so
                    // the static bottom:26 in nextHintDock already pins
                    // to the viewport bottom — the old pageHeight-minus-
                    // pagerHeight offset is gone with the overflow.
                    style={styles.nextHintDock}
                    pointerEvents="box-none"
                  >
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
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* "..." menu — bottom sheet with soundbed, live volume, lesson narration & share */}
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
                  accessibilityValue={{ min: 0, max: 1, now: selahVolume }}
                />
              ) : (
                <Text style={[styles.menuRowState, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                  {Math.round(selahVolume * 100)}%
                </Text>
              )}
            </View>

            {/* Lesson-mode narration toggle — the Night Selah row below
                (testID "narration-toggle") only renders in sleep mode,
                where the pager sits on Selah and the per-movement effect
                early-returns, so the 323 baked narration units were
                unreachable in lessons. This menu row restores the toggle
                to every lesson movement via the same handler (same
                MISSIONS-tier gate + Partner lock sheet, same ON/OFF
                state), so toggling it on fires the per-movement effect
                for the current movement and every movement after it.
                Sleep mode keeps its dedicated row and this row stays
                hidden there, so there is never a second toggle. The
                menu stays open on toggle, like the Soundbed row, so
                the ON/OFF flip is visible. Lesson Selah and Closing
                still speak nothing (INVENTORY rule: narration covers
                every movement except selah/closing); the Settings
                voiceover stays suppressed while narration is on
                (speakMovementVoiceover's narrationOn guard). */}
            {!isSleepMode && (
              <Pressable
                onPress={handleNarrationToggle}
                style={styles.menuRow}
                testID="menu-narration-row"
                accessibilityRole="button"
                accessibilityLabel="Immersive Narration"
              >
                <Text style={[styles.menuRowLabel, { color: C.text, fontFamily: Fonts.titleMedium }]}>Immersive Narration</Text>
                {activeTier < UserTier.MISSIONS ? (
                  <Lock size={14} color={C.iconMuted} />
                ) : (
                  <Text style={[styles.menuRowState, { color: C.accent, fontFamily: Fonts.titleBold }]}>
                    {narrationOn ? 'ON' : 'OFF'}
                  </Text>
                )}
              </Pressable>
            )}

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
              <Text style={[styles.menuCloseText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <FeatureLockSheet
        visible={narrationLockVisible}
        onClose={() => setNarrationLockVisible(false)}
        featureName="Immersive Narration"
        requirement="Partner"
      />

      <FeatureLockSheet
        visible={speakLockVisible}
        onClose={() => setSpeakLockVisible(false)}
        featureName="Spoken declarations"
        requirement={getFeatureRequirement('VOICEOVER')}
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
            <ScrollView style={styles.explainerSheetScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.explainerSheetTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>
                {selectedExplainer?.term ?? ''}
              </Text>
              <Text style={[styles.explainerSheetContext, { color: C.accent, fontFamily: Fonts.titleMedium }]}>
                {selectedExplainer?.context ?? ''}
              </Text>
              <Text style={[styles.explainerSheetBody, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
                {selectedExplainer?.explanation ?? ''}
              </Text>
            </ScrollView>
            <Pressable onPress={closeExplainer} style={styles.explainerSheetClose} testID="session-explainer-close">
              <Text style={[styles.explainerSheetCloseText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>CLOSE</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {/* Pre-launch audit PL-H3: 13+ gate for the Ask-movement wall share. */}
      <AgeAttestationModal
        visible={showAskAgeGate}
        onConfirm={() => void confirmAskAgeGate()}
        onDecline={declineAskAgeGate}
      />

      <WallGuidelinesSheet
        visible={guidelinesVisible}
        onClose={() => setGuidelinesVisible(false)}
      />

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
                {renderVerse([styles.shareCardVerse, { fontFamily: Fonts.serifRegular, color: C.text }])}
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

      </View>
    </>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    overflow: 'hidden' as const,
  },
  safeArea: {
    flex: 1,
  },
  ambientVeil: {
    ...absoluteFillObject,
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
    fontSize: T.size.numberChrome,
    lineHeight: T.leading.numberChrome,
    letterSpacing: 2,
    color: C.textSecondary,
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
    // Clears the docked continue hint so scrolled-to-bottom content
    // (the guidance line) never hides behind it.
    paddingBottom: 88,
  },
  movementEyebrowSmall: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textSecondary,
    marginBottom: 18,
  },
  movementKicker: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 20,
  },
  movementBody: {
    fontSize: T.size.prayerBody,
    lineHeight: T.leading.prayerBody,
    color: C.text,
    marginBottom: 28,
  },
  movementBodyPrompt: {
    fontStyle: 'italic' as const,
    color: C.textSecondary,
  },
  movementGuidance: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginTop: 28,
    maxWidth: 300,
  },
  settleWelcome: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    marginBottom: 8,
    marginTop: 2,
  },
  settleTeachText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  settleTeachIdentity: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accentDark,
    marginBottom: 8,
    marginTop: 2,
  },
  scriptureText: {
    fontSize: T.size.scripture,
    lineHeight: T.leading.scripture,
    color: C.text,
  },
  declareIdentity: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 2,
    color: C.accent,
  },
  askComposer: {
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 16,
    marginTop: 20,
  },
  askInput: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginTop: 16,
  },
  askShareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    padding: 4,
    minHeight: 44,
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
    fontSize: 14.5,
    lineHeight: 20,
  },
  askShareLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    color: C.textSecondary,
  },
  askComposerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  askCancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  askCancelText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 1.5,
  },
  askSaveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 100,
    minHeight: 44,
    justifyContent: 'center',
  },
  askSaveText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#FFF',
    letterSpacing: 1.5,
  },

  // ── Selah ──
  timerCard: {
    alignItems: 'center',
    marginVertical: 8,
  },
  timerEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    color: C.textSecondary,
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
    fontSize: T.size.display,
    lineHeight: T.leading.display,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    // Standard page gap below the explainer chip row (the chip row used
    // to nearly touch START while the rest of the page breathes at 20–28).
    marginTop: 24,
  },
  timerBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.text,
  },
  timerOpenTxt: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    textAlign: 'center',
    marginVertical: 24,
  },
  selahRestOnWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  selahRestOnEyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
  },
  selahRestOnText: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  selahCountdown: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
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
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  // Kai-approved 2026-10-26 (bundle 19, supporting text): raised from
  // 12.5pt muted to the supporting-text floor — 14.5pt, secondary
  // color — so it reads on a phone, not just on a monitor.
  selahNarrationSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginTop: 2,
  },
  selahNarrationState: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  completeTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  closingStayCopy: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 24,
  },
  pacingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  pacingActions: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  unlockCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.25)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  unlockTrackTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
    marginBottom: 4,
  },
  unlockTrackDesc: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginBottom: 12,
  },
  // Kai-approved 2026-10-26 (bundle 19, supporting text): same raise
  // as selahNarrationSub — 12.5pt muted → 14.5pt secondary.
  tomorrowSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginTop: 6,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 4,
  },
  milestoneMessage: {
    fontSize: T.size.bodySmall,
    lineHeight: T.leading.bodySmall,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accentDark,
    marginBottom: 8,
  },
  lookBackText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    color: C.accentDark,
    marginBottom: 6,
  },
  tomorrowTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  recapActions: {
    alignSelf: 'stretch',
    marginTop: 16,
  },

  // ── Post-session intercession prompt ──
  intercedeCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 22,
    marginTop: 16,
    alignItems: 'center',
  },
  intercedeText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    textAlign: 'center',
  },
  intercedeLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    minHeight: 32,
  },
  intercedeLinkText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.accent,
  },

  // ── Continue hint ──
  nextHintDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
    alignItems: 'center',
  },
  nextHint: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  nextHintText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    letterSpacing: 2.5,
    color: C.textSecondary,
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
    minHeight: 44,
  },
  explainerLinkHovered: {
    backgroundColor: 'rgba(200,137,74,0.12)',
  },
  explainerLinkPressed: {
    backgroundColor: 'rgba(200,137,74,0.16)',
  },
  explainerLinkText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    color: C.textSecondary,
  },
  explainerQuestionDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(200,137,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerQuestionText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 6,
  },
  reflectiveText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },

  // ── Explainer sheet ──
  explainerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  explainerBackdrop: {
    ...absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  explainerSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 52,
    // Long explanations (deliverance, spirit/soul/body) overflowed small
    // screens and pushed CLOSE out of reach. Cap the sheet and scroll
    // the body instead.
    maxHeight: '80%',
  },
  explainerSheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  explainerSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  explainerSheetTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    marginBottom: 6,
  },
  explainerSheetContext: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    letterSpacing: 1,
    marginBottom: 14,
  },
  explainerSheetBody: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    marginBottom: 20,
  },
  explainerSheetClose: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
  },
  explainerSheetCloseText: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
    letterSpacing: 2,
  },

  // ── Share card (hidden capture target) ──
  shareCard: {
    width: 1080,
    height: 1080,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.3)',
    padding: 72,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareCardTop: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  shareCardHeader: {
    fontSize: 22,
    letterSpacing: 4,
    textAlign: 'center' as const,
  },
  shareCardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  shareCardSection: {
    alignItems: 'center',
  },
  shareCardDivider: {
    height: 1,
    width: 120,
    backgroundColor: 'rgba(200,137,74,0.35)',
    marginBottom: 28,
  },
  shareCardLabel: {
    fontSize: 20,
    letterSpacing: 5,
    color: 'rgba(200,137,74,0.7)',
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  shareCardTruth: {
    fontSize: 46,
    lineHeight: 64,
    textAlign: 'center' as const,
  },
  shareCardVerse: {
    fontSize: 28,
    lineHeight: 42,
    textAlign: 'center' as const,
  },
  shareCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  shareCardWatermark: {
    fontSize: 22,
    letterSpacing: 5,
  },
  shareCardAppInfo: {
    fontSize: 20,
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
    fontSize: T.size.title,
    lineHeight: T.leading.title,
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
    fontSize: T.size.label,
    lineHeight: T.leading.label,
  },
  menuRowState: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    minHeight: 44,
    justifyContent: 'center',
  },
  menuCloseText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
  },
});
