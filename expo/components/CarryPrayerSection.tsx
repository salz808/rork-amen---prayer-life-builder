import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { Fonts } from '@/constants/fonts';
import { useTypography } from '@/hooks/useTypography';
import { DatabaseService } from '@/lib/database';
import { SEED_ECHOES } from '@/mocks/echoes';
import type { CommunityEcho } from '@/types';

const GOLD = '#C8894A';

function toCommunityEcho(e: { id: string; text: string; amens: number; createdAt: string }): CommunityEcho {
  return { id: e.id, userId: null, text: e.text, amens: e.amens, createdAt: e.createdAt };
}

/**
 * Rendered inside the session's "Ask & Receive" phase. Lets the user pull an
 * unanswered community prayer request into their own prayer time — turning
 * wall browsing into actual intercession.
 */
export default function CarryPrayerSection({ isIntercessionDay = false }: { isIntercessionDay?: boolean }) {
  const { state, carryPrayer } = useApp();
  // Lane D (PL-H12): house pattern so Larger Text scales this section.
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);
  const [echoes, setEchoes] = useState<CommunityEcho[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showChooser, setShowChooser] = useState<boolean>(false);
  // Audit round 4, lane 5 (G-L2): when the live wall is unreachable or
  // empty, the rows below are canned examples — they must never render
  // indistinguishably from real community posts.
  const [usingSeeds, setUsingSeeds] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const fetched = await DatabaseService.getCommunityEchoes();
        if (cancelled) return;
        if (fetched && fetched.length > 0) {
          setEchoes(fetched);
          setUsingSeeds(false);
        } else {
          setEchoes(SEED_ECHOES.map(toCommunityEcho));
          setUsingSeeds(true);
        }
      } catch {
        if (!cancelled) {
          setEchoes(SEED_ECHOES.map(toCommunityEcho));
          setUsingSeeds(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const carriedToday = (state.carriedPrayers ?? []).find((c) => c.carriedAt.startsWith(today)) ?? null;
  const options = (echoes ?? []).filter((e) => e.id !== carriedToday?.echoId).slice(0, 10);

  if (carriedToday && !showChooser) {
    return (
      <View style={styles.carriedCard}>
        <View style={styles.headerRow}>
          <Text style={styles.doveEmoji}>🕊</Text>
          <Text style={[styles.label, { fontFamily: Fonts.titleBold }]}>YOU&apos;RE CARRYING THIS PRAYER TODAY</Text>
        </View>
        <Text style={[styles.carriedText, { fontFamily: Fonts.serifRegular }]}>&ldquo;{carriedToday.text}&rdquo;</Text>
        <Text style={[styles.carriedSub, { fontFamily: Fonts.titleLight }]}>
          Hold them before God as you pray today.
        </Text>
        <Pressable onPress={() => setShowChooser(true)} hitSlop={14} testID="carry-choose-different">
          <Text style={[styles.changeLink, { fontFamily: Fonts.titleMedium }]}>Choose a different prayer</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="rgba(200,137,74,0.6)" />
      </View>
    );
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Heart size={13} color={GOLD} strokeWidth={2.2} />
        <Text style={[styles.label, { fontFamily: Fonts.titleBold }]}>CARRY SOMEONE&apos;S PRAYER TODAY</Text>
      </View>
      <Text style={[styles.sub, { fontFamily: Fonts.italic }]}>
        Someone in this community is waiting to be prayed for.
      </Text>
      {usingSeeds && (
        <Text style={[styles.intercessionNote, { fontFamily: Fonts.italic }]}>
          The live wall couldn&apos;t be reached, so these are examples — not live requests from the community.
        </Text>
      )}
      {isIntercessionDay && (
        <Text style={[styles.intercessionNote, { fontFamily: Fonts.italic }]}>
          This is intercession. That means standing before God on someone else&apos;s behalf.
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
      >
        {options.map((echo) => (
          <View key={echo.id} style={styles.optionCard}>
            <Text style={[styles.optionText, { fontFamily: Fonts.serifRegular }]} numberOfLines={5}>
              &ldquo;{echo.text}&rdquo;
            </Text>
            <View style={styles.optionFooter}>
              <Text style={[styles.optionAmens, { fontFamily: Fonts.titleMedium }]}>🙏 {echo.amens}</Text>
              <Pressable
                style={({ pressed }: any) => [styles.carryBtn, pressed && styles.carryBtnPressed]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  carryPrayer({ id: echo.id, text: echo.text, amens: echo.amens });
                  setShowChooser(false);
                }}
                testID={`carry-echo-${echo.id}`}
              >
                <Text style={[styles.carryBtnText, { fontFamily: Fonts.titleBold }]}>CARRY</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(T: any) {
  return StyleSheet.create({
  wrap: {
    marginTop: 16,
    backgroundColor: 'rgba(200,137,74,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.22)',
    borderRadius: 16,
    padding: 16,
  },
  carriedCard: {
    marginTop: 16,
    backgroundColor: 'rgba(200,137,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.35)',
    borderRadius: 16,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: T.scale(11),
    letterSpacing: 2,
    color: GOLD,
  },
  // Intentionally fixed: dove emoji glyph size, not reading text (lane D).
  doveEmoji: {
    fontSize: 13.4,
  },
  sub: {
    fontSize: T.scale(11),
    lineHeight: T.scale(17),
    color: 'rgba(244,237,224,0.8)',
    marginTop: 8,
  },
  intercessionNote: {
    fontSize: T.scale(11),
    lineHeight: T.scale(16),
    color: 'rgba(200,137,74,0.9)',
    marginTop: 6,
  },
  carousel: {
    gap: 10,
    paddingRight: 4,
    marginTop: 14,
  },
  optionCard: {
    width: 225,
    backgroundColor: '#171009',
    borderWidth: 1,
    borderColor: 'rgba(200,137,74,0.18)',
    borderRadius: 14,
    padding: 14,
  },
  optionText: {
    fontSize: T.scale(11),
    lineHeight: T.scale(17),
    color: 'rgba(244,237,224,0.85)',
  },
  optionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  optionAmens: {
    fontSize: T.scale(11),
    color: 'rgba(244,237,224,0.5)',
  },
  carryBtn: {
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  carryBtnPressed: {
    opacity: 0.75,
  },
  carryBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: '#0D0804',
  },
  carriedText: {
    fontSize: T.scale(14),
    lineHeight: T.scale(19),
    color: '#F4EDE0',
    marginTop: 10,
  },
  carriedSub: {
    fontSize: T.scale(11),
    color: 'rgba(244,237,224,0.55)',
    marginTop: 8,
  },
  changeLink: {
    fontSize: T.scale(11),
    letterSpacing: 0.5,
    color: 'rgba(200,137,74,0.85)',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  loadingRow: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  });
}
