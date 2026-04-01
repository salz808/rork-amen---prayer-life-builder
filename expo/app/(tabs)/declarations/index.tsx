import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Heart, Volume2, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { DECLARATION_CATEGORIES, DECLARATIONS, DeclarationCategory, DeclarationItem } from '@/mocks/declarations';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { getGoogleTTSAudio } from '@/services/tts';

type DeclarationFilter = DeclarationCategory | 'Favorites';

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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const playbackRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 44, friction: 9, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

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
        console.log('[Declarations] TTS failed', error.message);
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

  return (
    <View style={styles.root} testID="declarations-screen">
      <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.surface, C.bgGradient3]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.ambientVeil2, C.ambientVeil3, C.ambientVeil4]}
        locations={[0, 0.24, 0.62, 1]}
        style={styles.ambientVeil}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="declarations-scroll"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.headerWrap}>
              <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>KINGDOM DECLARATIONS</Text>
              <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>Speak what is{`\n`}already true.</Text>
              <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>
                Browse 60 declarations across identity, peace, healing, purpose, and more.
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              testID="declarations-filters"
            >
              {filterOptions.map((filter) => {
                const isActive = activeFilter === filter;
                const label = filter === 'Favorites' ? `Favorites${favoritesCount > 0 ? ` (${favoritesCount})` : ''}` : filter;

                return (
                  <Pressable
                    key={filter}
                    onPress={() => setActiveFilter(filter)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
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
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { fontFamily: Fonts.serifRegular }]}>{titleText}</Text>
                <Text style={[styles.sectionSubline, { fontFamily: Fonts.italic }]}>{subtitleText}</Text>
              </View>
              <Text style={[styles.sectionCount, { fontFamily: Fonts.titleMedium }]}>{filteredDeclarations.length}</Text>
            </View>

            {filteredDeclarations.length === 0 ? (
              <View style={styles.emptyState} testID="declarations-empty-state">
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>No favorites yet</Text>
                <Text style={[styles.emptyCopy, { fontFamily: Fonts.italic }]}>Tap the heart on any declaration to save it here.</Text>
              </View>
            ) : (
              filteredDeclarations.map((item) => {
                const isFavorite = favorites.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleOpenDeclaration(item)}
                    style={styles.card}
                    testID={`declaration-card-${item.id}`}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.cardTopRow}>
                      <View style={styles.categoryPill}>
                        <Text style={[styles.categoryPillText, { fontFamily: Fonts.titleMedium }]}>{item.category}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleToggleFavorite(item.id)}
                        hitSlop={12}
                        style={styles.favoriteButton}
                        testID={`declaration-favorite-${item.id}`}
                      >
                        <Heart
                          size={18}
                          color={isFavorite ? C.accentDark : C.textMuted}
                          fill={isFavorite ? C.accentDark : 'transparent'}
                        />
                      </Pressable>
                    </View>
                    <Text style={[styles.cardText, { fontFamily: Fonts.serifRegular }]}>{item.text}</Text>
                    <Text style={[styles.scriptureText, { fontFamily: Fonts.titleRegular }]}>{item.scripture}</Text>
                  </Pressable>
                );
              })
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={selectedDeclaration !== null} animationType="fade" transparent onRequestClose={closeReader}>
        <View style={styles.modalRoot}>
          <LinearGradient colors={[C.bgGradient1, C.bgGradient2, C.surface, C.bgGradient3]} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <View style={styles.modalBadge}>
                <Text style={[styles.modalBadgeText, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration?.category ?? ''}</Text>
              </View>
              <Pressable onPress={closeReader} style={styles.closeButton} testID="declaration-close-reader">
                <X size={20} color={C.text} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.modalText, { fontFamily: Fonts.serifRegular }]}>{selectedDeclaration?.text ?? ''}</Text>
              <Text style={[styles.modalScripture, { fontFamily: Fonts.titleMedium }]}>{selectedDeclaration?.scripture ?? ''}</Text>
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => selectedDeclaration && handleToggleFavorite(selectedDeclaration.id)}
                style={styles.footerGhostButton}
                testID="declaration-reader-favorite"
              >
                <Heart
                  size={18}
                  color={selectedDeclaration && favorites.includes(selectedDeclaration.id) ? C.accentDark : C.textMuted}
                  fill={selectedDeclaration && favorites.includes(selectedDeclaration.id) ? C.accentDark : 'transparent'}
                />
                <Text style={[styles.footerGhostText, { fontFamily: Fonts.titleMedium }]}>Save to Favorites</Text>
              </Pressable>

              <Pressable
                onPress={() => selectedDeclaration && handleSpeak(selectedDeclaration)}
                style={styles.speakButton}
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
              </Pressable>
            </View>

            {speakError ? (
              <Text style={[styles.errorText, { fontFamily: Fonts.titleRegular }]}>{speakError}</Text>
            ) : null}
          </SafeAreaView>
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
    },
    ambientVeil: {
      ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 14,
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
      paddingBottom: 6,
      gap: 10,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: C.chipBg,
      borderWidth: 1,
      borderColor: C.chipBorder,
    },
    filterChipActive: {
      backgroundColor: C.chipActiveBg,
      borderColor: C.chipActiveBorder,
    },
    filterChipText: {
      color: C.chipText,
      fontSize: T.scale(12),
      letterSpacing: 0.6,
    },
    filterChipTextActive: {
      color: C.text,
    },
    sectionHeader: {
      marginTop: 18,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
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
    },
    sectionCount: {
      color: C.textMuted,
      fontSize: T.scale(12),
      letterSpacing: 1.2,
    },
    emptyState: {
      borderRadius: 24,
      paddingHorizontal: 22,
      paddingVertical: 28,
      backgroundColor: C.phaseCardBg,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: {
      color: C.text,
      fontSize: T.scale(24),
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
      borderRadius: 26,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 18,
      marginBottom: 14,
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
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: C.pillBg,
      borderWidth: 1,
      borderColor: C.pillBorder,
    },
    categoryPillText: {
      color: C.pillText,
      fontSize: T.scale(11),
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    favoriteButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    cardText: {
      color: C.text,
      fontSize: T.scale(23),
      lineHeight: T.scale(29),
      marginBottom: 14,
    },
    scriptureText: {
      color: C.textMuted,
      fontSize: T.scale(11.5),
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    modalRoot: {
      flex: 1,
      backgroundColor: C.background,
    },
    modalSafeArea: {
      flex: 1,
      paddingHorizontal: 22,
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 6,
    },
    modalBadge: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: C.pillBg,
      borderWidth: 1,
      borderColor: C.pillBorder,
    },
    modalBadgeText: {
      color: C.pillText,
      fontSize: T.scale(11),
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.05)',
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
      textTransform: 'uppercase',
    },
    modalFooter: {
      gap: 12,
    },
    footerGhostButton: {
      height: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.phaseCardOpenBorder,
      backgroundColor: C.phaseCardBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    footerGhostText: {
      color: C.text,
      fontSize: T.scale(13),
      letterSpacing: 0.4,
    },
    speakButton: {
      height: 56,
      borderRadius: 20,
      backgroundColor: C.accentDark,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    speakButtonText: {
      color: C.background,
      fontSize: T.scale(13),
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    errorText: {
      marginTop: 14,
      color: C.rose,
      textAlign: 'center',
      fontSize: T.scale(12.5),
      lineHeight: T.scale(17),
    },
  });
}
