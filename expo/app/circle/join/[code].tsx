import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useColors } from '@/hooks/useColors';
import { Fonts } from '@/constants/fonts';
import GlowButton from '@/components/GlowButton';
import AnimatedPressable from '@/components/AnimatedPressable';
import { getSafeSession } from '@/lib/supabase';
import { CirclePreview } from '@/types';
import { describeCircleError, joinCircleByCode, normalizeJoinCode, previewCircle } from '@/lib/circles';

type ScreenState =
  | { phase: 'checking' }
  | { phase: 'guest' }
  | { phase: 'loading' }
  | { phase: 'ready'; preview: CirclePreview }
  | { phase: 'joining'; preview: CirclePreview }
  | { phase: 'joined'; name: string }
  | { phase: 'error'; message: string };

export default function CircleInviteScreen() {
  const router = useRouter();
  const C = useColors();
  const params = useLocalSearchParams<{ code: string }>();
  const code = normalizeJoinCode(typeof params.code === 'string' ? params.code : '');
  const [screen, setScreen] = useState<ScreenState>({ phase: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const session = await getSafeSession();
      const isRealUser = !!session?.user && session.user.is_anonymous !== true;
      if (cancelled) return;

      if (!isRealUser) {
        setScreen({ phase: 'guest' });
        return;
      }

      setScreen({ phase: 'loading' });
      try {
        const preview = await previewCircle(code);
        if (cancelled) return;
        setScreen({ phase: 'ready', preview });
      } catch (error) {
        if (cancelled) return;
        setScreen({ phase: 'error', message: describeCircleError(error) });
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleJoin = useCallback(async () => {
    if (screen.phase !== 'ready') return;
    setScreen({ phase: 'joining', preview: screen.preview });
    try {
      const circle = await joinCircleByCode(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen({ phase: 'joined', name: circle.name });
    } catch (error) {
      setScreen({ phase: 'ready', preview: screen.preview });
      Alert.alert('Couldn’t join this circle', describeCircleError(error));
    }
  }, [code, screen]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <LinearGradient
          colors={[C.background, C.surface, C.background]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <ScrollView
            bounces={true}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.badgeWrap}>
              <Text style={styles.badgeEmoji}>🕊</Text>
            </View>

            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>
              YOU’RE INVITED
            </Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              A circle is{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>
                praying for you
              </Text>
            </Text>

            {screen.phase === 'checking' || screen.phase === 'loading' || screen.phase === 'joining' ? (
              <View style={styles.card}>
                <ActivityIndicator color={C.accent} size="large" />
                <Text style={[styles.loadingText, { fontFamily: Fonts.italic }]}>
                  {screen.phase === 'joining' ? 'Adding you to the circle…' : 'Opening your invitation…'}
                </Text>
              </View>
            ) : null}

            {screen.phase === 'guest' && (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, { fontFamily: Fonts.serifRegular }]}>
                  Sign in to accept
                </Text>
                <Text style={[styles.cardBody, { fontFamily: Fonts.italic }]}>
                  This invitation is for a private prayer circle. Sign in with Apple or Google — the invite stays open on this screen.
                </Text>
                <GlowButton
                  label="SIGN IN"
                  onPress={() => router.push('/auth')}
                  variant="primary"
                  gradient={[C.accent, C.accentDark]}
                  style={{ width: '100%' }}
                />
              </View>
            )}

            {screen.phase === 'ready' && (
              <View style={styles.card}>
                <Text style={[styles.circleName, { fontFamily: Fonts.serifMedium }]} numberOfLines={2}>
                  {screen.preview.name}
                </Text>
                <Text style={[styles.circleMeta, { fontFamily: Fonts.titleLight }]}>
                  {screen.preview.memberCount} {screen.preview.memberCount === 1 ? 'member' : 'members'} · private
                </Text>
                <View style={styles.rule} />
                <Text style={[styles.cardBody, { fontFamily: Fonts.italic }]}>
                  {screen.preview.isMember
                    ? 'You’re already part of this circle. Head to the Wall to see its prayers.'
                    : 'Only members can see what’s shared inside. Requests here never appear on the public wall.'}
                </Text>
                <GlowButton
                  label={screen.preview.isMember ? 'OPEN THE WALL' : 'JOIN THIS CIRCLE'}
                  onPress={() => {
                    if (screen.phase !== 'ready') return;
                    if (screen.preview.isMember) {
                      router.replace('/journal');
                    } else {
                      void handleJoin();
                    }
                  }}
                  variant="primary"
                  gradient={[C.accent, C.accentDark]}
                  style={{ width: '100%' }}
                />
                <AnimatedPressable
                  onPress={() => router.back()}
                  style={styles.notNowBtn}
                  scaleValue={0.96}
                >
                  <Text style={[styles.notNowText, { fontFamily: Fonts.titleMedium }]}>
                    NOT NOW
                  </Text>
                </AnimatedPressable>
              </View>
            )}

            {screen.phase === 'joined' && (
              <View style={styles.card}>
                <Text style={styles.joinedEmoji}>🙏</Text>
                <Text style={[styles.cardTitle, { fontFamily: Fonts.serifRegular }]}>
                  Welcome in.
                </Text>
                <Text style={[styles.cardBody, { fontFamily: Fonts.italic }]}>
                  You’ve joined “{screen.name}”. Switch to it on the Wall whenever you want to pray for these people by name.
                </Text>
                <GlowButton
                  label="GO TO THE WALL"
                  onPress={() => router.replace('/journal')}
                  variant="primary"
                  gradient={[C.accent, C.accentDark]}
                  style={{ width: '100%' }}
                />
              </View>
            )}

            {screen.phase === 'error' && (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, { fontFamily: Fonts.serifRegular }]}>
                  This invite didn’t open
                </Text>
                <Text style={[styles.cardBody, { fontFamily: Fonts.italic }]}>
                  {screen.phase === 'error' ? screen.message : 'Please try again in a moment.'}
                </Text>
                <Text style={[styles.codeHint, { fontFamily: Fonts.titleLight }]}>
                  Invite code: {code || '—'}
                </Text>
                <GlowButton
                  label="OPEN CIRCLES"
                  onPress={() => router.replace('/circles')}
                  variant="ghost"
                  style={{ width: '100%' }}
                />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 60,
    alignItems: 'stretch',
  },
  badgeWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,116,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(180,116,53,0.28)',
    alignSelf: 'center',
    marginBottom: 28,
  },
  badgeEmoji: {
    fontSize: 38,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    color: '#B8843A',
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    color: '#1A0F06',
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(36,23,10,0.10)',
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#5A3E22',
  },
  cardTitle: {
    fontSize: 24,
    color: '#1A0F06',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A3E22',
    textAlign: 'center',
  },
  circleName: {
    fontSize: 26,
    color: '#1A0F06',
    textAlign: 'center',
  },
  circleMeta: {
    fontSize: 12,
    color: '#7A5A38',
    letterSpacing: 0.5,
  },
  rule: {
    width: 36,
    height: 1.5,
    backgroundColor: '#B8843A',
    opacity: 0.55,
  },
  joinedEmoji: {
    fontSize: 36,
  },
  codeHint: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#7A5A38',
  },
  notNowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  notNowText: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#7A5A38',
  },
});
