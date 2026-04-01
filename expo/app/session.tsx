import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  ScrollView,
  Dimensions,
  Share,
  Modal,
} from 'react-native';
import { useRouter, Stack, useGlobalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
let ViewShot: React.ComponentType<{ ref?: React.Ref<any>; options?: { format: string; quality: number }; children?: React.ReactNode }> | null = null;
let _captureRef: ((ref: React.RefObject<any>, options?: { format: string; quality: number }) => Promise<string>) | null = null;
try {
  const _rvs = require('react-native-view-shot');
  ViewShot = _rvs.default ?? _rvs;
  _captureRef = _rvs.captureRef;
} catch {
  // not available in this environment (web or unsupported platform)
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, Check, ArrowLeft, Volume2, VolumeX, Share2, Flame, PenLine } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { getGoogleTTSAudio } from '@/services/tts';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { getHtmlDay, getPhaseLabel, getDayContent, BLOCKER_OPENERS, milestones } from '@/mocks/content';
import { EXPLAINERS, ExplainerKey } from '@/mocks/explainers';
import { HtmlDayData } from '@/types';
import { SOUNDSCAPE_MAP } from '@/constants/soundscapes';
import { AudioManager } from '@/lib/audioManager';
import AnimatedPressable from '@/components/AnimatedPressable';
import CelebrationParticles from '@/components/CelebrationParticles';
import RadialGlow from '@/components/RadialGlow';
import GlowButton from '@/components/GlowButton';
import ReflectionModal from '@/components/ReflectionModal';
import { Fonts } from '@/constants/fonts';



interface PhaseSection {
  id: string;
  icon: string;
  name: string;
  sub: string;
  content: string | null;
  isPrompt: boolean;
}

interface SessionNavItem {
  id: string;
  label: string;
  opensPhase: boolean;
}

interface SessionExplainerMatch {
  key: ExplainerKey;
  term: string;
  context: string;
  explanation: string;
}

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

export default function SessionScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = React.useMemo(() => createStyles(C, T), [C, T]);

  const router = useRouter();
  const { state, completeDay, saveReflection, toggleAmbientMute, setAmbientMute, updatePhaseTimings, startSecondPass, updateActiveSession, startSession } = useApp();

  const { day } = useGlobalSearchParams<{ day?: string }>();
  const activeDay = day ? parseInt(day, 10) : state.currentDay;
  const isReplay = !!day && parseInt(day, 10) !== state.currentDay;

  const dayData = useMemo(() => getHtmlDay(activeDay), [activeDay]);
  const phaseLabel = useMemo(() => getPhaseLabel(activeDay), [activeDay]);
  const phases = useMemo(() => buildPhases(dayData), [dayData]);
  const currentSoundscape = useMemo(() => SOUNDSCAPE_MAP[state.soundscape], [state.soundscape]);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);

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

  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [phaseStart, setPhaseStart] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [completedDay, setCompletedDay] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [visitedPhases, setVisitedPhases] = useState<Set<string>>(new Set());
  const [reflectionVisible, setReflectionVisible] = useState(false);
  const [selectedExplainer, setSelectedExplainer] = useState<SessionExplainerMatch | null>(null);
  const [explainerSheetVisible, setExplainerSheetVisible] = useState<boolean>(false);

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

  useEffect(() => {
    if (!isReplay && activeDay === state.currentDay && !state.activeSession) {
      startSession(activeDay);
    }
  }, [activeDay, isReplay, startSession, state.activeSession, state.currentDay]);

  useEffect(() => {
    if (!isReplay && state.activeSession && state.activeSession.day === activeDay) {
      if (state.activeSession.phase) {
        setOpenPhase(state.activeSession.phase);
      }
      if (state.activeSession.secondsElapsed > 0) {
        setTimerSeconds(Math.max(0, timerTotal - state.activeSession.secondsElapsed));
      }
    }
  }, [activeDay, isReplay, state.activeSession, timerTotal]);

  useEffect(() => {
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
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const completeScaleAnim = useRef(new Animated.Value(0.8)).current;
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One Animated.Value per TRIAD phase card — used to dim non-active cards
  const phaseOpacityAnims = useRef<Record<string, Animated.Value>>({});
  const recapFadeAnim = useRef(new Animated.Value(0)).current;
  const explainerSheetAnim = useRef(new Animated.Value(420)).current;
  const explainerBackdropAnim = useRef(new Animated.Value(0)).current;

  const soundRef = useRef<Audio.Sound | null>(null);
  const audioStartedRef = useRef(false);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);

  const quickNavItems = useMemo<SessionNavItem[]>(() => {
    const phaseItems: SessionNavItem[] = [
      { id: 'focus', label: SECTION_LABELS.focus, opensPhase: true },
      ...phases.map((phase) => ({
        id: phase.id,
        label: SECTION_LABELS[phase.id] ?? phase.name,
        opensPhase: true,
      })),
    ];

    return [
      { id: 'settle', label: SECTION_LABELS.settle, opensPhase: false },
      ...phaseItems,
      { id: 'selah', label: SECTION_LABELS.selah, opensPhase: true },
      { id: 'act', label: SECTION_LABELS.act, opensPhase: true },
      { id: 'verse', label: SECTION_LABELS.verse, opensPhase: false },
    ];
  }, [phases]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

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

  const ambientMutedRef = useRef(state.ambientMuted);
  ambientMutedRef.current = state.ambientMuted;

  useEffect(() => {
    if (!localAudioUrl) return;
    let mounted = true;
    const loadAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        if (!isReplay && ambientMutedRef.current) {
          setAmbientMute(false);
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: localAudioUrl },
          { shouldPlay: true, isLooping: true, volume: 0 }
        );
        if (!mounted) { await sound.unloadAsync(); return; }
        soundRef.current = sound;
        await sound.setIsLoopingAsync(true);
        
        audioStartedRef.current = true;
        await sound.setVolumeAsync(0);
        await sound.playAsync();
        const TARGET = 0.3;
        const STEPS = 15;
        let s = 0;
        fadeInIntervalRef.current = setInterval(async () => {
          s++;
          try { await soundRef.current?.setVolumeAsync(Math.min((s / STEPS) * TARGET, TARGET)); } catch {}
          if (s >= STEPS && fadeInIntervalRef.current) {
            clearInterval(fadeInIntervalRef.current);
            fadeInIntervalRef.current = null;
          }
        }, 200);
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
    };
  }, [localAudioUrl, state.soundscape, isReplay, setAmbientMute]);

  useEffect(() => {
    const updateVolume = async () => {
      if (!soundRef.current || !audioStartedRef.current) return;
      try {
        if (state.ambientMuted) {
          if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }
          await soundRef.current.setVolumeAsync(0);
        } else {
          await soundRef.current.setVolumeAsync(0.3);
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && !status.isPlaying) await soundRef.current.playAsync();
        }
      } catch {}
    };
    void updateVolume();
  }, [state.ambientMuted]);

  useEffect(() => {
    if (isComplete && soundRef.current) {
      const fadeOut = async () => {
        try {
          for (let v = 0.3; v >= 0; v -= 0.05) {
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
        <Text style={[styles.explainerEyebrow, { fontFamily: Fonts.titleMedium }]}>What this means</Text>
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

  const registerSection = useCallback((sectionId: string) => {
    return (event: any) => {
      const nextY = event.nativeEvent.layout.y;
      sectionOffsetsRef.current[sectionId] = nextY;
    };
  }, []);

  const scrollToSection = useCallback((sectionId: string, forTriad = false) => {
    const nextY = sectionOffsetsRef.current[sectionId];

    if (typeof nextY !== 'number') {
      return;
    }

    // For TRIAD phases, scroll so section header sits right at the top of visible content
    const offset = forTriad ? 16 : 20;
    const targetY = Math.max(nextY - offset, 0);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, []);

  const scheduleScrollToSection = useCallback((sectionId: string, forTriad = false) => {
    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }

    pendingScrollTimeoutRef.current = setTimeout(() => {
      scrollToSection(sectionId, forTriad);
      pendingScrollTimeoutRef.current = null;
    }, 90);
  }, [scrollToSection]);

  const togglePhase = useCallback((phaseId: string) => {
    const triadIds = phases.map(p => p.id); // Only the 5 TRIAD cards (thank/repent/invite/ask/declare)
    const allExpandableIds = ['focus', ...triadIds, 'selah', 'act'];
    const isTriadPhase = triadIds.includes(phaseId);
    const isExpandable = allExpandableIds.includes(phaseId);

    // Ensure opacity anims exist for TRIAD cards only
    triadIds.forEach(id => {
      if (!phaseOpacityAnims.current[id]) {
        phaseOpacityAnims.current[id] = new Animated.Value(1);
      }
    });

    if (openPhase === phaseId) {
      // Closing — restore ALL TRIAD cards to full opacity
      if (phaseStart) {
        const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
        if (elapsed > 0) updatePhaseTimings(openPhase, elapsed);
      }
      setOpenPhase(null);
      setPhaseStart(null);

      if (isTriadPhase) {
        Animated.parallel(
          triadIds.map(id =>
            Animated.timing(phaseOpacityAnims.current[id], {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            })
          )
        ).start();
      }
    } else {
      if (openPhase && phaseStart) {
        const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
        if (elapsed > 0) updatePhaseTimings(openPhase, elapsed);
      }
      setOpenPhase(phaseId);
      setPhaseStart(Date.now());
      setVisitedPhases(prev => new Set(prev).add(phaseId));

      if (isTriadPhase) {
        // Dim all OTHER TRIAD cards — Focus/Selah/Act/Settle are never dimmed
        Animated.parallel(
          triadIds.map(id =>
            Animated.timing(phaseOpacityAnims.current[id], {
              toValue: id === phaseId ? 1 : 0.4,
              duration: 200,
              useNativeDriver: true,
            })
          )
        ).start();
      } else if (triadIds.includes(openPhase ?? '')) {
        // A TRIAD card was previously open — restore all TRIAD opacities to full
        Animated.parallel(
          triadIds.map(id =>
            Animated.timing(phaseOpacityAnims.current[id], {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            })
          )
        ).start();
      }
      
      // Google TTS guidance
      if (state.voiceoverEnabled) {
        let textToRead = '';
        if (phaseId === 'focus') textToRead = 'Today\'s Truth. ' + dayData.focus;
        else if (phaseId === 'selah') textToRead = 'Selah. ' + dayData.silenceTxt;
        else if (phaseId === 'act') textToRead = 'Go and Live it. ' + dayData.act;
        else if (phaseId === 'verse') textToRead = dayData.verse;
        else {
          const matchedPhase = phases.find(p => p.id === phaseId);
          if (matchedPhase) {
            textToRead = `${matchedPhase.name}. ${matchedPhase.sub}. ${matchedPhase.content || ''}`;
          }
        }
        
        if (textToRead) {
          void (async () => {
            try {
              if (ttsSoundRef.current) {
                await ttsSoundRef.current.unloadAsync();
                ttsSoundRef.current = null;
              }
              const cacheKey = `${activeDay}-${phaseId}`;
              const audioUrl = await getGoogleTTSAudio(textToRead, cacheKey);
              if (audioUrl) {
                const { sound: newSound } = await Audio.Sound.createAsync(
                  { uri: audioUrl },
                  { shouldPlay: true }
                );
                ttsSoundRef.current = newSound;
              }
            } catch (e) {
              if (__DEV__) console.log('[Session] TTS Error:', e);
            }
          })();
        }
      }

      scheduleScrollToSection(phaseId, isExpandable);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [activeDay, openPhase, phaseStart, phases, updatePhaseTimings, scheduleScrollToSection, state.voiceoverEnabled, dayData]);

  const handleScroll = useCallback((event: any) => {
    if (!openPhase && !visitedPhases.has('focus')) {
      const y = event.nativeEvent.contentOffset.y;
      const focusY = sectionOffsetsRef.current['focus'];
      if (focusY && y > focusY - 100) {
        togglePhase('focus');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPhase, visitedPhases]);

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

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (pendingScrollTimeoutRef.current) {
        clearTimeout(pendingScrollTimeoutRef.current);
        pendingScrollTimeoutRef.current = null;
      }
      if (ttsSoundRef.current) {
        void ttsSoundRef.current.unloadAsync();
        ttsSoundRef.current = null;
      }
    };
  }, []);

  const handleComplete = useCallback(() => {
    if (openPhase && phaseStart) {
      const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
      if (elapsed > 0) updatePhaseTimings(openPhase, elapsed);
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerRunning(false);

    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    setCompletedDay(activeDay);
    
    // Only mark as complete in global state if it's not a replay
    if (!isReplay) {
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
  }, [openPhase, phaseStart, sessionStartTime, activeDay, isReplay, completeDay, updatePhaseTimings, completeScaleAnim, recapFadeAnim]);

  function handleSectionNavPress(item: SessionNavItem) {
    if (item.opensPhase) {
      togglePhase(item.id);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scheduleScrollToSection(item.id);
  }

  const handleClose = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

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
    if (!viewShotRef.current || !_captureRef) return;
    
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const uri = await _captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Day ${completedDay}: Truth`,
          UTI: 'public.png',
        });
      } else {
        await Share.share({
          url: uri, // Standard share can take URL
          title: `Day ${completedDay}: Truth`,
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.log('Capture/Share error:', error);
      }
    }
  };


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

  if (isComplete) {

    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root}>
          <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
          <CelebrationParticles active={showCelebration} />
          <SafeAreaView style={[styles.safeArea, { zIndex: 10 }]}>
            <ScrollView contentContainerStyle={[styles.recapScroll, { justifyContent: undefined, paddingTop: 60 }]} showsVerticalScrollIndicator={false}>
              <Animated.View style={[styles.recapContainer, { opacity: recapFadeAnim, transform: [{ scale: completeScaleAnim }, { translateY: recapFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
                <View style={styles.completeBadgeOuter}>
                  <View style={styles.completeBadgeInner}>
                    <Check size={28} color="#C89A5A" strokeWidth={2.4} />
                  </View>
                </View>
                <Text style={[styles.completeDayLabel, { fontFamily: Fonts.titleMedium }]}>DAY {completedDay}</Text>
                <Text style={[styles.completeTitle, { fontFamily: Fonts.serifLight }]}>Prayer Complete</Text>
                <Text style={[styles.completeSub, { fontFamily: Fonts.italic }]}>
                  {completedDay === 1 ? "You showed up. That's the hardest part." :
                   completedDay === 7 ? "One full week of faithfulness." :
                   completedDay === 14 ? "Halfway through. Look how far you've come." :
                   completedDay === 21 ? "Three weeks. Something has changed in you." :
                   completedDay === 30 ? "You don't need this app anymore. But you're always welcome." :
                   "You're building something beautiful."}
                </Text>

                {isMilestoneDay && milestone && (
                  <View style={styles.milestoneCard}>
                    <Text style={styles.milestoneEmoji}>✨</Text>
                    <View style={styles.milestoneTextWrap}>
                      <Text style={[styles.milestoneLabel, { fontFamily: Fonts.titleBold }]}>MILESTONE REACHED</Text>
                      <Text style={[styles.milestoneMessage, { fontFamily: Fonts.italic }]}>{milestone.message}</Text>
                    </View>
                  </View>
                )}

                {/* Look-Back Hook — #2 */}
                {isMilestoneDay && lookBackEntry && !isReplay && (
                  <View style={styles.lookBackCard}>
                    <Text style={[styles.lookBackEyebrow, { fontFamily: Fonts.titleMedium }]}>A THOUGHT FROM YOUR PAST</Text>
                    <Text style={[styles.lookBackText, { fontFamily: Fonts.italic }]}>&quot;{lookBackEntry.text}&quot;</Text>
                  </View>
                )}

                {/* Tomorrow's Teaser — #4 */}
                {!isReplay && completedDay < 30 && (() => {
                  const tomorrowContent = getDayContent(completedDay + 1);
                  return (
                    <View style={styles.tomorrowCard}>
                      <Text style={[styles.tomorrowEyebrow, { fontFamily: Fonts.titleMedium }]}>UP NEXT · DAY {completedDay + 1}</Text>
                      <Text style={[styles.tomorrowTitle, { fontFamily: Fonts.serifLight }]}>{tomorrowContent.title}</Text>
                    </View>
                  );
                })()}

                {/* Thought Capture — #5 */}
                {!isReplay && (
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

                <View style={styles.recapActions}>
                  <GlowButton
                    label="SHARE TRUTH"
                    onPress={handleShareTruth}
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
                    label={isReplay ? "FINISH REVISITING ✓" : "DONE"}
                    onPress={() => router.replace('/')}
                    variant="primary"
                    style={{ marginBottom: 16 }}
                  />

                  {completedDay === 30 && !isReplay && (
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
              </Animated.View>
            </ScrollView>
          </SafeAreaView>
        </View>

        {/* Daily Reflection Modal */}
        <ReflectionModal
          visible={reflectionVisible}
          day={completedDay}
          onSave={(reflection) => {
            saveReflection(reflection);
            setReflectionVisible(false);
          }}
          onClose={() => setReflectionVisible(false)}
        />
      </>

    );
  }

  const blockerIdx = state.user?.blocker ?? -1;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
        <View style={styles.ambientTopGlowWrap} pointerEvents="none">
          <RadialGlow size={340} maxOpacity={0.07} />
        </View>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <ArrowLeft size={18} color="rgba(244,237,224,0.7)" />
              <Text style={[styles.backText, { fontFamily: Fonts.titleLight }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToggleMute} style={styles.muteBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              {state.ambientMuted ? (
                <VolumeX size={16} color="rgba(200,137,74,0.4)" />
              ) : (
                <Volume2 size={16} color="#C89A5A" />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView 
            ref={scrollRef} 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={32}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <Text style={[styles.prDayLabel, { fontFamily: Fonts.titleSemiBold }]}>
                {'• Day ' + activeDay + ' · ' + phaseLabel}
              </Text>
              <Text style={[styles.prTitle, { fontFamily: Fonts.serifLight }]}>{dayData.title}</Text>
              <Text style={[styles.prSub, { fontFamily: Fonts.italic }]}>Spirit · Soul · Body</Text>
              <Text style={[styles.prSoundscape, { fontFamily: Fonts.titleLight }]}>
                {'Sound · ' + currentSoundscape.label}
              </Text>
            </Animated.View>

            {isSecondPass && (
              <Animated.View style={[styles.secondPassBanner, { opacity: fadeAnim }]}>
                <Text style={[styles.secondPassText, { fontFamily: Fonts.titleSemiBold }]}>REFLECTIVE PASS #{state.journeyPass}</Text>
              </Animated.View>
            )}

            <Animated.View style={[styles.quickNavWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}> 
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickNavContent}
                testID="session-quick-nav"
              >
                {quickNavItems.map((item) => {
                  const isActive = openPhase === item.id;
                  const isVisited = visitedPhases.has(item.id);

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => handleSectionNavPress(item)}
                      style={({ pressed, hovered }: any) => [
                        styles.quickNavChip,
                        isActive && styles.quickNavChipActive,
                        isVisited && !isActive && styles.quickNavChipVisited,
                        hovered && styles.quickNavChipHovered,
                        pressed && styles.quickNavChipPressed,
                      ]}
                      testID={`session-nav-${item.id}`}
                    >
                      {isVisited && !isActive && (
                        <Check size={9} color="rgba(200,137,74,0.6)" strokeWidth={2.5} style={{ marginRight: 3 }} />
                      )}
                      <Text
                        style={[
                          styles.quickNavChipText,
                          { fontFamily: isActive ? Fonts.titleMedium : Fonts.titleLight },
                          isActive && styles.quickNavChipTextActive,
                          isVisited && !isActive && styles.quickNavChipTextVisited,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}

              </ScrollView>
            </Animated.View>

            <Animated.View style={[styles.phasesContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View onLayout={registerSection('settle')} collapsable={false} testID="section-settle">
                <View style={styles.settleCard}>
                <LinearGradient
                  colors={['rgba(200,137,74,0.25)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.settleCardTopLine}
                />
                <Text style={[styles.settleLbl, { fontFamily: Fonts.titleSemiBold }]}>SETTLE</Text>
                <Text style={[styles.settleTxt, { fontFamily: Fonts.serifRegular }]}>{dayData.settle}</Text>
                {renderExplainerLinks('settle', [dayData.settle])}
                </View>
              </View>

              <View
                onLayout={registerSection('focus')}
                collapsable={false}
                testID="section-focus"
              >
                <Pressable
                  style={({ pressed, hovered }: any) => [
                    styles.phase,
                    openPhase === 'focus' && styles.phaseOpen,
                    (hovered && openPhase !== 'focus') && styles.phaseHovered,
                    pressed && styles.phasePressed,
                  ]}
                  onPress={() => togglePhase('focus')}
                  accessibilityRole="button"
                  accessibilityLabel={`Focus phase. ${openPhase === 'focus' ? 'Expanded' : 'Collapsed'}`}
                  accessibilityState={{ expanded: openPhase === 'focus' }}
                >
                  <View style={styles.phaseHdr}>
                    <View style={[styles.phaseIco, openPhase === 'focus' && styles.phaseIcoOpen]}>
                      <Text style={styles.phaseIcoText}>🔦</Text>
                    </View>
                    <View style={styles.phaseHdrText}>
                      <Text style={[styles.phaseName, { fontFamily: Fonts.titleSemiBold }]}>FOCUS</Text>
                      <Text style={[styles.phaseSub, { fontFamily: Fonts.italic }]}>Today&apos;s truth</Text>
                    </View>
                    <ChevronDown
                      size={14}
                      color={openPhase === 'focus' ? 'rgba(200,137,74,0.65)' : 'rgba(200,137,74,0.32)'}
                      style={[styles.phaseChev, openPhase === 'focus' && styles.phaseChevOpen]}
                    />
                  </View>
                  {openPhase === 'focus' && (
                    <View style={styles.phaseBody}>
                      <View style={styles.phaseBodyBorder} />
                      {blockerIdx >= 0 && activeDay === 1 && BLOCKER_OPENERS[blockerIdx] && (
                        <View style={styles.identityBar}>
                          <Text style={styles.identityIcon}>💬</Text>
                          <Text style={[styles.identityText, { fontFamily: Fonts.italic }]}>{BLOCKER_OPENERS[blockerIdx]}</Text>
                        </View>
                      )}
                      <Text style={[styles.focusText, { fontFamily: Fonts.serifRegular }]}>{dayData.focus}</Text>
                      {dayData.identity ? (
                        <View style={[styles.identityBar, { marginTop: 12 }]}>
                          <Text style={styles.identityIcon}>🔑</Text>
                          <Text style={[styles.identityTextBold, { fontFamily: Fonts.serifSemiBold }]}>{dayData.identity}</Text>
                        </View>
                      ) : null}
                      {renderExplainerLinks('focus', [dayData.focus, dayData.identity, dayData.verse])}
                      {isSecondPass && (
                        <View style={styles.reflectivePrompt}>
                          <View style={styles.reflectiveDivider} />
                          <Text style={[styles.reflectiveLabel, { fontFamily: Fonts.titleSemiBold }]}>SECOND PASS REFLECTION</Text>
                          <Text style={[styles.reflectiveText, { fontFamily: Fonts.italic }]}>What did I notice this time?</Text>
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              </View>

              {phases.map((p, phaseIdx) => {
                // Lazy-init opacity anim for this phase
                if (!phaseOpacityAnims.current[p.id]) {
                  phaseOpacityAnims.current[p.id] = new Animated.Value(1);
                }
                const cardOpacity = phaseOpacityAnims.current[p.id];
                return (
                  <Animated.View
                    key={p.id}
                    style={{ opacity: cardOpacity }}
                    onLayout={registerSection(p.id)}
                    collapsable={false}
                    testID={`section-${p.id}`}
                  >
                  <Pressable
                    style={({ pressed, hovered }: any) => [
                      styles.phase,
                      openPhase === p.id && styles.phaseOpen,
                      (hovered && openPhase !== p.id) && styles.phaseHovered,
                      pressed && styles.phasePressed,
                    ]}
                    onPress={() => togglePhase(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name} phase. ${openPhase === p.id ? 'Expanded' : 'Collapsed'}`}
                    accessibilityState={{ expanded: openPhase === p.id }}
                  >
                    <View style={styles.phaseHdr}>
                      <View style={[styles.phaseIco, openPhase === p.id && styles.phaseIcoOpen]}>
                        <Text style={styles.phaseIcoText}>{p.icon}</Text>
                      </View>
                      <View style={styles.phaseHdrText}>
                        <Text style={[styles.phaseName, { fontFamily: Fonts.titleSemiBold }]}>{p.name.toUpperCase()}</Text>
                        <Text style={[styles.phaseSub, { fontFamily: Fonts.italic }]}>{p.sub}</Text>
                      </View>
                      <Text style={[styles.phaseStepNum, { fontFamily: Fonts.titleLight }]}>
                        {String(phaseIdx + 1).padStart(2, '0')}
                      </Text>
                      <ChevronDown
                        size={14}
                        color={openPhase === p.id ? 'rgba(200,137,74,0.65)' : 'rgba(200,137,74,0.32)'}
                        style={[styles.phaseChev, openPhase === p.id && styles.phaseChevOpen]}
                      />
                    </View>

                    {openPhase === p.id && (
                      <View style={styles.phaseBody}>
                        <View style={styles.phaseBodyBorder} />
                        {p.isPrompt ? (
                          <View style={styles.promptCard}>
                            <Text style={[styles.promptText, { fontFamily: Fonts.italic }]}>{p.content}</Text>
                          </View>
                        ) : (
                          <View style={styles.prayCard}>
                            <Text style={styles.prayQuote}>❝</Text>
                            <Text style={[styles.prayText, { fontFamily: Fonts.italic }]}>{p.content}</Text>
                          </View>
                        )}
                        {renderExplainerLinks(p.id, [p.name, p.sub, p.content])}
                        {isSecondPass && (
                          <View style={styles.reflectivePrompt}>
                            <View style={styles.reflectiveDivider} />
                            <Text style={[styles.reflectiveLabel, { fontFamily: Fonts.titleSemiBold }]}>SECOND PASS REFLECTION</Text>
                            <Text style={[styles.reflectiveText, { fontFamily: Fonts.italic }]}>What did I notice this time?</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Pressable>
                  </Animated.View>
                );
              })}

              <View
                onLayout={registerSection('selah')}
                collapsable={false}
                testID="section-selah"
              >
                <Pressable
                  style={({ pressed, hovered }: any) => [
                    styles.phase,
                    openPhase === 'selah' && styles.phaseOpen,
                    (hovered && openPhase !== 'selah') && styles.phaseHovered,
                    pressed && styles.phasePressed,
                  ]}
                  onPress={() => togglePhase('selah')}
                  accessibilityRole="button"
                  accessibilityLabel={`Selah phase. ${openPhase === 'selah' ? 'Expanded' : 'Collapsed'}`}
                  accessibilityState={{ expanded: openPhase === 'selah' }}
                >
                  <View style={styles.phaseHdr}>
                    <View style={[styles.phaseIco, openPhase === 'selah' && styles.phaseIcoOpen]}>
                      <Text style={styles.phaseIcoText}>⏳</Text>
                    </View>
                    <View style={styles.phaseHdrText}>
                      <Text style={[styles.phaseName, { fontFamily: Fonts.titleSemiBold }]}>SELAH</Text>
                      <Text style={[styles.phaseSub, { fontFamily: Fonts.italic }]}>Be still and let Him respond</Text>
                    </View>
                    <Text style={[styles.phaseStepNum, { fontFamily: Fonts.titleLight }]}>06</Text>
                    <ChevronDown
                      size={14}
                      color={openPhase === 'selah' ? 'rgba(200,137,74,0.65)' : 'rgba(200,137,74,0.32)'}
                      style={[styles.phaseChev, openPhase === 'selah' && styles.phaseChevOpen]}
                    />
                  </View>

                  {openPhase === 'selah' && (
                    <View style={styles.phaseBody}>
                      <View style={styles.phaseBodyBorder} />
                      {dayData.silence > 0 ? (
                        <View style={styles.timerCard}>
                          <Text style={[styles.timerEyebrow, { fontFamily: Fonts.italic }]}>
                            You&apos;ve spoken. Now be still and let Him respond.
                          </Text>
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
                          <Text style={[styles.timerTxt, { fontFamily: Fonts.italic }]}>{dayData.silenceTxt}</Text>
                          {renderExplainerLinks('selah', ['Selah', dayData.silenceTxt])}
                          <TouchableOpacity 
                            style={styles.timerBtn} 
                            onPress={handleStartTimer} 
                            activeOpacity={0.7}
                            accessibilityLabel={timerSeconds === 0 ? 'Timer complete' : timerRunning ? 'Pause timer' : 'Start timer'}
                          >
                            <Text style={[styles.timerBtnText, { fontFamily: Fonts.titleLight }]}>
                              {timerSeconds === 0 ? 'DONE ✓' : timerRunning ? 'PAUSE' : timerSeconds < timerTotal ? 'RESUME' : 'START'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.timerCard}>
                          <Text style={[styles.timerOpenTxt, { fontFamily: Fonts.italic }]}>{dayData.silenceTxt}</Text>
                          {renderExplainerLinks('selah', ['Selah', dayData.silenceTxt])}
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              </View>

              <View
                onLayout={registerSection('act')}
                collapsable={false}
                testID="section-act"
              >
                <Pressable
                  style={({ pressed, hovered }: any) => [
                    styles.phase,
                    openPhase === 'act' && styles.phaseOpen,
                    (hovered && openPhase !== 'act') && styles.phaseHovered,
                    pressed && styles.phasePressed,
                  ]}
                  onPress={() => togglePhase('act')}
                  accessibilityRole="button"
                  accessibilityLabel={`Live It phase. ${openPhase === 'act' ? 'Expanded' : 'Collapsed'}`}
                  accessibilityState={{ expanded: openPhase === 'act' }}
                >
                  <View style={styles.phaseHdr}>
                    <View style={[styles.phaseIco, openPhase === 'act' && styles.phaseIcoOpen]}>
                      <Text style={styles.phaseIcoText}>🏃</Text>
                    </View>
                    <View style={styles.phaseHdrText}>
                      <Text style={[styles.phaseName, { fontFamily: Fonts.titleSemiBold }]}>GO & LIVE IT</Text>
                      <Text style={[styles.phaseSub, { fontFamily: Fonts.italic }]}>Take truth into your day</Text>
                    </View>
                    <Text style={[styles.phaseStepNum, { fontFamily: Fonts.titleLight }]}>07</Text>
                    <ChevronDown
                      size={14}
                      color={openPhase === 'act' ? 'rgba(200,137,74,0.65)' : 'rgba(200,137,74,0.32)'}
                      style={[styles.phaseChev, openPhase === 'act' && styles.phaseChevOpen]}
                    />
                  </View>

                  {openPhase === 'act' && (
                    <View style={styles.phaseBody}>
                      <View style={styles.phaseBodyBorder} />
                      <View style={styles.actCard}>
                        <Text style={[styles.actTxt, { fontFamily: Fonts.serifMedium }]}>{dayData.act}</Text>
                        {renderExplainerLinks('act', [dayData.act])}
                        {isSecondPass && (
                          <View style={styles.reflectivePrompt}>
                            <View style={styles.reflectiveDivider} />
                            <Text style={[styles.reflectiveLabel, { fontFamily: Fonts.titleSemiBold }]}>SECOND PASS REFLECTION</Text>
                            <Text style={[styles.reflectiveText, { fontFamily: Fonts.italic }]}>What did I notice this time?</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>

              <View onLayout={registerSection('verse')} collapsable={false} testID="section-verse">
              <View style={styles.verseBar}>
                <Text style={styles.verseIcon}>📜</Text>
                <View style={styles.verseTextWrap}>
                  <Text style={[styles.verseText, { fontFamily: Fonts.italic }]}>{dayData.verse}</Text>
                  {renderExplainerLinks('verse', [dayData.verse])}
                </View>
              </View>
              </View>

              <AnimatedPressable
                style={styles.completeBtn}
                onPress={handleComplete}
                scaleValue={0.96}
                hapticStyle={Haptics.ImpactFeedbackStyle.Medium}
                testID="complete-day"
              >
                <LinearGradient
                  colors={['#D49550', '#A86B2A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.completeBtnGradient}
                >
                  <Text style={[styles.completeBtnText, { fontFamily: Fonts.titleMedium }]}>
                    {isReplay ? 'FINISH REVISITING ✓' : `MARK DAY ${activeDay} COMPLETE ✓`}
                  </Text>
                </LinearGradient>
              </AnimatedPressable>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </View>

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

      {/* Hidden view for image capturing */}
      <View style={{ position: 'absolute', left: -5000, top: 0 }}>
        {ViewShot ? (
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>
            <View style={[styles.shareCard, { backgroundColor: C.background }]}>
            <View style={styles.shareCardTop}>
              <Text style={[styles.shareCardHeader, { fontFamily: Fonts.titleBold, color: C.accent }]}>
                DAY {completedDay} · {dayData.title.toUpperCase()}
              </Text>
            </View>
            
            <View style={styles.shareCardBody}>
              <View style={styles.shareCardSection}>
                <Text style={[styles.shareCardLabel, { fontFamily: Fonts.titleBold }]}>THE TRUTH</Text>
                <Text style={[styles.shareCardTruth, { fontFamily: Fonts.italicSemiBold, color: C.text }]}>
                  &quot;{dayData.identity}&quot;
                </Text>
              </View>

              <View style={styles.shareCardSection}>
                <View style={styles.shareCardDivider} />
                <Text style={[styles.shareCardLabel, { fontFamily: Fonts.titleBold }]}>THE WORD</Text>
                <Text style={[styles.shareCardVerse, { fontFamily: Fonts.italic, color: C.text }]}>
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
              <Text style={[styles.shareCardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>AMEN</Text>
            </View>
            </View>
          </ViewShot>
        ) : (
          <View ref={viewShotRef}>
            <View style={[styles.shareCard, { backgroundColor: C.background }]}>
              <View style={styles.shareCardTop}>
                <Text style={[styles.shareCardHeader, { fontFamily: Fonts.titleBold, color: C.accent }]}>
                  DAY {completedDay} · {dayData.title.toUpperCase()}
                </Text>
              </View>
              <View style={styles.shareCardBody} />
              <View style={styles.shareCardFooter}>
                <Text style={[styles.shareCardWatermark, { fontFamily: Fonts.titleBold, color: C.accent }]}>AMEN</Text>
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
  },
  safeArea: {
    flex: 1,
  },
  ambientTopGlowWrap: {
    position: 'absolute',
    top: -80,
    left: Math.round(Dimensions.get('window').width / 2) - 170,
    zIndex: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.7,
  },
  backText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: C.text,
  },
  modalCancel: {
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: T.scale(11),
    color: C.textMuted,
    letterSpacing: 1.5,
  },
  muteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 120,
  },
  prDayLabel: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 8,
  },
  prTitle: {
    fontSize: T.scale(40),
    lineHeight: 44,
    color: C.text,
    marginBottom: 6,
  },
  prSub: {
    fontSize: T.scale(15),
    color: C.textSecondary,
    marginBottom: 8,
  },
  prSoundscape: {
    fontSize: T.scale(10),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.68)',
    marginBottom: 24,
  },
  quickNavWrap: {
    marginBottom: 18,
  },
  quickNavContent: {
    gap: 8,
    paddingRight: 8,
  },
  quickNavChip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.14)',
    backgroundColor: C.chipBg,
  },
  quickNavChipActive: {
    borderColor: 'rgba(212,149,80,0.38)',
    backgroundColor: 'rgba(212,149,80,0.14)',
  },
  quickNavChipVisited: {
    borderColor: 'rgba(200,137,74,0.22)',
    backgroundColor: 'rgba(200,137,74,0.07)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  quickNavChipHovered: {
    borderColor: 'rgba(200,137,74,0.24)',
    backgroundColor: 'rgba(44,30,12,0.84)',
  },
  quickNavChipPressed: {
    opacity: 0.82,
  },
  quickNavChipText: {
    fontSize: T.scale(10),
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
    color: C.chipText,
  },
  quickNavChipTextActive: {
    color: C.text,
  },
  quickNavChipTextVisited: {
    color: 'rgba(200,137,74,0.7)',
  },
  phasesContainer: {
    gap: 14,
  },
  settleCard: {
    backgroundColor: 'rgba(200,137,74,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.11)',
    borderRadius: 18,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  settleCardTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  settleLbl: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 12,
    opacity: 0.85,
  },
  settleTxt: {
    fontSize: T.scale(17),
    lineHeight: 30,
    color: C.textSecondary,
  },
  phase: {
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  phaseOpen: {
    borderColor: C.phaseCardOpenBorder,
  },
  phaseHovered: {
    borderColor: 'rgba(200,137,74,0.22)',
    backgroundColor: C.phaseCardHoverBg,
  },
  phasePressed: {
    opacity: 0.85,
  },
  phaseHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 18,
    paddingBottom: 16,
  },
  phaseIco: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(200,137,74,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseIcoOpen: {
    backgroundColor: 'rgba(200,137,74,0.15)',
    borderColor: 'rgba(200,137,74,0.32)',
  },
  phaseIcoText: {
    fontSize: T.scale(15),
  },
  phaseHdrText: {
    flex: 1,
  },
  phaseName: {
    fontSize: T.scale(10),
    letterSpacing: 1.2,
    color: C.accent,
  },
  phaseSub: {
    fontSize: T.scale(13),
    color: C.textSecondary,
    marginTop: 2,
  },
  phaseChev: {
    opacity: 0.6,
  },
  phaseChevOpen: {
    transform: [{ rotate: '180deg' }],
    opacity: 1,
  },
  phaseStepNum: {
    fontSize: 11.5,
    letterSpacing: 1,
    color: 'rgba(200,137,74,0.38)',
    marginRight: 8,
  },
  phaseBody: {
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  phaseBodyBorder: {
    height: 1,
    backgroundColor: 'rgba(200,137,74,0.1)',
    marginBottom: 18,
  },
  focusText: {
    fontSize: T.scale(17),
    lineHeight: 30,
    color: C.textSecondary,
  },
  identityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  identityIcon: {
    fontSize: T.scale(20),
  },
  identityText: {
    flex: 1,
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textSecondary,
  },
  identityTextBold: {
    flex: 1,
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.accentDark,
  },
  prayCard: {
    padding: 18,
    paddingLeft: 20,
    backgroundColor: 'rgba(200,137,74,0.04)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(200,137,74,0.38)',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    position: 'relative',
  },
  prayQuote: {
    position: 'absolute',
    top: -6,
    left: 16,
    fontSize: T.scale(28),
    color: 'rgba(200,137,74,0.18)',
  },
  prayText: {
    fontSize: T.scale(17),
    lineHeight: 30,
    color: C.text,
  },
  promptCard: {
    padding: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(200,137,74,0.04)',
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: 'rgba(200,137,74,0.22)',
    borderRadius: 12,
  },
  promptText: {
    fontSize: T.scale(17),
    lineHeight: 30,
    color: C.textSecondary,
  },
  timerCard: {
    backgroundColor: C.phaseCardBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 16,
  },
  timerLbl: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    opacity: 0.85,
  },
  timerEyebrow: {
    fontSize: T.scale(14),
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: -4,
    marginBottom: 4,
  },
  timerRingWrap: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  timerRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2.5,
    borderColor: 'rgba(200,137,74,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerDisplay: {
    fontSize: T.scale(24),
    color: C.text,
  },
  timerProgressRing: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  timerProgressFill: {},
  timerTxt: {
    fontSize: T.scale(15),
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },
  timerOpenTxt: {
    fontSize: T.scale(18),
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 30,
  },
  timerBtn: {
    paddingVertical: 13,
    paddingHorizontal: 36,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.28)',
    borderRadius: 100,
  },
  timerBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: C.text,
  },
  actCard: {
    backgroundColor: 'rgba(200,137,74,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
    borderRadius: 18,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  actLbl: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 12,
  },
  actTxt: {
    fontSize: T.scale(18),
    lineHeight: 30,
    color: C.text,
  },
  verseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
    borderRadius: 14,
    padding: 16,
  },
  verseIcon: {
    fontSize: T.scale(20),
  },
  verseTextWrap: {
    flex: 1,
  },
  verseText: {
    fontSize: T.scale(15),
    lineHeight: 24,
    color: C.textSecondary,
  },
  explainerWrap: {
    marginTop: 14,
    gap: 10,
  },
  explainerEyebrow: {
    fontSize: T.scale(8),
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
    opacity: 0.88,
  },
  explainerLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  explainerLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.16)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    alignSelf: 'flex-start' as const,
  },
  explainerLinkHovered: {
    borderColor: 'rgba(200,137,74,0.28)',
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  explainerLinkPressed: {
    opacity: 0.82,
  },
  explainerLinkText: {
    fontSize: T.scale(10),
    color: C.textSecondary,
    textDecorationLine: 'underline' as const,
    textDecorationColor: 'rgba(200,137,74,0.34)',
  },
  explainerQuestionDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(200,137,74,0.14)',
  },
  explainerQuestionText: {
    fontSize: T.scale(9),
    color: C.accent,
    lineHeight: T.scale(9),
  },
  explainerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  explainerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 4, 1, 0.86)',
  },
  explainerSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 42,
  },
  explainerSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center' as const,
    marginBottom: 24,
  },
  explainerSheetTitle: {
    fontSize: T.scale(29),
    lineHeight: 34,
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  explainerSheetContext: {
    fontSize: T.scale(10),
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    marginBottom: 18,
  },
  explainerSheetBody: {
    fontSize: T.scale(18),
    lineHeight: 29,
    textAlign: 'center' as const,
  },
  explainerSheetClose: {
    marginTop: 24,
    alignSelf: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  explainerSheetCloseText: {
    fontSize: T.scale(10),
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  completeBtn: {
    borderRadius: 100,
    overflow: 'hidden',
    marginTop: 10,
  },
  completeBtnGradient: {
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnText: {
    fontSize: 14.4,
    letterSpacing: 2,
    color: '#180C02', // Dark text on gold button
  },
  recapScroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapContainer: {
    alignItems: 'stretch',
    width: '100%',
    paddingHorizontal: 12,
  },
  completeBadgeOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    alignSelf: 'center',
    backgroundColor: C.accentBg,
  },
  completeBadgeInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.1)',
  },
  completeDayLabel: {
    fontSize: T.scale(11),
    letterSpacing: 2.4,
    marginBottom: 8,
    color: C.accent,
    textTransform: 'uppercase' as const,
    textAlign: 'center',
  },
  completeTitle: {
    fontSize: T.scale(36),
    lineHeight: 42,
    letterSpacing: -0.5,
    color: C.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  completeSub: {
    fontSize: T.scale(16),
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 32,
    color: C.textSecondary,
    paddingHorizontal: 12,
  },
  milestoneCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.borderLight,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
  },
  milestoneEmoji: {
    fontSize: T.scale(28),
  },
  milestoneTextWrap: {
    flex: 1,
    gap: 4,
  },
  milestoneLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase' as const,
  },
  milestoneMessage: {
    fontSize: T.scale(15),
    lineHeight: 21,
    color: C.text,
  },
  recapActions: {
    width: '100%',
    paddingBottom: 20,
  },
  shareCard: {
    width: 1080,
    height: 1920,
    padding: 100,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 200,
  },
  shareCardTop: {
    alignItems: 'center',
  },
  shareCardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareCardFooter: {
    alignItems: 'center',
    width: '100%',
    gap: 30,
  },
  shareCardHeader: {
    fontSize: 36.8,
    letterSpacing: 6,
    textAlign: 'center',
  },
  shareCardDivider: {
    width: 100,
    height: 2,
    backgroundColor: C.accent,
    opacity: 0.25,
  },
  shareCardSection: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  shareCardLabel: {
    fontSize: 16.1,
    letterSpacing: 3,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
  },
  secondPassBanner: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.2)',
  },
  secondPassText: {
    fontSize: 11.5,
    letterSpacing: 1.5,
    color: C.accent,
  },
  reflectivePrompt: {
    marginTop: 32,
    paddingTop: 32,
    alignItems: 'center',
  },
  reflectiveDivider: {
    width: 40,
    height: 1,
    backgroundColor: C.accent,
    opacity: 0.2,
    marginBottom: 20,
  },
  reflectiveLabel: {
    fontSize: 10.4,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 8,
    opacity: 0.6,
  },
  reflectiveText: {
    fontSize: 20.7,
    color: C.textSecondary,
    textAlign: 'center',
  },
  shareCardTruth: {
    fontSize: 82.8,
    lineHeight: 96,
    textAlign: 'center',
    paddingHorizontal: 60,
  },
  shareCardVerse: {
    fontSize: 36.8,
    lineHeight: 46,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  shareCardDeclare: {
    fontSize: 41.4,
    lineHeight: 52,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  shareCardWatermark: {
    fontSize: 32.2,
    letterSpacing: 10,
  },
  shareCardAppInfo: {
    fontSize: 20.7,
    letterSpacing: 4,
    marginTop: 10,
  },

  /* ── Tomorrow Teaser ── */
  tomorrowCard: {
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    backgroundColor: 'rgba(200,137,74,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
    alignItems: 'center' as const,
  },
  tomorrowEyebrow: {
    fontSize: 10.4,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.6)',
    marginBottom: 6,
  },
  tomorrowTitle: {
    fontSize: 25.3,
    lineHeight: 28,
    color: 'rgba(244,237,224,0.8)',
    textAlign: 'center' as const,
    letterSpacing: -0.2,
  },

  /* ── Thought Capture ── */
  thoughtBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    backgroundColor: 'rgba(200,137,74,0.04)',
  },
  thoughtBtnText: {
    fontSize: 12.6,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.7)',
  },
  thoughtModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  thoughtModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 16,
  },
  thoughtModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  thoughtModalTitle: {
    fontSize: 29.9,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  thoughtModalSub: {
    fontSize: 17.3,
    lineHeight: 22,
    marginTop: -8,
  },
  thoughtInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    fontSize: 18.4,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top' as const,
  },

  /* ── Look-Back Hook ── */
  lookBackCard: {
    backgroundColor: 'rgba(200,137,74,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    alignItems: 'center' as const,
  },
  lookBackEyebrow: {
    fontSize: 10.4,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: 'rgba(200,137,74,0.6)',
    marginBottom: 8,
  },
  lookBackText: {
    fontSize: 19.5,
    lineHeight: 24,
    color: 'rgba(244,237,224,0.85)',
    textAlign: 'center' as const,
  },
});

