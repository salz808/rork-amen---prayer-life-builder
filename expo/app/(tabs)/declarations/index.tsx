import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Bookmark, Heart, Volume2, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { DECLARATION_CATEGORIES, DECLARATIONS, DeclarationCategory, DeclarationItem } from '@/mocks/declarations';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { getGoogleTTSAudio } from '@/services/tts';

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
  const [activeFilter, setActiveFilter] = useState<DeclarationFilter>('Identity');
  const [selectedDeclaration, setSelectedDeclaration] = useState<DeclarationItem | null>(null);
  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const filterFadeAnim = useRef(new Animated.Value(0)).current;
  const filterSlideAnim = useRef(new Animated.Value(16)).current;
  const sectionFadeAnim = useRef(new Animated.Value(0)).current;
  const sectionSlideAnim = useRef(new Animated.Value(16)).current;
  const modalOverlayAnim = useRef(new Animated.Value(0)).current;
  const modalSlideAnim = useRef(new Animated.Value(48)).current;
  const modalTextAnim = useRef(new Animated.Value(0)).current;
  const playbackRef = useRef<Audio.Sound | null>(null);

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
      if (playbackRef.current) {
        void playbackRef.current.unloadAsync();
        playbackRef.current = null;
      }
    };
  }, []);

  const speakMutation = useMutation({
    mutationFn: async (item: DeclarationItem) => {
      if (__DEV__) {
        console.log('[Declarations] Starting TTS playback', { id: item.id });
      }

      const uri = await getGoogleTTSAudio(item.text, item.id);
      if (!uri) {
        throw new Error('Unable to generate audio right now. Please try again in a moment.');
      }

      if (playbackRef.current) {
        await playbackRef.current.unloadAsync();
        playbackRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      playbackRef.current = sound;
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || !status.didJustFinish) {
          return;
        }

        void sound.unloadAsync();
        if (playbackRef.current === sound) {
          playbackRef.current = null;
        }
      });
    },
    onError: (error: Error) => {
      if (__DEV__) {
        console.log('[Declarations] TTS failed');
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

    setSpeakError(null);
    speakMutation.mutate(item);
  }, [hasFeature, speakMutation]);

  const closeReader = useCallback(() => {
    if (__DEV__) {
      console.log('[Declarations] Closing reader');
    }
    setSelectedDeclaration(null);
    setSpeakError(null);
    if (playbackRef.current) {
      void playbackRef.current.unloadAsync();
      playbackRef.current = null;
    }
  }, []);

  const titleText = activeFilter === 'Favorites' ? 'Your saved declarations' : activeFilter;
  const subtitleText = activeFilter === 'Favorites'
    ? 'Return to the truths you want close at hand.'
    : 'Spoken truth rooted in scripture.';
  const selectedIsFavorite = selectedDeclaration ? favorites.includes(selectedDeclaration.id) : false;

  return (
    <View style={styles.root} testID="declarations-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <SafeAreaView style={styles.safeArea}>
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
                        <AnimatedPressable
                          onPress={() => handleToggleFavorite(item.id)}
                          style={styles.favoriteButton}
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
                      <Text style={[styles.cardText, { fontFamily: Fonts.serifRegular }]}>{item.text}</Text>
                      <Text style={[styles.scriptureText, { fontFamily: Fonts.titleRegular }]}>{item.scripture}</Text>
                    </AnimatedPressable>
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

              <Animated.View style={[styles.modalBody, { opacity: modalTextAnim, transform: [{ translateY: Animated.multiply(modalTextAnim, -20) }] }]}> 
                <Text style={[styles.modalText, { fontFamily: Fonts.serifRegular }]}>{selectedDeclaration?.text ?? ''}</Text>
                <Text style={[styles.modalScripture, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration?.scripture ?? ''}</Text>
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
                  {speakMutation.isPending ? (
                    <ActivityIndicator color={C.background} size="small" />
                  ) : (
                    <Volume2 size={18} color={C.background} />
                  )}
                  <Text style={[styles.speakButtonText, { fontFamily: Fonts.titleSemiBold }]}>
                    {speakMutation.isPending ? 'Speaking…' : 'Speak'}
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
      ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 140,
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
    card: {
      overflow: 'hidden',
      position: 'relative',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      marginBottom: 12,
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
    favoriteButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.supportRowBg,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    cardText: {
      color: C.text,
      fontSize: T.scale(23),
      lineHeight: T.scale(29),
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
    modalBody: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 24,
    },
    modalText: {
      color: C.text,
      fontSize: T.scale(34),
      lineHeight: T.scale(41),
      textAlign: 'left',
      marginBottom: 20,
    },
    modalScripture: {
      color: C.textSecondary,
      fontSize: T.scale(13),
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
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
