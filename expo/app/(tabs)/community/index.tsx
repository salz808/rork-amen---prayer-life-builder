import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  TextInput,
  Alert,
  AlertButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Plus, Users, Flag, ChevronRight } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import AnimatedPressable from '@/components/AnimatedPressable';
import { SEED_ECHOES, SEED_TESTIMONIES, Echo } from '@/mocks/echoes';
import { DatabaseService } from '@/lib/database';
import { getSafeSession } from '@/lib/supabase';
import { getMyCircles } from '@/lib/circles';
import { timeAgo } from '@/lib/timeAgo';
import type { Circle, Testimony } from '@/types';
import { absoluteFillObject } from '@/lib/absoluteFillObject';

// ── Animated echo card component ──────────────────────────────────────────────
function EchoCard({
  echo,
  isAmened,
  onAmen,
  onOptions,
  styles,
  _C,
  Fonts,
  carried = false,
}: {
  echo: Echo;
  isAmened: boolean;
  onAmen: () => void;
  onOptions?: () => void;
  styles: any;
  _C: any;
  Fonts: any;
  carried?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const countScale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (isAmened) return;

    Animated.sequence([
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.spring(scale, { toValue: 1.01, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
    ]).start();

    Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.spring(countScale, { toValue: 1.4, useNativeDriver: true, tension: 200, friction: 8 }),
      Animated.spring(countScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 10 }),
    ]).start();

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAmen();
  };

  return (
    <Animated.View style={[
      styles.echoCard,
      isAmened && styles.echoCardActive,
      { transform: [{ scale }] },
    ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          absoluteFillObject,
          {
            borderRadius: 20,
            backgroundColor: 'rgba(200,154,90,0.12)',
            opacity: glowOpacity,
          },
        ]}
      />
      <Pressable
        onPress={handlePress}
        onLongPress={onOptions}
        delayLongPress={400}
        style={{ flex: 1 }}
      >
        <View style={styles.echoHeader}>
          <Text style={styles.echoTime}>{timeAgo(echo.createdAt)}</Text>
          {isAmened && (
            <View style={styles.echoAmenedBadge}>
              <Text style={[styles.echoAmenedBadgeText, { fontFamily: Fonts.titleBold }]}>✓ PRAYED</Text>
            </View>
          )}
        </View>
        <Text style={[
          styles.echoText,
          { fontFamily: Fonts.serifRegular },
          isAmened && styles.echoTextActive,
        ]}>
          “{echo.text}”
        </Text>
        {carried && (
          <View style={styles.carriedBadge}>
            <Text style={[styles.carriedBadgeText, { fontFamily: Fonts.titleBold }]}>🕊 YOU PRAYED FOR THIS</Text>
          </View>
        )}
        <View style={styles.echoFooter}>
          <View style={[styles.amenPill, isAmened && styles.amenPillActive]}>
            <Text style={[styles.amenIcon, isAmened && styles.amenIconActive]}>🙏</Text>
            <Animated.Text style={[
              styles.amenCount,
              isAmened && styles.amenCountActive,
              { fontFamily: Fonts.titleBold, transform: [{ scale: countScale }] },
            ]}>
              {isAmened ? echo.amens + 1 : echo.amens}
            </Animated.Text>
            <Text style={[styles.amenLabel, isAmened && styles.amenCountActive, { fontFamily: Fonts.titleLight }]}>
              praying
            </Text>
          </View>
          {!isAmened && (
            <View style={styles.tapToAmenWrap}>
              <Text style={[styles.tapToAmen, { fontFamily: Fonts.titleLight }]}>Tap to say Amen</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Community tab — the Prayer Wall, Testimonies feed, and Circles.
 * One destination for everything shared; Circles are one tap away.
 */
export default function CommunityScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const { state, carriedEchoIds, markEchoAmenedLocally } = useApp();
  const [amenedEchoes, setAmenedEchoes] = useState<Set<string>>(new Set());
  const [echoes, setEchoes] = useState<Echo[]>(SEED_ECHOES);
  const [echoesLoading, setEchoesLoading] = useState(true);
  const [testimonies, setTestimonies] = useState<Testimony[]>(SEED_TESTIMONIES);
  const [testimoniesLoading, setTestimoniesLoading] = useState(true);
  const [isSharingToEchoes, setIsSharingToEchoes] = useState(false);
  const [echoInput, setEchoInput] = useState('');
  const [echoSubmitting, setEchoSubmitting] = useState(false);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [wallScope, setWallScope] = useState<string>('public');
  const [shareScope, setShareScope] = useState<string>('public');

  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(12)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const contentSlideAnim = useRef(new Animated.Value(16)).current;

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
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [contentFadeAnim, contentSlideAnim, headerFadeAnim, headerSlideAnim]);

  const handleShareToEchoes = async () => {
    if (!echoInput.trim() || echoSubmitting) return;

    const session = await getSafeSession();
    if (!session?.user || session.user.is_anonymous === true) {
      Alert.alert(
        'Sign in to share',
        'Create a free account to share your request with the community.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth') },
        ],
      );
      return;
    }

    setEchoSubmitting(true);
    try {
      const newEcho = await DatabaseService.createCommunityEcho(
        echoInput.trim(),
        shareScope === 'public' ? null : shareScope
      );
      if (!newEcho) {
        throw new Error('No prayer request was returned after saving.');
      }
      setEchoes((prev) => [{ ...newEcho, createdAt: newEcho.createdAt }, ...prev]);
      setIsSharingToEchoes(false);
      setEchoInput('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Couldn’t share your prayer', 'Your words are still here. Check your connection and try again.');
    } finally {
      setEchoSubmitting(false);
    }
  };

  // Amens saved on-device for seed posts merge with server-recorded amens.
  const mergedAmenedEchoes = useMemo(
    () => new Set([...amenedEchoes, ...(state.wallAmenedLocal ?? [])]),
    [amenedEchoes, state.wallAmenedLocal]
  );

  const handleAmenEcho = async (echoId: string) => {
    if (mergedAmenedEchoes.has(echoId)) return;
    setAmenedEchoes((prev) => new Set(prev).add(echoId));

    // Seeded/fallback posts have no server row — save the amen on this device.
    if (echoId.startsWith('seed-')) {
      markEchoAmenedLocally(echoId);
      return;
    }

    try {
      await DatabaseService.amenEcho(echoId);
    } catch {
      setAmenedEchoes((prev) => {
        const next = new Set(prev);
        next.delete(echoId);
        return next;
      });
      Alert.alert('Amen wasn’t saved', 'Check your connection and try again.');
    }
  };

  const confirmDeleteEcho = (echo: Echo) => {
    Alert.alert('Delete this request?', 'It will be removed from the wall for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await DatabaseService.deleteOwnEcho(echo.id);
              setEchoes((prev) => prev.filter((e) => e.id !== echo.id));
            } catch {
              Alert.alert("Couldn't delete this", 'Check your connection and try again.');
            }
          })();
        },
      },
    ]);
  };

  const confirmReportEcho = (echo: Echo) => {
    Alert.alert(
      'Report this request?',
      "It disappears from your wall right away and is saved for our care team's review.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await DatabaseService.reportEcho(echo.id);
                setEchoes((prev) => prev.filter((e) => e.id !== echo.id && e.userId !== echo.userId));
                Alert.alert('Thank you', 'You helped keep this space gentle for everyone.');
              } catch {
                Alert.alert("Couldn't report this", 'Check your connection and try again.');
              }
            })();
          },
        },
      ]
    );
  };

  const hideEchoAuthor = (echo: Echo) => {
    const mutedUserId = echo.userId;
    if (!mutedUserId) return;
    void (async () => {
      try {
        await DatabaseService.muteEchoAuthor(mutedUserId);
        setEchoes((prev) => prev.filter((e) => e.userId !== mutedUserId));
      } catch {
        Alert.alert("Couldn't hide these requests", 'Check your connection and try again.');
      }
    })();
  };

  // Long-press on a wall card: report, hide the author, or delete your own
  // request (App Store UGC requirement). Seeds and anonymous posts offer no menu.
  const showEchoOptions = (echo: Echo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isOwn = echo.userId != null && echo.userId === state.user?.id;
    const buttons: AlertButton[] = isOwn
      ? [
          { text: 'Delete Request', style: 'destructive', onPress: () => confirmDeleteEcho(echo) },
          { text: 'Cancel', style: 'cancel' },
        ]
      : [
          { text: 'Report', style: 'destructive', onPress: () => confirmReportEcho(echo) },
          { text: "Hide this person's requests", onPress: () => hideEchoAuthor(echo) },
          { text: 'Cancel', style: 'cancel' },
        ];
    Alert.alert('Request Options', undefined, buttons);
  };

  // Load the wall for the selected scope — the public wall or a private circle.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const scope = wallScope === 'public' ? undefined : { circleId: wallScope };
        const [dbEchoes, amenedIds] = await Promise.all([
          DatabaseService.getCommunityEchoes(scope),
          DatabaseService.getUserAmenedEchoIds(),
        ]);
        if (cancelled) return;
        if (dbEchoes.length > 0) {
          setEchoes(dbEchoes.map((e) => ({
            id: e.id,
            text: e.text,
            amens: e.amens,
            createdAt: e.createdAt,
            userId: e.userId,
          })));
        } else {
          // Circles show a true empty state; only the public wall falls back to seeds.
          setEchoes(scope ? [] : SEED_ECHOES);
        }
        setAmenedEchoes(amenedIds);
      } catch {
        // Keep whatever is on screen; circle scopes never show seed data.
        if (!cancelled && wallScope !== 'public') {
          setEchoes([]);
        }
      } finally {
        if (!cancelled) setEchoesLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [wallScope]);

  // Community testimonies — publicly shared answered prayers. Free for all;
  // shown on the public wall only (circles keep requests private).
  useEffect(() => {
    if (wallScope !== 'public') return;
    let cancelled = false;
    const load = async () => {
      try {
        const dbTestimonies = await DatabaseService.getCommunityTestimonies();
        if (!cancelled) setTestimonies(dbTestimonies.length > 0 ? dbTestimonies : SEED_TESTIMONIES);
      } catch {
        // Database unreachable — seeds keep the section from feeling broken.
        if (!cancelled) setTestimonies(SEED_TESTIMONIES);
      } finally {
        if (!cancelled) setTestimoniesLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [wallScope]);

  const confirmDeleteTestimony = (testimony: Testimony) => {
    Alert.alert('Remove this testimony?', 'It will be removed from the wall for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await DatabaseService.deleteOwnTestimony(testimony.id);
              setTestimonies((prev) => prev.filter((t) => t.id !== testimony.id));
            } catch {
              Alert.alert("Couldn't remove this", 'Check your connection and try again.');
            }
          })();
        },
      },
    ]);
  };

  const confirmReportTestimony = (testimony: Testimony) => {
    Alert.alert(
      'Report this testimony?',
      "It disappears from your wall right away and is saved for our care team's review.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await DatabaseService.reportTestimony(testimony.id);
                setTestimonies((prev) => prev.filter((t) => t.id !== testimony.id && t.userId !== testimony.userId));
                Alert.alert('Thank you', 'You helped keep this space gentle for everyone.');
              } catch {
                Alert.alert("Couldn't report this", 'Check your connection and try again.');
              }
            })();
          },
        },
      ],
    );
  };

  // Load the user's private circles for the scope switcher.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const circles = await getMyCircles();
        if (!cancelled) setMyCircles(circles);
      } catch {
        // Circles are optional — the public wall works without them.
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const openEchoComposer = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShareScope(wallScope);
    setIsSharingToEchoes(true);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[C.background, C.surface, C.background]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[C.ambientVeil1, C.transparent]}
        style={styles.ambientTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="community-scroll">
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>PRAY TOGETHER</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Never pray{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>alone.</Text>
            </Text>

            {/* Circles — one tap away, never buried */}
            <AnimatedPressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/circles');
              }}
              style={styles.circlesCard}
              scaleValue={0.97}
              testID="community-open-circles"
            >
              <View style={styles.circlesIconWrap}>
                <Users size={18} color={C.accent} strokeWidth={2.2} />
              </View>
              <View style={styles.circlesCopy}>
                <Text style={[styles.circlesTitle, { fontFamily: Fonts.titleSemiBold }]}>Prayer Circles</Text>
                <Text style={[styles.circlesSub, { fontFamily: Fonts.italic }]}>
                  {myCircles.length > 0
                    ? `${myCircles.length} circle${myCircles.length === 1 ? '' : 's'} · pray with people you know`
                    : 'Pray with people you know. Create one or join with a code.'}
                </Text>
              </View>
              <ChevronRight size={16} color={C.chevronMuted} />
            </AnimatedPressable>
            <View style={styles.rule} />
          </Animated.View>

          <Animated.View style={[styles.entriesContainer, { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }]}>
            <View style={styles.echoesHeader}>
              <Text style={[styles.echoesTitle, { fontFamily: Fonts.serifLight }]}>
                {wallScope === 'public'
                  ? 'Prayer Wall'
                  : myCircles.find((c) => c.id === wallScope)?.name ?? 'Prayer Wall'}
              </Text>
              <Text style={[styles.echoesSub, { fontFamily: Fonts.italic }]}>
                {wallScope === 'public'
                  ? 'You are not alone. Support others in prayer.'
                  : 'Private to this circle. Only members can see these prayers.'}
              </Text>
              <Pressable
                onPress={openEchoComposer}
                style={styles.requestPrayerBtn}
              >
                <Plus size={15} color={C.accent} strokeWidth={2.5} />
                <Text style={[styles.requestPrayerBtnText, { fontFamily: Fonts.titleBold }]}>REQUEST PRAYER</Text>
              </Pressable>
            </View>

            {myCircles.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeRow}
              >
                <Pressable
                  onPress={() => setWallScope('public')}
                  style={[styles.scopeChip, wallScope === 'public' && styles.scopeChipActive]}
                  testID="wall-scope-public"
                >
                  <Text
                    style={[
                      styles.scopeChipText,
                      { fontFamily: Fonts.titleSemiBold },
                      wallScope === 'public' && styles.scopeChipTextActive,
                    ]}
                  >
                    EVERYONE
                  </Text>
                </Pressable>
                {myCircles.map((circle) => (
                  <Pressable
                    key={circle.id}
                    onPress={() => setWallScope(circle.id)}
                    style={[styles.scopeChip, wallScope === circle.id && styles.scopeChipActive]}
                    testID={`wall-scope-${circle.id}`}
                  >
                    <Text
                      style={[
                        styles.scopeChipText,
                        { fontFamily: Fonts.titleSemiBold },
                        wallScope === circle.id && styles.scopeChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {circle.name.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {isSharingToEchoes && (
              <View style={styles.echoAddCard}>
                <Text style={[styles.echoAddTitle, { fontFamily: Fonts.titleBold }]}>
                  {shareScope === 'public' ? 'SHARE ANONYMOUSLY' : 'SHARE WITH YOUR CIRCLE'}
                </Text>
                <TextInput
                  style={[styles.echoAddInput, { fontFamily: Fonts.italic }]}
                  placeholder="How can the community pray for you?"
                  placeholderTextColor={C.textMuted}
                  value={echoInput}
                  onChangeText={setEchoInput}
                  multiline
                  autoFocus
                />
                {myCircles.length > 0 && (
                  <View style={styles.shareScopeWrap}>
                    <Text style={[styles.shareScopeLabel, { fontFamily: Fonts.titleSemiBold }]}>
                      SHARE WITH
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.scopeRow}
                    >
                      <Pressable
                        onPress={() => setShareScope('public')}
                        style={[styles.scopeChip, shareScope === 'public' && styles.scopeChipActive]}
                      >
                        <Text
                          style={[
                            styles.scopeChipText,
                            { fontFamily: Fonts.titleSemiBold },
                            shareScope === 'public' && styles.scopeChipTextActive,
                          ]}
                        >
                          EVERYONE
                        </Text>
                      </Pressable>
                      {myCircles.map((circle) => (
                        <Pressable
                          key={circle.id}
                          onPress={() => setShareScope(circle.id)}
                          style={[styles.scopeChip, shareScope === circle.id && styles.scopeChipActive]}
                        >
                          <Text
                            style={[
                              styles.scopeChipText,
                              { fontFamily: Fonts.titleSemiBold },
                              shareScope === circle.id && styles.scopeChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {circle.name.toUpperCase()}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
                <View style={styles.addCardActions}>
                  <Pressable onPress={() => setIsSharingToEchoes(false)}>
                    <Text style={[styles.cancelBtnText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable onPress={handleShareToEchoes} style={styles.echoSaveBtn}>
                    <Text style={[styles.saveBtnMiniText, { fontFamily: Fonts.titleBold }]}>SHARE</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {wallScope === 'public' && !testimoniesLoading && (
              <View style={styles.testimonySection}>
                <View style={styles.testimonySectionHeader}>
                  <Text style={[styles.testimonySectionTitle, { fontFamily: Fonts.serifLight }]}>
                    Testimonies
                  </Text>
                  <Text style={[styles.testimonySectionSub, { fontFamily: Fonts.italic }]}>
                    Answered prayers, shared in gratitude. First names only.
                  </Text>
                </View>
                {testimonies.map((t) => {
                  const isOwn = t.userId != null && t.userId === state.user?.id;
                  return (
                    <View key={t.id} style={styles.testimonyCard}>
                      <View style={styles.testimonyBadge}>
                        <Text style={[styles.testimonyBadgeText, { fontFamily: Fonts.titleBold }]}>🙌 ANSWERED</Text>
                      </View>
                      <Text style={[styles.testimonyRequest, { fontFamily: Fonts.serifRegular }]}>{t.request}</Text>
                      <View style={styles.testimonyAnswerBubble}>
                        <Text style={[styles.testimonyAnswer, { fontFamily: Fonts.serifRegular }]}>
                          God answered: {t.answer}
                        </Text>
                      </View>
                      <View style={styles.testimonyFooter}>
                        <Text style={[styles.testimonyName, { fontFamily: Fonts.titleMedium }]}>
                          — {t.firstName}
                        </Text>
                        <Text style={[styles.testimonyDate, { fontFamily: Fonts.titleLight }]}>{timeAgo(t.createdAt)}</Text>
                        <View style={styles.testimonyActions}>
                          {isOwn ? (
                            <Pressable
                              onPress={() => confirmDeleteTestimony(t)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              style={styles.testimonyActionBtn}
                              testID={`testimony-delete-${t.id}`}
                            >
                              <Trash2 size={15} color={C.iconMuted} />
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => confirmReportTestimony(t)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              style={styles.testimonyActionBtn}
                              testID={`testimony-report-${t.id}`}
                            >
                              <Flag size={15} color={C.iconMuted} />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {echoes.length === 0 && !isSharingToEchoes ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🙏</Text>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>Silent, for now.</Text>
                <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                  This is where you&apos;ll see and support others in their journey. Be the first to share a quiet request with the gathering.
                </Text>
                <Pressable
                  onPress={openEchoComposer}
                  style={styles.emptyActionBtn}
                >
                  <Text style={[styles.emptyActionBtnText, { fontFamily: Fonts.titleMedium }]}>SHARE A REQUEST</Text>
                </Pressable>
              </View>
            ) : (
              echoes.map(echo => {
                const isAmened = mergedAmenedEchoes.has(echo.id);
                return (
                  <EchoCard
                    key={echo.id}
                    echo={echo}
                    isAmened={isAmened}
                    carried={carriedEchoIds.has(echo.id)}
                    onAmen={() => handleAmenEcho(echo.id)}
                    onOptions={echo.userId ? () => showEchoOptions(echo) : undefined}
                    styles={styles}
                    _C={C}
                    Fonts={Fonts}
                  />
                );
              })
            )}

            <View style={styles.echoesFooterSpacer} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
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
  ambientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 0,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 150,
  },
  eyebrow: {
    fontSize: T.scale(9),
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: C.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: T.scale(34),
    lineHeight: T.scale(40),
    color: C.text,
    marginTop: 10,
    marginBottom: 14,
  },
  rule: {
    width: 44,
    height: 1.5,
    backgroundColor: C.accent,
    opacity: 0.55,
    marginTop: 8,
    marginBottom: 28,
  },
  circlesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surfaceAlt,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  circlesIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
  },
  circlesCopy: {
    flex: 1,
  },
  circlesTitle: {
    color: C.text,
    fontSize: T.scale(17),
    marginBottom: 2,
  },
  circlesSub: {
    color: C.textMuted,
    fontSize: T.scale(13),
    lineHeight: 19,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyIcon: {
    fontSize: T.scale(38),
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: T.scale(24),
    color: C.textSecondary,
  },
  emptySub: {
    fontSize: T.scale(15),
    lineHeight: 26,
    color: C.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 24,
  },
  emptyActionBtn: {
    backgroundColor: C.accentBg,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
  },
  emptyActionBtnText: {
    fontSize: T.scale(10.4),
    letterSpacing: 1.5,
    color: C.accent,
    textTransform: 'uppercase' as const,
  },
  entriesContainer: {
    gap: 16,
  },
  addCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  cancelBtnText: {
    fontSize: T.scale(10),
    color: C.textMuted,
    letterSpacing: 1,
  },
  saveBtnMiniText: {
    fontSize: T.scale(10),
    color: '#FFF',
    letterSpacing: 1,
  },
  echoesHeader: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  echoesTitle: {
    fontSize: T.scale(28),
    color: C.text,
    marginBottom: 4,
  },
  echoesSub: {
    fontSize: T.scale(14),
    color: C.accent,
    marginBottom: 16,
  },
  requestPrayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accentBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
  },
  requestPrayerBtnText: {
    fontSize: T.scale(10.5),
    letterSpacing: 1.4,
    color: C.accent,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingBottom: 14,
  },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: C.chipBg,
    borderWidth: 1,
    borderColor: C.chipBorder,
  },
  scopeChipActive: {
    backgroundColor: C.chipActiveBg,
    borderColor: C.chipActiveBorder,
  },
  scopeChipText: {
    fontSize: T.scale(10),
    letterSpacing: 1.4,
    color: C.chipText,
  },
  scopeChipTextActive: {
    color: C.accentDark,
  },
  shareScopeWrap: {
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  shareScopeLabel: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: C.textMuted,
  },
  echoCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
  },
  echoCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accentBg,
  },
  echoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  echoAmenedBadge: {
    backgroundColor: C.accentBg,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.accent,
  },
  echoAmenedBadgeText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  echoTime: {
    fontSize: T.scale(13),
    color: C.textMuted,
    letterSpacing: 1,
  },
  echoText: {
    fontSize: T.scale(18),
    lineHeight: 28,
    color: C.textSecondary,
    marginBottom: 20,
  },
  echoTextActive: {
    color: C.text,
  },
  testimonySection: {
    marginTop: 32,
  },
  testimonySectionHeader: {
    marginBottom: 16,
  },
  testimonySectionTitle: {
    fontSize: T.scale(24),
    lineHeight: T.scale(30),
    color: C.text,
  },
  testimonySectionSub: {
    fontSize: T.scale(13),
    lineHeight: 20,
    color: C.textMuted,
    marginTop: 4,
  },
  testimonyCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.15)',
    padding: 18,
    marginBottom: 12,
  },
  testimonyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,137,74,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  testimonyBadgeText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: C.accent,
  },
  testimonyRequest: {
    fontSize: T.scale(17),
    lineHeight: 26,
    color: C.text,
    marginBottom: 10,
  },
  testimonyAnswerBubble: {
    backgroundColor: 'rgba(200,137,74,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  testimonyAnswer: {
    fontSize: T.scale(15),
    lineHeight: 23,
    color: C.textSecondary,
  },
  testimonyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testimonyName: {
    fontSize: T.scale(13),
    color: C.accent,
    flex: 1,
  },
  testimonyDate: {
    fontSize: T.scale(12),
    color: C.textMuted,
    marginRight: 8,
  },
  testimonyActions: {
    flexDirection: 'row',
  },
  testimonyActionBtn: {
    padding: 6,
  },
  echoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  amenPillActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  amenIcon: {
    fontSize: 16,
    opacity: 0.5,
  },
  amenIconActive: {
    opacity: 1,
  },
  amenCount: {
    fontSize: 16,
    color: C.textSecondary,
  },
  amenCountActive: {
    color: C.accentDark,
  },
  amenLabel: {
    fontSize: T.scale(13),
    color: C.textMuted,
  },
  tapToAmenWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.border,
  },
  tapToAmen: {
    fontSize: T.scale(11),
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  echoesFooterSpacer: {
    height: 60,
  },
  echoAddCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.accent,
  },
  echoAddTitle: {
    fontSize: T.scale(9),
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 16,
  },
  echoAddInput: {
    fontSize: T.scale(18),
    lineHeight: 28,
    color: C.text,
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  echoSaveBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 100,
  },
  carriedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,137,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  carriedBadgeText: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
});
