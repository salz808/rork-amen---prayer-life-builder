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
import * as Speech from 'expo-speech';
import { Bookmark, Heart, Volume2, VolumeX, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import LibraryView from '@/components/LibraryView';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { DECLARATION_CATEGORIES, DECLARATIONS, DeclarationCategory, DeclarationItem } from '@/mocks/declarations';
import { getScriptureText } from '@/mocks/scriptureText';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

type DeclarationFilter = DeclarationCategory | 'Favorites';

function StaggerItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useRef(new Animated.Value(index > 4 ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(index > 4 ? 0 : 16)).current;

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
  const params = useLocalSearchParams<{ tab?: string }>();
  const [truthTab, setTruthTab] = useState<'declarations' | 'library'>(params.tab === 'library' ? 'library' : 'declarations');
  const [activeFilter, setActiveFilter] = useState<DeclarationFilter>('Identity');
  const [selectedDeclaration, setSelectedDeclaration] = useState<DeclarationItem | null>(null);
  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const filterFadeAnim = useRef(new Animated.Value(0)).current;
  const filterSlideAnim = useRef(new Animated.Value(16)).current;
  const sectionFadeAnim = useRef(new Animated.Value(0)).current;
  const sectionSlideAnim = useRef(new Animated.Value(16)).current;
  const modalOverlayAnim = useRef(new Animated.Value(0)).current;
  const modalSlideAnim = useRef(new Animated.Value(48)).current;
  const modalTextAnim = useRef(new Animated.Value(0)).current;

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
      Speech.stop();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    speakingIdRef.current = null;
    setSpeakingId(null);
    Speech.stop();
  }, []);

  const speakMutation = useMutation({
    mutationFn: async (item: DeclarationItem) => {
      if (__DEV__) {
        console.log('[Declarations] Starting on-device speech', { id: item.id });
      }

      // Stop anything already speaking before starting fresh.
      Speech.stop();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const rate = Math.max(0.5, Math.min(2, state.playbackRate ?? 1));
      speakingIdRef.current = item.id;
      setSpeakingId(item.id);
      try {
        Speech.speak(item.text, {
          language: 'en-US',
          rate,
          pitch: 1.0,
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
      } catch (e) {
        // Some environments (blocked web speech, missing system voice) throw
        // synchronously — surface it instead of leaving a dead button.
        if (__DEV__) console.log('[Declarations] Speech unavailable:', e);
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

  const handleOpenDeclaration = useCallback((item: DeclarationItem) => {
    if (__DEV__) {
      console.log('[Declarations] Opening reader', { id: item.id });
    }
    setSpeakError(null);
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
    setSpeakError(null);
    stopSpeaking();
  }, [stopSpeaking]);

  const titleText = activeFilter === 'Favorites' ? 'Your saved declarations' : activeFilter;
  const subtitleText = activeFilter === 'Favorites'
    ? 'Return to the truths you want close at hand.'
    : 'Spoken truth rooted in scripture.';
  const selectedIsFavorite = selectedDeclaration ? favorites.includes(selectedDeclaration.id) : false;
  const selectedVerseText = selectedDeclaration ? getScriptureText(selectedDeclaration.scripture) : null;

  return (
    <View style={styles.root} testID="declarations-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Truth holds two destinations: spoken declarations and the Prayer Library */}
        <View style={styles.truthSwitchWrap} testID="truth-switcher">
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTruthTab('declarations');
            }}
            style={[styles.truthPill, truthTab === 'declarations' && styles.truthPillActive]}
            testID="truth-tab-declarations"
          >
            <Text
              style={[
                styles.truthPillText,
                { fontFamily: truthTab === 'declarations' ? Fonts.titleBold : Fonts.titleMedium },
                truthTab === 'declarations' && styles.truthPillTextActive,
              ]}
            >
              Declarations
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTruthTab('library');
            }}
            style={[styles.truthPill, truthTab === 'library' && styles.truthPillActive]}
            testID="truth-tab-library"
          >
            <Text
              style={[
                styles.truthPillText,
                { fontFamily: truthTab === 'library' ? Fonts.titleBold : Fonts.titleMedium },
                truthTab === 'library' && styles.truthPillTextActive,
              ]}
            >
              Library
            </Text>
          </Pressable>
        </View>
        {truthTab === 'library' ? (
          <LibraryView />
        ) : (
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
              <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>Browse 60 declarations across identity, peace, healing, purpose, and more.</Text>
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
                      <AnimatedPressable
                        onPress={() => handleToggleFavorite(item.id)}
                        style={styles.favoriteFloating}
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
                  </StaggerItem>
                );
              })
            )}
          </Animated.View>
        </ScrollView>
        )}
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
                  {selectedVerseText ? (
                    <Text style={[styles.modalVerseText, { fontFamily: Fonts.serifRegular }]}>“{selectedVerseText}”</Text>
                  ) : null}
                  <Text style={[styles.modalScripture, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration?.scripture ?? ''}</Text>
                </ScrollView>
              </Animated.View>

              <View style={styles.modalFooter}>
                <AnimatedPressable
                  onPress={() => selectedDeclaration && handleToggleFavorite(selectedDeclaration.id)}
                  style={styles.footerGhostButton}
                  scaleValue={0.96}
                  testID="declaration-reader-favorite"
                >
                  <Heart size={18} color={selectedIsFavorite ? C.accentDark : C.iconMuted} fill={selectedIsFavorite ? C.accentDark : C.transparent} />
                  <Text style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}>Save to Favorites</Text>
                </AnimatedPressable>

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
      paddingBottom: 140,
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
      fontSize: T.scale(13),
      letterSpacing: 0.3,
      color: C.textMuted,
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
      fontSize: T.scale(11),
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
      fontSize: T.scale(12),
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
      fontSize: T.scale(14),
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
      fontSize: T.scale(12),
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
      fontSize: T.scale(11),
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    favoriteSpacer: {
      width: 44,
      height: 44,
    },
    favoriteFloating: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.supportRowBg,
      borderWidth: 1,
      borderColor: C.borderLight,
      zIndex: 2,
    },
    cardText: {
      color: C.text,
      fontSize: T.scale(18),
      lineHeight: T.scale(24),
      marginBottom: 12,
    },
    scriptureText: {
      color: C.textMuted,
      fontSize: T.scale(12),
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: C.overlay,
    },
    modalSheet: {
      minHeight: '88%',
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
      fontSize: T.scale(11),
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
    modalFooter: {
      gap: 12,
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
      fontSize: T.scale(13),
      letterSpacing: 0.4,
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
      fontSize: T.scale(13),
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    errorText: {
      marginTop: 16,
      color: C.rose,
      textAlign: 'center',
      fontSize: T.scale(12),
      lineHeight: T.scale(16),
    },
  });
}
