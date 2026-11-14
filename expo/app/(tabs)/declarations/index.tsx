import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ScrollViewInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { deviceFallbackSpeechRate, speakText, stopSpokenAudio } from '@/services/narration';
import { Bookmark, ChevronDown, ChevronRight, ChevronUp, Heart, Send, Volume2, VolumeX, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { DECLARATION_CATEGORIES, DECLARATIONS, DeclarationCategory, DeclarationItem } from '@/mocks/declarations';
import { FEELINGS, Feeling, FeelingId, getDeclarationsForFeeling } from '@/mocks/feelingDeclarations';
import { shareDeclarationImageAsync, shareDeclarationWithFriend } from '@/lib/sendDeclaration';
import { getScriptureVerses } from '@/mocks/scriptureText';
import { EXPLAINERS, type ExplainerKey } from '@/mocks/explainers';
import { useApp } from '@/providers/AppProvider';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

// react-native-view-shot is a native module: absent on web / in Jest.
// Lazy-load like session.tsx so the screen still renders there and share
// falls back to the text message.
let ViewShot: React.ComponentType<{ ref?: React.Ref<any>; options?: { format: string; quality: number }; children?: React.ReactNode }> | null = null;
let _captureRef: ((ref: React.RefObject<any>, options?: { format: string; quality: number }) => Promise<string>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _rvs = require('react-native-view-shot');
  ViewShot = _rvs.default ?? _rvs;
  _captureRef = _rvs.captureRef;
} catch {
  ViewShot = null;
  _captureRef = null;
}

type DeclarationFilter = DeclarationCategory | 'Favorites';

/**
 * Words to know, matched against the open declaration's text — the same
 * explainer bank the session reader uses. A baby Christian should never
 * have to guess what 'break agreement' or 'the enemy' means mid-declaration.
 * Kai-approved 2026-10-26 (bundle 19, explainer matching): the reader
 * used to match only 7 keys, so a declaration mentioning grace, the
 * Holy Spirit, the Kingdom, or a covenant showed no chip at all. It
 * now mirrors the session matcher's substring rules (no section rules
 * — the reader has no movement sections), so every explainer in the
 * bank can surface here. Chips only; no declaration text changes.
 */
function getDeclarationExplainers(text: string): ExplainerKey[] {
  const normalized = text.toLowerCase();
  const keys: ExplainerKey[] = [];
  if (normalized.includes('triad')) keys.push('triad');
  if (normalized.includes('repent')) keys.push('repentance');
  if (normalized.includes('holy spirit') || normalized.includes('comforter')) keys.push('holy_spirit');
  if (normalized.includes('declare') || normalized.includes('declaration')) keys.push('declaration');
  if (normalized.includes('selah')) keys.push('selah');
  if (normalized.includes('grace') || normalized.includes('forgiven') || normalized.includes('forgiveness')) keys.push('grace');
  if (normalized.includes('intercession') || normalized.includes('intercede') || normalized.includes('someone else')) keys.push('intercession');
  if (normalized.includes('kingdom')) keys.push('kingdom_of_god');
  if (normalized.includes('promise') || normalized.includes('promises') || normalized.includes('covenant')) keys.push('covenant');
  if (normalized.includes('becoming') || normalized.includes('growth') || normalized.includes('journey')) keys.push('sanctification');
  if (
    normalized.includes('father')
    && normalized.includes('holy spirit')
    && (normalized.includes('jesus') || normalized.includes('christ'))
  ) keys.push('trinity');
  if (normalized.includes('deliver')) keys.push('deliverance');
  if (normalized.includes('generational')) keys.push('generational_curse');
  if (normalized.includes('agreement')) keys.push('break_agreement');
  if (normalized.includes('enemy')) keys.push('the_enemy');
  if (normalized.includes('in christ')) keys.push('in_christ');
  if (normalized.includes('spirit, soul') || normalized.includes('i am a spirit')) keys.push('spirit_soul_body');
  if (normalized.includes('gospel')) keys.push('gospel');
  return keys;
}

// Finding 55 — the selected topic chip gives a slight scale pop when it
// becomes active (140ms out, 180ms back). Restrained, never bouncy.
function FilterChip({
  label,
  isActive,
  onPress,
  testID,
  chipStyle,
  chipActiveStyle,
  textStyle,
  textActiveStyle,
  onLayout,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID: string;
  chipStyle: StyleProp<ViewStyle>;
  chipActiveStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  textActiveStyle: StyleProp<TextStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const scale = useState(() => new Animated.Value(1))[0];
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasActive.current = isActive;
  }, [isActive, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }} onLayout={onLayout}>
      <AnimatedPressable
        onPress={onPress}
        style={[chipStyle, isActive && chipActiveStyle]}
        scaleValue={0.97}
        testID={testID}
      >
        <Text style={[textStyle, isActive && textActiveStyle]}>{label}</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

// 4-angle audit F-08: one name for the favorite intent. The card heart
// is icon-only and the reader sheet pairs the same heart with text, so
// both surfaces name the action identically through this constant, and
// they cannot drift apart again. "Save to Favorites" is the name — it is
// the only user-facing wording that already existed, and it shares the
// word "Favorites" with the filter chip and the empty state, so the
// action and the collection read as one thing. The filled heart carries
// the saved state on both surfaces; the label itself never changes.
const FAVORITE_ACTION_LABEL = 'Save to Favorites';

// Finding 55 — the favorite heart pops (1 -> 1.35 -> 1 spring) the moment
// a declaration is saved, in the list and in the reader.
function FavoriteHeart({
  filled,
  mutedColor,
  accentColor,
}: {
  filled: boolean;
  mutedColor: string;
  accentColor: string;
}) {
  const scale = useState(() => new Animated.Value(1))[0];
  const wasFilled = useRef(filled);
  useEffect(() => {
    if (filled && !wasFilled.current) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.35,
          tension: 300,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 300,
          friction: 14,
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasFilled.current = filled;
  }, [filled, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Heart
        size={18}
        color={filled ? accentColor : mutedColor}
        fill={filled ? accentColor : 'transparent'}
      />
    </Animated.View>
  );
}

// Finding 59 — the declaration share IMAGE. Same editorial system as the
// session Share Truth image: a true 1080x1080 canvas, the TRIAD PRAYER
// logo lockup on top, the declaration as the hero, its scripture ref,
// and "Available on the App Store" at the foot (no duplicated wordmark).
// Layout revamp 2026-11-14 (shared with the session card): logo 320 wide
// (down from 460), declaration steps up to 48/56/68, 200px rule, inset
// hairline frame — the declaration owns the canvas.
// Every metric derives from the canvas width via `s`, so the on-screen
// preview and the captured 1080 export are the same design at two sizes
// (same pattern as AnsweredPrayerShareModal). Static dark palette, not
// the theme hook: the export must look identical in light and dark mode.
const SHARE_CARD_SIZE = 1080;
const SHARE_PREVIEW_SIZE = Math.min(320, Dimensions.get('window').width - 96);

function declarationShareFontSize(text: string): number {
  const len = text.length;
  if (len > 200) return 48;
  if (len > 130) return 56;
  return 68;
}

function DeclarationShareCard({ item, width }: { item: DeclarationItem; width: number }) {
  const s = width / SHARE_CARD_SIZE;
  const truthSize = declarationShareFontSize(item.text);
  return (
    <View
      style={{
        width,
        height: width,
        borderRadius: 36 * s,
        borderWidth: 1,
        borderColor: 'rgba(200,137,74,0.3)',
        overflow: 'hidden',
        backgroundColor: '#0D0804',
      }}
    >
      <LinearGradient
        colors={['#1F1409', '#0D0804']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Revamp 2026-11-14: inset hairline frame — same printed-poster edge
          as the session Share Truth card, scaled with the canvas. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 36 * s,
          left: 36 * s,
          right: 36 * s,
          bottom: 36 * s,
          borderWidth: 1,
          borderColor: 'rgba(200,137,74,0.25)',
          borderRadius: 24 * s,
        }}
      />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 84 * s,
          paddingTop: 72 * s,
          paddingBottom: 64 * s,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Image
          source={require('../../../assets/images/triad-prayer-logo.png')}
          style={{ width: 320 * s, height: 147 * s }}
          resizeMode="contain"
          accessibilityLabel="TRIAD Prayer"
        />
        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: Fonts.serifSemiBold,
              fontSize: truthSize * s,
              lineHeight: Math.round(truthSize * 1.22) * s,
              color: '#F4EDE0',
              textAlign: 'center',
            }}
          >
            &ldquo;{item.text}&rdquo;
          </Text>
          <View
            style={{
              height: 2,
              width: 200 * s,
              backgroundColor: 'rgba(200,137,74,0.5)',
              marginTop: 44 * s,
              marginBottom: 28 * s,
            }}
          />
          <Text
            style={{
              fontFamily: Fonts.titleSemiBold,
              fontSize: 26 * s,
              lineHeight: 32 * s,
              letterSpacing: 5 * s,
              color: '#C8894A',
              textAlign: 'center',
            }}
          >
            {item.scripture}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: Fonts.titleRegular,
            fontSize: 26 * s,
            lineHeight: 32 * s,
            letterSpacing: 2 * s,
            color: 'rgba(244,237,224,0.55)',
            textAlign: 'center',
          }}
        >
          Available on the App Store
        </Text>
      </View>
    </View>
  );
}

function StaggerItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useState(() => new Animated.Value(index > 4 ? 1 : 0))[0]
  const translateY = useState(() => new Animated.Value(index > 4 ? 0 : 16))[0]

  useEffect(() => {
    if (index > 4) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(16);

    const delay = index * 40;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export default function DeclarationsScreen() {
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);
  const { state, toggleDeclarationFavorite } = useApp();
  const favorites = useMemo<string[]>(() => state.declarationFavorites ?? [], [state.declarationFavorites]);
  // The Prayer Library used to live behind a switcher here; it now lives in
  // the Journeys screen. A legacy ?tab=library deep link simply lands here.
  const [activeFilter, setActiveFilter] = useState<DeclarationFilter>('Identity');
  // 4x pass: the selected chip must always be fully visible — at rest the
  // default "Identity" sat half-hidden under the scroll fade. The row
  // scrolls the active chip clear of the 110pt fade (min-scroll: only as
  // far as needed, left edge pinned to 16pt).
  const filterScrollRef = useRef<ScrollViewInstance>(null);
  const filterRowWidth = useRef(0);
  const filterScrollX = useRef(0);
  const filterChipFrames = useRef<Record<string, { x: number; width: number }>>({});
  const scrollFilterIntoView = useCallback((filter: DeclarationFilter) => {
    const frame = filterChipFrames.current[filter];
    const rowWidth = filterRowWidth.current;
    if (!frame || !rowWidth) return;
    const FADE_WIDTH = 110;
    const left = filterScrollX.current;
    const clearRight = left + rowWidth - FADE_WIDTH - 8;
    if (frame.x < left + 16) {
      filterScrollRef.current?.scrollTo({ x: Math.max(0, frame.x - 16), animated: true });
    } else if (frame.x + frame.width > clearRight) {
      filterScrollRef.current?.scrollTo({
        x: Math.max(0, frame.x + frame.width - rowWidth + FADE_WIDTH + 8),
        animated: true,
      });
    }
  }, []);
  useEffect(() => {
    scrollFilterIntoView(activeFilter);
  }, [activeFilter, scrollFilterIntoView]);
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingId | null>(null);
  // Finding 54: the feeling filter lives behind one quiet row — present
  // for someone in a hard moment, out of the way for everyone else.
  const [feelingExpanded, setFeelingExpanded] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<DeclarationItem | null>(null);
  // When the reader is opened from the feeling-picker flow, remember the
  // feeling so "Send to a friend" can name the moment it was chosen for.
  const [readerFeeling, setReaderFeeling] = useState<Feeling | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // 4x pass: the reader sheet had no now-playing UI — audio was invisible
  // except for a STOP button. While a declaration is speaking, the footer
  // shows a live strip (pulsing dot + elapsed time) and Stop becomes a
  // quiet ghost control instead of the loudest button on the sheet.
  const [speakElapsed, setSpeakElapsed] = useState(0);
  const speakPulse = useState(() => new Animated.Value(1))[0];
  const [explainerKey, setExplainerKey] = useState<ExplainerKey | null>(null);
  // Finding 59: the declaration being turned into a share image, and the
  // captured image previewed in-app before the system share sheet opens.
  const [shareCardItem, setShareCardItem] = useState<{ item: DeclarationItem; feeling: Feeling | null } | null>(null);
  const [sharePreviewUri, setSharePreviewUri] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shareCardRef = useRef<any>(null);
  const shareCapturingRef = useRef(false);
  const readerExplainers = useMemo(
    () => (selectedDeclaration ? getDeclarationExplainers(selectedDeclaration.text) : []),
    [selectedDeclaration],
  );
  const speakingIdRef = useRef<string | null>(null);
  const headerFadeAnim = useState(() => new Animated.Value(0))[0]
  const headerSlideAnim = useState(() => new Animated.Value(12))[0]
  const filterFadeAnim = useState(() => new Animated.Value(0))[0]
  const filterSlideAnim = useState(() => new Animated.Value(16))[0]
  const sectionFadeAnim = useState(() => new Animated.Value(0))[0]
  const sectionSlideAnim = useState(() => new Animated.Value(16))[0]
  const modalOverlayAnim = useState(() => new Animated.Value(0))[0]
  const modalSlideAnim = useState(() => new Animated.Value(48))[0]
  const modalTextAnim = useState(() => new Animated.Value(0))[0]

  // Finding 55 — the list cards breathe gently (one shared value, a
  // 1.2% scale over a 4.8s cycle). Skipped entirely with Reduced Motion.
  const [reduceMotion, setReduceMotion] = useState(false);
  const breathAnim = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      breathAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1.012,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathAnim, reduceMotion]);

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(headerFadeAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(filterFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(filterSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(sectionFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sectionSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [filterFadeAnim, filterSlideAnim, headerFadeAnim, headerSlideAnim, sectionFadeAnim, sectionSlideAnim]);

  // Finding 57b — PROFILED, not guessed (2026-11-10, bun, 116
  // declarations x 200 passes): getDeclarationExplainers costs
  // ~0.0017ms per call, and getScriptureVerses is a dictionary lookup —
  // neither can explain a slow open. The real cost was the animation
  // schedule: the 800ms text fade only STARTED in the sheet spring's
  // completion callback, so the declaration text did not reach full
  // opacity until ~1.3s after the tap. The text now fades in parallel
  // with the sheet (320ms) instead of chained after it.
  useEffect(() => {
    if (!selectedDeclaration) {
      modalOverlayAnim.setValue(0);
      modalSlideAnim.setValue(48);
      modalTextAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(modalOverlayAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(modalSlideAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(modalTextAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [modalOverlayAnim, modalSlideAnim, modalTextAnim, selectedDeclaration]);

  useEffect(() => {
    return () => {
      // Never leave the voice reading after the screen unmounts.
      stopSpokenAudio();
    };
  }, []);

  // Finding 59 — capture the off-screen 1080 card once it has mounted
  // and laid out, then show the in-app preview. The card unmounts when
  // the preview closes; capture failure falls back to the text message.
  useEffect(() => {
    if (!shareCardItem || shareCapturingRef.current) {
      return;
    }
    shareCapturingRef.current = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const target = shareCardRef.current;
          if (!target || !_captureRef) {
            shareDeclarationWithFriend(shareCardItem.item, shareCardItem.feeling);
            setShareCardItem(null);
            return;
          }
          const uri = await _captureRef(target, { format: 'png', quality: 1 });
          setSharePreviewUri(uri);
        } catch (error) {
          if (__DEV__) console.log('[Declarations] share capture failed, falling back to text', error);
          shareDeclarationWithFriend(shareCardItem.item, shareCardItem.feeling);
          setShareCardItem(null);
        } finally {
          shareCapturingRef.current = false;
        }
      })();
    }, 120);
    return () => {
      clearTimeout(timer);
      shareCapturingRef.current = false;
    };
  }, [shareCardItem]);

  const stopSpeaking = useCallback(() => {
    speakingIdRef.current = null;
    setSpeakingId(null);
    stopSpokenAudio();
  }, []);

  const speakMutation = useMutation({
    mutationFn: async (item: DeclarationItem) => {
      if (__DEV__) {
        console.log('[Declarations] Starting speech', { id: item.id });
      }

      // Stop anything already speaking before starting fresh.
      stopSpokenAudio();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const rate = Math.max(0.5, Math.min(2, state.playbackRate ?? 1));
      speakingIdRef.current = item.id;
      setSpeakingId(item.id);
      // Baked Helio file for this declaration when it exists; the
      // device voice remains the fallback (speakText owns it).
      // Kai-approved 2026-10-26: the fallback rate is the unified
      // deviceFallbackSpeechRate formula (services/narration.ts) —
      // the reader used to pass the uncapped baked rate as the
      // fallback rate, so the same setting sounded faster here than
      // in a session. Baked playback still uses `rate` above.
      const started = await speakText(item.text, {
        rate,
        speechRate: deviceFallbackSpeechRate(state.playbackRate),
        onDone: () => {
          if (speakingIdRef.current === item.id) {
            speakingIdRef.current = null;
            setSpeakingId(null);
          }
        },
        onError: () => {
          if (speakingIdRef.current === item.id) {
            speakingIdRef.current = null;
            setSpeakingId(null);
          }
          setSpeakError('The voice could not start. Please try again.');
        },
      });
      if (!started) {
        // Neither path could start the voice (blocked web speech,
        // missing system voice) — surface it instead of a dead button.
        if (__DEV__) console.log('[Declarations] Speech unavailable');
        speakingIdRef.current = null;
        setSpeakingId(null);
        throw new Error('The voice could not start on this device. The declaration is here to read aloud yourself.');
      }
    },
    onError: (error: Error) => {
      if (__DEV__) {
        console.log('[Declarations] Speech failed');
      }
      setSpeakError(error.message);
    },
  });

  const filterOptions = useMemo<DeclarationFilter[]>(() => {
    return ['Favorites', ...DECLARATION_CATEGORIES];
  }, []);

  const filteredDeclarations = useMemo<DeclarationItem[]>(() => {
    if (activeFilter === 'Favorites') {
      return DECLARATIONS.filter((item) => favorites.includes(item.id));
    }

    return DECLARATIONS.filter((item) => item.category === activeFilter);
  }, [activeFilter, favorites]);

  const favoritesCount = useMemo<number>(() => favorites.length, [favorites]);

  const handleToggleFavorite = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleDeclarationFavorite(id);
  }, [toggleDeclarationFavorite]);

  // Finding 59 — share starts as an IMAGE (captured off-screen, previewed
  // in-app); the text message is the fallback when view-shot is
  // unavailable (web) or the capture fails. See the capture effect above.
  const handleShareDeclaration = useCallback((item: DeclarationItem, feeling?: Feeling | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web' || !_captureRef || !ViewShot) {
      shareDeclarationWithFriend(item, feeling);
      return;
    }
    setShareCardItem({ item, feeling: feeling ?? null });
  }, []);

  const closeSharePreview = useCallback(() => {
    setSharePreviewUri(null);
    setShareCardItem(null);
  }, []);

  const confirmSharePreview = useCallback(() => {
    if (!sharePreviewUri || !shareCardItem || shareBusy) {
      return;
    }
    setShareBusy(true);
    void shareDeclarationImageAsync(sharePreviewUri, shareCardItem.item, shareCardItem.feeling).finally(() => {
      setShareBusy(false);
      closeSharePreview();
    });
  }, [sharePreviewUri, shareCardItem, shareBusy, closeSharePreview]);

  const sharePreviewAsText = useCallback(() => {
    if (!shareCardItem) {
      return;
    }
    const { item, feeling } = shareCardItem;
    closeSharePreview();
    shareDeclarationWithFriend(item, feeling);
  }, [shareCardItem, closeSharePreview]);

  const handleOpenDeclaration = useCallback((item: DeclarationItem, feeling?: Feeling | null) => {
    if (__DEV__) {
      console.log('[Declarations] Opening reader', { id: item.id });
    }
    setSpeakError(null);
    setReaderFeeling(feeling ?? null);
    setSelectedDeclaration(item);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Finding 58 — SPEAK on individual declarations is FREE for all
  // (decided judgment call, 2026-11-10). No Partner gate here, no lock
  // sheet for free/guest users. The session voiceover stays Partner-gated.
  const handleSpeak = useCallback((item: DeclarationItem) => {
    // Tapping Speak while the voice is already reading stops it.
    if (speakingIdRef.current === item.id) {
      stopSpeaking();
      return;
    }

    setSpeakError(null);
    setSpeakElapsed(0);
    speakMutation.mutate(item);
  }, [speakMutation, stopSpeaking]);

  const isSpeaking = speakingId !== null && speakingId === selectedDeclaration?.id;
  useEffect(() => {
    if (!isSpeaking) return;
    const timer = setInterval(() => setSpeakElapsed((s) => s + 1), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(speakPulse, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(speakPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(timer);
      loop.stop();
      speakPulse.setValue(1);
    };
  }, [isSpeaking, speakPulse]);

  const closeReader = useCallback(() => {
    if (__DEV__) {
      console.log('[Declarations] Closing reader');
    }
    setSelectedDeclaration(null);
    setReaderFeeling(null);
    setSpeakError(null);
    stopSpeaking();
  }, [stopSpeaking]);

  const selectedFeelingObj = useMemo<Feeling | null>(
    () => FEELINGS.find((f) => f.id === selectedFeeling) ?? null,
    [selectedFeeling],
  );

  const titleText = activeFilter === 'Favorites' ? 'Your saved declarations' : activeFilter;
  const subtitleText = activeFilter === 'Favorites'
    ? 'Return to the truths you want close at hand.'
    : 'Spoken truth rooted in scripture.';
  const selectedIsFavorite = selectedDeclaration ? favorites.includes(selectedDeclaration.id) : false;
  // One entry per cited passage, so a declaration citing two verses shows
  // each as its own quote under its own citation label — never one merged
  // block under a combined label.
  const selectedVerses = useMemo(
    () => (selectedDeclaration ? getScriptureVerses(selectedDeclaration.scripture) : []),
    [selectedDeclaration],
  );

  return (
    <View style={styles.root} testID="declarations-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Truth is declarations only now — the Prayer Library moved to the
            Journeys screen, where past days belong. */}
        <ScrollView
          bounces={true}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="declarations-scroll"
        >
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <View style={styles.headerWrap}>
              <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>KINGDOM DECLARATIONS</Text>
              <Text style={[styles.title, { fontFamily: Fonts.serifMedium }]}>Speak what is{`\n`}already true.</Text>
            </View>
          </Animated.View>

          {/* Feeling picker — finding 54: one quiet row that expands the
              four chips on tap. The filter is the fastest path to the
              right declaration for someone struggling, so it stays — but
              tucked away for everyone else. Closing the row clears the
              feeling, so the list is never silently filtered. Supporting
              lines are sans now; italic is reserved for quoted content. */}
          <Animated.View style={{ opacity: filterFadeAnim, transform: [{ translateY: filterSlideAnim }] }}>
            <View style={styles.feelingSection}>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (feelingExpanded) {
                    setSelectedFeeling(null);
                  }
                  setFeelingExpanded(!feelingExpanded);
                }}
                style={styles.feelingToggleRow}
                testID="feeling-picker-toggle"
                accessibilityRole="button"
                accessibilityState={{ expanded: feelingExpanded }}
                accessibilityLabel="What's weighing on you?"
              >
                <Text style={[styles.feelingPrompt, { fontFamily: Fonts.titleMedium }]}>
                  What&apos;s weighing on you?
                  {selectedFeelingObj ? ` · ${selectedFeelingObj.title}` : ''}
                </Text>
                {feelingExpanded ? (
                  <ChevronUp size={18} color={C.textSecondary} />
                ) : (
                  <ChevronDown size={18} color={C.textSecondary} />
                )}
              </Pressable>
              {feelingExpanded && (
                <>
              <View style={styles.feelingChipRow}>
                {FEELINGS.map((feeling) => {
                  const isActive = selectedFeeling === feeling.id;
                  return (
                    <Pressable
                      key={feeling.id}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedFeeling(isActive ? null : feeling.id);
                      }}
                      style={[styles.feelingChip, isActive && styles.feelingChipActive]}
                      testID={`feeling-${feeling.id}`}
                    >
                      <Text
                        numberOfLines={1}
                        // Wave 3: no per-chip shrink (floor rule 3). The
                        // whole row shares the button token, and the row
                        // reflows to 2x2 below so "Overwhelmed" fits at
                        // full size next to "Afraid" (#20).
                        style={[styles.feelingChipText, { fontFamily: Fonts.titleMedium }, isActive && styles.feelingChipTextActive]}
                      >
                        {feeling.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedFeeling && (
                <View style={styles.feelingResults}>
                  {getDeclarationsForFeeling(selectedFeeling).map((item) => (
                    // Card and send are siblings (not nested) so web never
                    // renders a button inside a button — same pattern as the
                    // declaration list below.
                    <View key={item.id} style={styles.feelingCardWrap}>
                      <AnimatedPressable
                        onPress={() => handleOpenDeclaration(item, selectedFeelingObj)}
                        style={styles.feelingDeclarationCard}
                        scaleValue={0.97}
                        testID={`feeling-declaration-${item.id}`}
                      >
                        <Text style={[styles.cardText, { fontFamily: Fonts.serifRegular }]}>{item.text}</Text>
                        <Text style={[styles.scriptureText, { fontFamily: Fonts.titleSemiBold }]}>{item.scripture}</Text>
                      </AnimatedPressable>
                      {/* The positioning View must stay: AnimatedPressable
                          applies its style to an inner Pressable, so absolute
                          offsets placed on it anchor to its in-flow wrapper
                          (below the card) instead of this wrap. */}
                      <View style={styles.feelingSendFloating}>
                        <AnimatedPressable
                          onPress={() => handleShareDeclaration(item, selectedFeelingObj)}
                          style={styles.floatingButton}
                          scaleValue={0.96}
                          testID={`feeling-send-${item.id}`}
                          accessibilityLabel="Send to a friend"
                        >
                          <Send size={18} color={C.accentDark} />
                        </AnimatedPressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
                </>
              )}
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: filterFadeAnim, transform: [{ translateY: filterSlideAnim }] }}>
            <View style={styles.filterRowWrap}>
              <ScrollView
                ref={filterScrollRef}
                horizontal
                bounces={true}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                testID="declarations-filters"
                scrollEventThrottle={16}
                onLayout={(e) => {
                  filterRowWidth.current = e.nativeEvent.layout.width;
                }}
                onScroll={(e) => {
                  filterScrollX.current = e.nativeEvent.contentOffset.x;
                }}
              >
                {filterOptions.map((filter) => {
                  const isActive = activeFilter === filter;
                  const label = filter === 'Favorites' ? `Favorites${favoritesCount > 0 ? ` (${favoritesCount})` : ''}` : filter;

                  return (
                    <FilterChip
                      key={filter}
                      label={label}
                      isActive={isActive}
                      onPress={() => setActiveFilter(filter)}
                      testID={`declarations-filter-${filter.toLowerCase()}`}
                      onLayout={(e) => {
                        filterChipFrames.current[filter] = {
                          x: e.nativeEvent.layout.x,
                          width: e.nativeEvent.layout.width,
                        };
                        // Mount: the default filter's layout is the first
                        // moment its frame is known — scroll it into view.
                        if (filter === activeFilter) scrollFilterIntoView(filter);
                      }}
                      chipStyle={styles.filterChip}
                      chipActiveStyle={styles.filterChipActive}
                      textStyle={[
                        styles.filterChipText,
                        { fontFamily: isActive ? Fonts.titleSemiBold : Fonts.titleMedium },
                      ]}
                      textActiveStyle={styles.filterChipTextActive}
                    />
                  );
                })}
              </ScrollView>
              {/* Finding 61 (HARD REQUIREMENT): the scroll must be
                  obvious. The old 72pt single-stop fade was too subtle to
                  read, so the row now carries a wider 110pt fade that goes
                  solid for its last 40%, plus a chevron cue pinned at the
                  right edge — the row never presents a clean edge. The
                  120pt right padding lets the last chip scroll clear of
                  the fade at rest, so a peeking partial chip stays visible
                  while there is more to scroll to. */}
              <LinearGradient
                colors={[C.transparent, C.background, C.background]}
                locations={[0, 0.6, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.filterRowFade}
                pointerEvents="none"
              />
              <View style={styles.filterRowMoreCue} pointerEvents="none">
                <ChevronRight size={18} color={C.accentDark} />
              </View>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: sectionFadeAnim, transform: [{ translateY: sectionSlideAnim }] }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>{titleText}</Text>
                <Text style={[styles.sectionSubline, { fontFamily: Fonts.titleRegular }]}>{subtitleText}</Text>
              </View>
            </View>

            {filteredDeclarations.length === 0 ? (
              <View style={styles.emptyState} testID="declarations-empty-state">
                <View style={styles.emptyIconWrap}>
                  <Bookmark size={20} color={C.accentDark} />
                </View>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>No favorites yet</Text>
                <Text style={[styles.emptyCopy, { fontFamily: Fonts.titleRegular }]}>Tap the heart on any declaration to keep it close.</Text>
              </View>
            ) : (
              filteredDeclarations.map((item, index) => {
                const isFavorite = favorites.includes(item.id);
                return (
                  // Finding 55: the key carries the filter, so changing
                  // topics remounts the list and the cards fade/slide in
                  // again instead of swapping silently.
                  <StaggerItem key={`${activeFilter}-${item.id}`} index={index}>
                    {/* Card and favorite are siblings (not nested) so web never renders a button inside a button. */}
                    {/* Finding 55: the shared breathAnim gives every card
                        a gentle 1.2% breathe (skipped with Reduced Motion). */}
                    <Animated.View style={{ transform: [{ scale: breathAnim }] }}>
                    <View style={styles.cardWrap}>
                      <AnimatedPressable
                        onPress={() => handleOpenDeclaration(item)}
                        style={styles.card}
                        scaleValue={0.97}
                        testID={`declaration-card-${item.id}`}
                      >
                        <LinearGradient
                          colors={[C.overlayLight, C.transparent]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        {/* 4x pass: the per-card category pill is gone — the
                            section header already names the topic, so the
                            pill repeated "Identity" a fourth time on screen.
                            The spacer stays: it reserves the 44pt the
                            floating heart/share buttons occupy, so the text
                            never runs under them. */}
                        <View style={styles.cardTopRow}>
                          <View style={styles.favoriteSpacer} />
                        </View>
                        <Text style={[styles.cardText, { fontFamily: Fonts.serifRegular }]}>{item.text}</Text>
                        <Text style={[styles.scriptureText, { fontFamily: Fonts.titleSemiBold }]}>{item.scripture}</Text>
                      </AnimatedPressable>
                      {/* Positioning Views must stay (see the feeling-card
                          note above): they are the direct children of
                          cardWrap, so their absolute offsets anchor to the
                          card — the AnimatedPressables inside stay in flow. */}
                      <View style={styles.favoriteFloating}>
                        <AnimatedPressable
                          onPress={() => handleToggleFavorite(item.id)}
                          style={styles.floatingButton}
                          scaleValue={0.96}
                          testID={`declaration-favorite-${item.id}`}
                          accessibilityLabel={FAVORITE_ACTION_LABEL}
                        >
                          <FavoriteHeart filled={isFavorite} mutedColor={C.iconMuted} accentColor={C.accentDark} />
                        </AnimatedPressable>
                      </View>
                      <View style={styles.shareFloating}>
                        <AnimatedPressable
                          onPress={() => handleShareDeclaration(item)}
                          style={styles.floatingButton}
                          scaleValue={0.96}
                          testID={`declaration-share-${item.id}`}
                        >
                          <Send size={18} color={C.accentDark} />
                        </AnimatedPressable>
                      </View>
                    </View>
                    </Animated.View>
                  </StaggerItem>
                );
              })
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={selectedDeclaration !== null} animationType="none" transparent onRequestClose={closeReader}>
        <Animated.View style={[styles.modalRoot, { opacity: modalOverlayAnim }]}> 
          <LinearGradient colors={[C.overlay, C.overlay]} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: modalSlideAnim }] }]}> 
            <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
              locations={[0, 0.24, 0.62, 1]}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.modalHeader}>
                <View style={styles.modalBadge}>
                  <Text style={[styles.modalBadgeText, { fontFamily: Fonts.titleSemiBold }]}>{selectedDeclaration?.category ?? ''}</Text>
                </View>
                <AnimatedPressable onPress={closeReader} style={styles.closeButton} scaleValue={0.96} testID="declaration-close-reader">
                  <X size={20} color={C.text} />
                </AnimatedPressable>
              </View>

              <Animated.View style={[styles.modalBodyWrap, { opacity: modalTextAnim, transform: [{ translateY: Animated.multiply(modalTextAnim, -20) }] }]}> 
                <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  <Text style={[styles.modalText, { fontFamily: Fonts.serifRegular }]}>{selectedDeclaration?.text ?? ''}</Text>
                  {readerExplainers.length > 0 && (
                    <View style={styles.explainerWrap} testID="declaration-explainer-row">
                      <View style={styles.explainerLinksRow}>
                        {readerExplainers.map((key) => (
                          <Pressable
                            key={key}
                            onPress={() => setExplainerKey(key)}
                            style={styles.explainerLink}
                            testID={`declaration-explainer-${key}`}
                          >
                            <Text style={[styles.explainerLinkText, { fontFamily: Fonts.titleMedium }]}>{EXPLAINERS[key].term}</Text>
                            <View style={styles.explainerQuestionDot}>
                              <Text style={[styles.explainerQuestionText, { fontFamily: Fonts.titleBold }]}>?</Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                  {selectedVerses.length > 0 ? (
                    selectedVerses.map((verse, verseIndex) => (
                      <View key={verse.reference}>
                        <Text
                          style={[
                            styles.modalVerseText,
                            { fontFamily: Fonts.serifRegular },
                            verseIndex > 0 && styles.modalVerseTextNext,
                          ]}
                        >
                          “{verse.text}”
                        </Text>
                        <Text style={[styles.modalScripture, { fontFamily: Fonts.titleSemiBold }]}>{verse.reference}</Text>
                      </View>
                    ))
                  ) : selectedDeclaration?.scripture ? (
                    <Text style={[styles.modalScripture, { fontFamily: Fonts.titleSemiBold }]}>{selectedDeclaration.scripture}</Text>
                  ) : null}
                </ScrollView>
              </Animated.View>

              <View style={styles.modalFooter}>
                {/* 4x pass: the now-playing strip — while the voice is
                    reading, the sheet says so (pulsing dot + elapsed
                    time). The audio used to be invisible except for STOP. */}
                {isSpeaking && (
                  <View style={styles.nowPlaying}>
                    <Animated.View style={[styles.nowPlayingDot, { opacity: speakPulse }]} />
                    <Text style={[styles.nowPlayingText, { fontFamily: Fonts.titleMedium }]}>
                      Speaking…
                    </Text>
                    <Text style={[styles.nowPlayingTime, { fontFamily: Fonts.titleMedium }]}>
                      {`${Math.floor(speakElapsed / 60)}:${String(speakElapsed % 60).padStart(2, '0')}`}
                    </Text>
                  </View>
                )}
                {/* Finding 57a: the two ghost buttons STACK full-width now.
                    Side by side at half width, "Save to Favorites" /
                    "Send to a Friend" clipped to "Save to Fav…" /
                    "Send to a F…". Stacked, both labels fit in full. */}
                <View style={styles.modalFooterRow}>
                  <View style={styles.footerGhostButtonWrap}>
                    <AnimatedPressable
                      onPress={() => selectedDeclaration && handleToggleFavorite(selectedDeclaration.id)}
                      style={styles.footerGhostButton}
                      scaleValue={0.96}
                      testID="declaration-reader-favorite"
                    >
                      <FavoriteHeart filled={selectedIsFavorite} mutedColor={C.iconMuted} accentColor={C.accentDark} />
                      <Text
                        numberOfLines={1}
                        style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}
                      >
                        {FAVORITE_ACTION_LABEL}
                      </Text>
                    </AnimatedPressable>
                  </View>

                  <View style={styles.footerGhostButtonWrap}>
                    <AnimatedPressable
                      onPress={() => selectedDeclaration && handleShareDeclaration(selectedDeclaration, readerFeeling)}
                      style={styles.footerGhostButton}
                      scaleValue={0.96}
                      testID="declaration-reader-send"
                      accessibilityLabel="Send to a friend"
                    >
                      <Send size={18} color={C.accentDark} />
                      <Text
                        numberOfLines={1}
                        style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}
                      >
                        Send to a Friend
                      </Text>
                    </AnimatedPressable>
                  </View>
                </View>

                {/* 4x pass: while speaking, Stop is a quiet ghost control —
                    the playing state lives in the strip above. While idle,
                    Speak is the amber primary, as before. */}
                <AnimatedPressable
                  onPress={() => selectedDeclaration && handleSpeak(selectedDeclaration)}
                  style={isSpeaking ? styles.footerGhostButton : styles.speakButton}
                  scaleValue={0.96}
                  disabled={speakMutation.isPending}
                  testID="declaration-reader-speak"
                >
                  {isSpeaking ? (
                    <VolumeX size={18} color={C.accentDark} />
                  ) : speakMutation.isPending ? (
                    <ActivityIndicator color={C.background} size="small" />
                  ) : (
                    <Volume2 size={18} color={C.background} />
                  )}
                  <Text style={[isSpeaking ? styles.footerGhostText : styles.speakButtonText, { fontFamily: Fonts.titleSemiBold }]}>
                    {isSpeaking ? 'Stop' : speakMutation.isPending ? 'Speaking…' : 'Speak'}
                  </Text>
                </AnimatedPressable>
              </View>

              {speakError ? (
                <Text style={[styles.errorText, { fontFamily: Fonts.titleRegular }]}>{speakError}</Text>
              ) : null}
            </SafeAreaView>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={explainerKey !== null} animationType="fade" transparent onRequestClose={() => setExplainerKey(null)}>
        <View style={styles.explainerModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExplainerKey(null)} />
          <View style={styles.explainerCard}>
            <Text style={[styles.explainerCardTerm, { fontFamily: Fonts.serifRegular }]}>
              {explainerKey ? EXPLAINERS[explainerKey].term : ''}
            </Text>
            <Text style={[styles.explainerCardText, { fontFamily: Fonts.serifRegular }]}>
              {explainerKey ? EXPLAINERS[explainerKey].explanation : ''}
            </Text>
            <AnimatedPressable
              onPress={() => setExplainerKey(null)}
              style={styles.explainerDoneBtn}
              scaleValue={0.97}
              testID="declaration-explainer-done"
            >
              <Text style={[styles.explainerDoneText, { fontFamily: Fonts.titleBold }]}>GOT IT</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>

      {/* Finding 59 — share preview: the captured 1080 card, shown in-app
          before the system share sheet opens, so the user sees what leaves
          the phone. The SHARE button is explicit full-width (finding 32's
          sliver-button class: never let a button's width resolve from its
          content inside a centered modal). "Share as text instead" keeps
          the text message as the secondary path. */}
      <Modal visible={sharePreviewUri != null} transparent animationType="fade" onRequestClose={closeSharePreview}>
        <View style={styles.sharePreviewRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSharePreview} testID="declaration-share-preview-backdrop" />
          <View style={[styles.sharePreviewCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.sharePreviewTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              Your declaration, ready to share
            </Text>
            {sharePreviewUri ? (
              <Image source={{ uri: sharePreviewUri }} style={styles.sharePreviewImage} resizeMode="contain" testID="declaration-share-preview-image" />
            ) : null}
            <AnimatedPressable
              onPress={confirmSharePreview}
              style={styles.sharePreviewButton}
              scaleValue={0.97}
              disabled={shareBusy}
              testID="declaration-share-preview-share"
            >
              <Text style={[styles.sharePreviewButtonText, { fontFamily: Fonts.titleSemiBold }]}>
                {shareBusy ? 'Preparing…' : 'Share'}
              </Text>
            </AnimatedPressable>
            <Pressable onPress={sharePreviewAsText} style={styles.sharePreviewAlt} testID="declaration-share-preview-text-instead">
              <Text style={[styles.sharePreviewAltText, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>Share as text instead</Text>
            </Pressable>
            <Pressable onPress={closeSharePreview} style={styles.sharePreviewAlt} testID="declaration-share-preview-cancel">
              <Text style={[styles.sharePreviewAltText, { fontFamily: Fonts.titleMedium, color: C.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Finding 59 — hidden off-screen capture target for the 1080 share
          card. Mounted only while a share is being prepared (see the
          capture effect); same left:-5000 pattern as the session card. */}
      {shareCardItem && ViewShot ? (
        <View style={styles.shareCaptureWrap} pointerEvents="none">
          <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1.0 }}>
            <DeclarationShareCard item={shareCardItem.item} width={SHARE_CARD_SIZE} />
          </ViewShot>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(C: ReturnType<typeof useColors>, T: ReturnType<typeof useTypography>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
      overflow: 'hidden' as const,
    },
    ambientVeil: {
      ...absoluteFillObject,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      // Clearance for the floating tab bar (~100pt incl. its bottom offset)
      // plus breathing room, so the last card never rests underneath it.
      paddingBottom: 176,
    },
    truthSwitchWrap: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    truthPill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 100,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    truthPillActive: {
      backgroundColor: C.accentBg,
      borderColor: C.accent,
    },
    truthPillText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 0.3,
      color: C.textSecondary,
    },
    truthPillTextActive: {
      color: C.accent,
    },
    headerWrap: {
      marginBottom: 20,
      gap: 8,
    },
    eyebrow: {
      color: C.accentDark,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
    },
    title: {
      color: C.text,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
    },
    filterRow: {
      paddingBottom: 8,
      paddingRight: 120,
      gap: 12,
    },
    filterRowWrap: {
      position: 'relative',
    },
    filterRowFade: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 8,
      width: 110,
    },
    // Finding 61: a chevron pinned at the right edge, above the fade, so
    // the row reads as "there is more" even before the user touches it.
    filterRowMoreCue: {
      position: 'absolute',
      right: 6,
      top: 0,
      bottom: 8,
      justifyContent: 'center',
    },
    feelingSection: {
      marginTop: 2,
      marginBottom: 18,
    },
    feelingToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
      marginBottom: 10,
    },
    feelingPrompt: {
      flex: 1,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.textSecondary,
    },
    feelingChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    feelingChip: {
      width: '48%',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      paddingVertical: 10,
      borderRadius: 100,
      backgroundColor: C.chipBg,
      borderWidth: 1,
      borderColor: C.border,
    },
    feelingChipActive: {
      backgroundColor: C.accentDark,
      borderColor: C.accentDark,
    },
    feelingChipText: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      color: C.text,
      textAlign: 'center' as const,
    },
    feelingChipTextActive: {
      color: C.bgGradient1,
    },
    feelingResults: {
      marginTop: 14,
      gap: 10,
    },
    feelingCardWrap: {
      position: 'relative',
    },
    feelingDeclarationCard: {
      paddingVertical: 16,
      paddingLeft: 16,
      // Room for the floating send button, mirroring the list cards.
      paddingRight: 64,
      borderRadius: 14,
      backgroundColor: C.phaseCardBg,
      borderWidth: 1,
      borderColor: C.accentDark,
    },
    // Positioning only — the box appearance lives on floatingButton, applied
    // to the AnimatedPressable inside this View.
    feelingSendFloating: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 44,
      height: 44,
      zIndex: 2,
    },
    floatingButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.supportRowBg,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    filterChip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: C.chipBg,
      borderWidth: 1,
      borderColor: C.chipBorder,
    },
    filterChipActive: {
      backgroundColor: C.chipActiveBg,
      borderColor: C.dayChipTodayBorder,
    },
    filterChipText: {
      color: C.chipText,
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 0.6,
    },
    filterChipTextActive: {
      color: C.accentDark,
    },
    sectionHeader: {
      marginTop: 20,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
    },
    sectionCopy: {
      flex: 1,
    },
    sectionTitle: {
      color: C.text,
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
    },
    sectionSubline: {
      marginTop: 4,
      color: C.textSecondary,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    emptyState: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 24,
      backgroundColor: C.phaseCardBg,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      alignItems: 'center',
      gap: 8,
    },
    emptyIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
      marginBottom: 4,
    },
    emptyTitle: {
      color: C.text,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
      textAlign: 'center',
    },
    emptyCopy: {
      color: C.textSecondary,
      fontSize: T.size.body,
      textAlign: 'center',
      lineHeight: T.leading.body,
    },
    cardWrap: {
      position: 'relative',
      marginBottom: 12,
    },
    card: {
      overflow: 'hidden',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: C.phaseCardBg,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      // 4x pass: the category pill is gone (the section header names the
      // topic), so the lone spacer pins right under the floating buttons.
      justifyContent: 'flex-end',
      marginBottom: 16,
      gap: 12,
    },
    favoriteSpacer: {
      width: 44,
      height: 44,
    },
    // Positioning only — see feelingSendFloating.
    favoriteFloating: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 44,
      height: 44,
      zIndex: 2,
    },
    shareFloating: {
      position: 'absolute',
      top: 16,
      right: 68,
      width: 44,
      height: 44,
      zIndex: 2,
    },
    cardText: {
      color: C.text,
      fontSize: T.size.scripture,
      lineHeight: T.leading.scripture,
      marginBottom: 12,
    },
    scriptureText: {
      color: C.textSecondary,
      fontSize: T.size.citation,
      lineHeight: T.leading.citation,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: C.overlay,
    },
    modalSheet: {
      // Fixed height, not a minimum: with minHeight alone the sheet can
      // size past the viewport when the reader's content is tall, and the
      // bottom-anchored root then pushes the header (category badge + the
      // close button) off the top of the screen. Finding 57a: 82% (was
      // 88%) so the footer — stacked buttons + SPEAK — clears the bottom
      // edge with real breathing room instead of sitting on it.
      height: '82%',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.background,
    },
    modalSafeArea: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
      marginBottom: 8,
    },
    modalBadge: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: C.pillBg,
      borderWidth: 1,
      borderColor: C.pillBorder,
    },
    modalBadgeText: {
      color: C.pillText,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 1.1,
      textTransform: 'uppercase' as const,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.supportRowBg,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    modalBodyWrap: {
      flex: 1,
    },
    modalBody: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 24,
    },
    modalText: {
      color: C.text,
      fontSize: T.size.prayerBody,
      lineHeight: T.leading.prayerBody,
      textAlign: 'left',
      marginBottom: 20,
    },
    explainerWrap: {
      marginBottom: 20,
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
      borderWidth: 1,
      borderColor: C.borderLight,
      backgroundColor: C.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      minHeight: 44,
    },
    explainerLinkText: {
      fontSize: T.size.caption,
      lineHeight: T.leading.caption,
      color: C.textSecondary,
    },
    // Lane D (PL-H13): the "?" dot scales WITH its glyph (dot
    // T.scale(14) = 16.1/19.0, radius half that, glyph T.scale(10) =
    // 13.4 floor/13.6 large), so the glyph never outgrows its dot.
    explainerQuestionDot: {
      width: T.scale(14),
      height: T.scale(14),
      borderRadius: T.scale(7),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.accent,
    },
    explainerQuestionText: {
      fontSize: T.size.caption,
      lineHeight: T.leading.caption,
      color: '#fff',
    },
    explainerModalOverlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: C.overlay,
    },
    explainerCard: {
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.borderLight,
      borderRadius: 20,
      padding: 24,
    },
    explainerCardTerm: {
      color: C.text,
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
      marginBottom: 12,
    },
    explainerCardText: {
      color: C.textSecondary,
      fontSize: T.size.scripture,
      lineHeight: T.leading.scripture,
    },
    explainerDoneBtn: {
      marginTop: 20,
      alignSelf: 'center',
      backgroundColor: C.accent,
      borderRadius: 999,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    explainerDoneText: {
      fontSize: T.size.caption,
      lineHeight: T.leading.caption,
      letterSpacing: 1.5,
      color: '#fff',
    },
    modalScripture: {
      color: C.textSecondary,
      fontSize: T.size.citation,
      lineHeight: T.leading.citation,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
      marginTop: 8,
    },
    modalVerseText: {
      color: C.textSecondary,
      fontSize: T.size.scripture,
      lineHeight: T.leading.scripture,
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
      marginBottom: 8,
    },
    modalVerseTextNext: {
      // Extra air between one verse's citation label and the next verse's
      // quote, so each passage reads as its own block.
      marginTop: 28,
    },
    modalFooter: {
      gap: 12,
      paddingBottom: 8,
    },
    modalFooterRow: {
      flexDirection: 'column',
      gap: 12,
    },
    footerGhostButtonWrap: {
      width: '100%',
    },
    footerGhostButton: {
      width: '100%',
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.phaseCardBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    footerGhostText: {
      color: C.text,
      // Wave 3: button token, not body — these are buttons, and at 15pt
      // both labels fit their half-width buttons with no per-peer shrink
      // (floor rule 3, same fix as the feeling chips).
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 0.4,
      flexShrink: 1,
      textAlign: 'center' as const,
    },
    speakButton: {
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: C.accentDark,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    speakButtonText: {
      color: C.background,
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    // 4x pass: the now-playing strip — pulsing dot + "Speaking…" + elapsed
    // time, shown while a declaration is being read aloud. The sheet
    // previously gave no sign audio was playing except the STOP button.
    nowPlaying: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.phaseCardBg,
      paddingHorizontal: 16,
    },
    nowPlayingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.accent,
    },
    nowPlayingText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.textSecondary,
    },
    nowPlayingTime: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      color: C.accentDark,
    },
    errorText: {
      marginTop: 16,
      color: C.rose,
      textAlign: 'center',
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    // Finding 59 — share preview modal (same shape as the session's).
    sharePreviewRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sharePreviewCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
      alignItems: 'center',
      gap: 12,
    },
    sharePreviewTitle: {
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
      textAlign: 'center',
    },
    sharePreviewImage: {
      width: SHARE_PREVIEW_SIZE,
      height: SHARE_PREVIEW_SIZE,
      borderRadius: 12,
    },
    sharePreviewButton: {
      width: '100%',
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: C.accentDark,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sharePreviewButtonText: {
      color: C.background,
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    sharePreviewAlt: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    sharePreviewAltText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    shareCaptureWrap: {
      position: 'absolute',
      left: -5000,
      top: 0,
    },
  });
}
