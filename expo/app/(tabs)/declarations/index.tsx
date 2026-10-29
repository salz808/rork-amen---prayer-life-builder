import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { deviceFallbackSpeechRate, speakText, stopSpokenAudio } from '@/services/narration';
import { Bookmark, Heart, Send, Volume2, VolumeX, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { DECLARATION_CATEGORIES, DECLARATIONS, DeclarationCategory, DeclarationItem } from '@/mocks/declarations';
import { FEELINGS, Feeling, FeelingId, getDeclarationsForFeeling } from '@/mocks/feelingDeclarations';
import { shareDeclarationWithFriend } from '@/lib/sendDeclaration';
import { getScriptureVerses } from '@/mocks/scriptureText';
import { EXPLAINERS, type ExplainerKey } from '@/mocks/explainers';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

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
  const { state, hasFeature, toggleDeclarationFavorite } = useApp();
  const favorites = useMemo<string[]>(() => state.declarationFavorites ?? [], [state.declarationFavorites]);
  // The Prayer Library used to live behind a switcher here; it now lives in
  // the Journeys screen. A legacy ?tab=library deep link simply lands here.
  const [activeFilter, setActiveFilter] = useState<DeclarationFilter>('Identity');
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingId | null>(null);
  const [selectedDeclaration, setSelectedDeclaration] = useState<DeclarationItem | null>(null);
  // When the reader is opened from the feeling-picker flow, remember the
  // feeling so "Send to a friend" can name the moment it was chosen for.
  const [readerFeeling, setReaderFeeling] = useState<Feeling | null>(null);
  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [explainerKey, setExplainerKey] = useState<ExplainerKey | null>(null);
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
    ]).start(() => {
      Animated.timing(modalTextAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [modalOverlayAnim, modalSlideAnim, modalTextAnim, selectedDeclaration]);

  useEffect(() => {
    return () => {
      // Never leave the voice reading after the screen unmounts.
      stopSpokenAudio();
    };
  }, []);

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

  const handleShareDeclaration = useCallback((item: DeclarationItem, feeling?: Feeling | null) => {
    shareDeclarationWithFriend(item, feeling);
  }, []);

  const handleOpenDeclaration = useCallback((item: DeclarationItem, feeling?: Feeling | null) => {
    if (__DEV__) {
      console.log('[Declarations] Opening reader', { id: item.id });
    }
    setSpeakError(null);
    setReaderFeeling(feeling ?? null);
    setSelectedDeclaration(item);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSpeak = useCallback((item: DeclarationItem) => {
    const voiceoverUnlocked = Boolean(hasFeature('VOICEOVER'));
    if (!voiceoverUnlocked) {
      setLockVisible(true);
      return;
    }

    // Tapping Speak while the voice is already reading stops it.
    if (speakingIdRef.current === item.id) {
      stopSpeaking();
      return;
    }

    setSpeakError(null);
    speakMutation.mutate(item);
  }, [hasFeature, speakMutation, stopSpeaking]);

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
              <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>Speak what is{`\n`}already true.</Text>
              <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>Declarations across identity, peace, healing, purpose, and more.</Text>
            </View>
          </Animated.View>

          {/* Feeling picker — one quiet question and a single row of compact
              chips; matched declarations expand inline below the chips. */}
          <Animated.View style={{ opacity: filterFadeAnim, transform: [{ translateY: filterSlideAnim }] }}>
            <View style={styles.feelingSection}>
              <Text style={[styles.feelingPrompt, { fontFamily: Fonts.italic }]}>What&apos;s weighing on you?</Text>
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
                        adjustsFontSizeToFit
                        // Floor-preserving shrink: chip base is
                        // T.scale(13) = 15.0pt effective, so 0.9 never
                        // drops below the 13.4pt floor (15.0 * 0.9 = 13.5).
                        minimumFontScale={0.9}
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
                        <Text style={[styles.scriptureText, { fontFamily: Fonts.titleRegular }]}>{item.scripture}</Text>
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
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: filterFadeAnim, transform: [{ translateY: filterSlideAnim }] }}>
            <ScrollView
              horizontal
              bounces={true}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              testID="declarations-filters"
            >
              {filterOptions.map((filter) => {
                const isActive = activeFilter === filter;
                const label = filter === 'Favorites' ? `Favorites${favoritesCount > 0 ? ` (${favoritesCount})` : ''}` : filter;

                return (
                  <AnimatedPressable
                    key={filter}
                    onPress={() => setActiveFilter(filter)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    scaleValue={0.97}
                    testID={`declarations-filter-${filter.toLowerCase()}`}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { fontFamily: isActive ? Fonts.titleSemiBold : Fonts.titleMedium },
                        isActive && styles.filterChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View style={{ opacity: sectionFadeAnim, transform: [{ translateY: sectionSlideAnim }] }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>{titleText}</Text>
                <Text style={[styles.sectionSubline, { fontFamily: Fonts.italic }]}>{subtitleText}</Text>
              </View>
              <View style={styles.sectionCountPill}>
                <Text style={[styles.sectionCount, { fontFamily: Fonts.titleMedium }]}>{filteredDeclarations.length}</Text>
              </View>
            </View>

            {filteredDeclarations.length === 0 ? (
              <View style={styles.emptyState} testID="declarations-empty-state">
                <View style={styles.emptyIconWrap}>
                  <Bookmark size={20} color={C.accentDark} />
                </View>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>No favorites yet</Text>
                <Text style={[styles.emptyCopy, { fontFamily: Fonts.italic }]}>Tap the heart on any declaration to keep it close.</Text>
              </View>
            ) : (
              filteredDeclarations.map((item, index) => {
                const isFavorite = favorites.includes(item.id);
                return (
                  <StaggerItem key={item.id} index={index}>
                    {/* Card and favorite are siblings (not nested) so web never renders a button inside a button. */}
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
                        <View style={styles.cardTopRow}>
                          <View style={styles.categoryPill}>
                            <Text style={[styles.categoryPillText, { fontFamily: Fonts.titleMedium }]}>{item.category}</Text>
                          </View>
                          <View style={styles.favoriteSpacer} />
                        </View>
                        <Text style={[styles.cardText, { fontFamily: Fonts.serifRegular }]}>{item.text}</Text>
                        <Text style={[styles.scriptureText, { fontFamily: Fonts.titleRegular }]}>{item.scripture}</Text>
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
                        >
                          <Heart
                            size={18}
                            color={isFavorite ? C.accentDark : C.iconMuted}
                            fill={isFavorite ? C.accentDark : C.transparent}
                          />
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
                  <Text style={[styles.modalBadgeText, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration?.category ?? ''}</Text>
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
                        <Text style={[styles.modalScripture, { fontFamily: Fonts.titleMedium }]}>{verse.reference}</Text>
                      </View>
                    ))
                  ) : selectedDeclaration?.scripture ? (
                    <Text style={[styles.modalScripture, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration.scripture}</Text>
                  ) : null}
                </ScrollView>
              </Animated.View>

              <View style={styles.modalFooter}>
                <View style={styles.modalFooterRow}>
                  {/* Flex wrappers must stay: AnimatedPressable applies its
                      style to an inner Pressable, so flex:1 placed on it
                      never reaches the row — the two buttons shrink-wrapped
                      to their labels and left a trailing gap instead of
                      sharing the footer width equally. */}
                  <View style={styles.footerGhostButtonWrap}>
                    <AnimatedPressable
                      onPress={() => selectedDeclaration && handleToggleFavorite(selectedDeclaration.id)}
                      style={[styles.footerGhostButton, styles.footerGhostButtonFlex]}
                      scaleValue={0.96}
                      testID="declaration-reader-favorite"
                    >
                      <Heart size={18} color={selectedIsFavorite ? C.accentDark : C.iconMuted} fill={selectedIsFavorite ? C.accentDark : C.transparent} />
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.9}
                        style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}
                      >
                        Save to Favorites
                      </Text>
                    </AnimatedPressable>
                  </View>

                  <View style={styles.footerGhostButtonWrap}>
                    <AnimatedPressable
                      onPress={() => selectedDeclaration && handleShareDeclaration(selectedDeclaration, readerFeeling)}
                      style={[styles.footerGhostButton, styles.footerGhostButtonFlex]}
                      scaleValue={0.96}
                      testID="declaration-reader-send"
                      accessibilityLabel="Send to a friend"
                    >
                      <Send size={18} color={C.accentDark} />
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.9}
                        style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}
                      >
                        Send to a Friend
                      </Text>
                    </AnimatedPressable>
                  </View>
                </View>

                <AnimatedPressable
                  onPress={() => selectedDeclaration && handleSpeak(selectedDeclaration)}
                  style={styles.speakButton}
                  scaleValue={0.96}
                  disabled={speakMutation.isPending}
                  testID="declaration-reader-speak"
                >
                  {speakingId === selectedDeclaration?.id ? (
                    <VolumeX size={18} color={C.background} />
                  ) : speakMutation.isPending ? (
                    <ActivityIndicator color={C.background} size="small" />
                  ) : (
                    <Volume2 size={18} color={C.background} />
                  )}
                  <Text style={[styles.speakButtonText, { fontFamily: Fonts.titleSemiBold }]}>
                    {speakingId === selectedDeclaration?.id ? 'Stop' : speakMutation.isPending ? 'Speaking…' : 'Speak'}
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

      <FeatureLockSheet
        visible={lockVisible}
        onClose={() => setLockVisible(false)}
        featureName="Spoken declarations"
        requirement={getFeatureRequirement('VOICEOVER')}
      />
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(14.5),
      letterSpacing: 2,
    },
    title: {
      color: C.text,
      fontSize: T.scale(34),
      lineHeight: T.scale(36),
    },
    subtitle: {
      color: C.textSecondary,
      fontSize: T.scale(15),
      lineHeight: T.scale(20),
      maxWidth: 320,
    },
    filterRow: {
      paddingBottom: 8,
      gap: 12,
    },
    feelingSection: {
      marginTop: 2,
      marginBottom: 18,
    },
    feelingPrompt: {
      fontSize: T.scale(15),
      lineHeight: T.scale(20),
      color: C.textSecondary,
      marginBottom: 10,
    },
    feelingChipRow: {
      flexDirection: 'row',
      gap: 8,
    },
    feelingChip: {
      flex: 1,
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(27),
      lineHeight: T.scale(28),
    },
    sectionSubline: {
      marginTop: 4,
      color: C.textSecondary,
      fontSize: T.scale(14.5),
      lineHeight: T.scale(20),
    },
    sectionCountPill: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.dayChipTodayBorder,
    },
    sectionCount: {
      color: C.accentDark,
      fontSize: T.scale(14.5),
      letterSpacing: 1.2,
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
      fontSize: T.scale(24),
      textAlign: 'center',
    },
    emptyCopy: {
      color: C.textSecondary,
      fontSize: T.scale(15),
      textAlign: 'center',
      lineHeight: T.scale(20),
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
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 12,
    },
    categoryPill: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: C.pillBg,
      borderWidth: 1,
      borderColor: C.pillBorder,
    },
    categoryPillText: {
      color: C.pillText,
      fontSize: T.scale(14.5),
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
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
      fontSize: T.scale(18),
      lineHeight: T.scale(24),
      marginBottom: 12,
    },
    scriptureText: {
      color: C.textSecondary,
      fontSize: T.scale(14.5),
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
      // close button) off the top of the screen. A fixed 88% keeps the
      // header — and its always-visible close control — on screen, and
      // the body ScrollView handles the overflow.
      height: '88%',
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
      paddingBottom: 24,
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(27),
      lineHeight: T.scale(34),
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(14.5),
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
      fontSize: T.scale(22),
      lineHeight: T.scale(28),
      marginBottom: 12,
    },
    explainerCardText: {
      color: C.textSecondary,
      fontSize: T.scale(16),
      lineHeight: T.scale(24),
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
      fontSize: T.scale(14.5),
      letterSpacing: 1.5,
      color: '#fff',
    },
    modalScripture: {
      color: C.textSecondary,
      fontSize: T.scale(13),
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
      marginTop: 8,
    },
    modalVerseText: {
      color: C.textSecondary,
      fontSize: T.scale(16),
      lineHeight: T.scale(24),
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
    },
    modalFooterRow: {
      flexDirection: 'row',
      gap: 12,
    },
    footerGhostButtonWrap: {
      flex: 1,
    },
    footerGhostButtonFlex: {
      flex: 1,
    },
    footerGhostButton: {
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
      fontSize: T.scale(14.5),
      letterSpacing: 0.4,
      // Shrink (never overflow the half-width button): paired with
      // numberOfLines={1} + adjustsFontSizeToFit on the label, the same
      // pattern the feeling chips use to guarantee a fit.
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
      fontSize: T.scale(14.5),
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    errorText: {
      marginTop: 16,
      color: C.rose,
      textAlign: 'center',
      fontSize: T.scale(14.5),
      lineHeight: T.scale(20),
    },
  });
}
