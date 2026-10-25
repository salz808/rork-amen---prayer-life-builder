import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import AnimatedPressable from '@/components/AnimatedPressable';
import { DatabaseService } from '@/lib/database';
import { timeAgo } from '@/lib/timeAgo';
import type { HiddenWallPost } from '@/types';

/**
 * Moderator review queue (wall moderation stack, build 7).
 *
 * Lists wall posts hidden by the report auto-hide (3 distinct
 * non-anonymous reporters). Unhide restores the post to the wall and
 * archives its reports (they no longer count toward hiding, so a
 * cleared post needs a fresh threshold of new reports to hide again);
 * Delete removes the post permanently, and its reports cascade with it.
 * The list itself is moderator-only: the RPC raises for anyone else,
 * and the Settings entry point is hidden from non-moderators — both
 * gates must agree, so a deep link alone cannot open the queue.
 */
const QUEUE_PAGE_SIZE = 50;

export default function ModerationScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);

  const [phase, setPhase] = useState<'checking' | 'denied' | 'ready'>('checking');
  const [posts, setPosts] = useState<HiddenWallPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Offset is passed explicitly so this callback stays stable: a
  // posts.length dependency would refetch on focus after paging.
  const load = useCallback(async (offset = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const rows = await DatabaseService.getHiddenWallPosts({
        limit: QUEUE_PAGE_SIZE,
        offset,
      });
      setPosts((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(rows.length === QUEUE_PAGE_SIZE);
      setPhase('ready');
    } catch {
      // Either not a moderator or unreachable — both present the same
      // denied state rather than leaking which one it is.
      if (!append) setPhase('denied');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Focus-driven (not a mount effect): the queue refreshes every time the
  // moderator returns to it, and it sidesteps the set-state-in-effect rule.
  useFocusEffect(
    useCallback(() => {
      void load(0, false);
    }, [load]),
  );

  const act = useCallback(
    (post: HiddenWallPost, action: 'unhide' | 'delete') => {
      const verb = action === 'unhide' ? 'Restore this post to the wall?' : 'Delete this post permanently?';
      const detail =
        action === 'unhide'
          ? 'It becomes visible on the wall again. Its past reports are archived, so only new reports can hide it again.'
          : 'The post and its reports are gone for good.';
      Alert.alert(action === 'unhide' ? 'Restore post' : 'Delete post', `${verb}\n\n${detail}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'unhide' ? 'Restore' : 'Delete',
          style: action === 'delete' ? 'destructive' : 'default',
          onPress: () => {
            setActingId(post.id);
            void DatabaseService.moderateWallPost(post.kind, post.id, action)
              .then(() => {
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
              })
              .catch(() => {
                Alert.alert("Couldn't do that", 'Check your connection and try again.');
              })
              .finally(() => setActingId(null));
          },
        },
      ]);
    },
    [],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.root, { backgroundColor: C.background }]}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            scaleValue={0.96}
            testID="moderation-back"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={C.text} />
          </AnimatedPressable>
          <Text style={[styles.title, { color: C.text, fontFamily: Fonts.titleBold }]}>
            Review hidden posts
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {phase === 'checking' || loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : phase === 'denied' ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
              This area is for the care team.
            </Text>
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
              No hidden posts — the wall is clear.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {posts.map((post) => (
              <View
                key={post.id}
                style={[styles.card, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.kind, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>
                    {post.kind === 'echo' ? 'PRAYER REQUEST' : 'TESTIMONY'}
                  </Text>
                  <Text style={[styles.meta, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
                    {post.reportCount} {post.reportCount === 1 ? 'report' : 'reports'} · hidden{' '}
                    {timeAgo(post.hiddenAt)}
                  </Text>
                </View>
                <Text style={[styles.preview, { color: C.text, fontFamily: Fonts.serifRegular }]}>
                  {post.preview}
                </Text>
                {post.firstName && (
                  <Text style={[styles.meta, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
                    — {post.firstName}
                  </Text>
                )}
                <View style={styles.actions}>
                  <AnimatedPressable
                    onPress={() => act(post, 'unhide')}
                    disabled={actingId === post.id}
                    scaleValue={0.97}
                    style={[styles.actionBtn, { borderColor: C.borderLight }]}
                    testID={`moderation-unhide-${post.id}`}
                  >
                    <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                      Restore
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => act(post, 'delete')}
                    disabled={actingId === post.id}
                    scaleValue={0.97}
                    style={[styles.actionBtn, { borderColor: C.borderLight }]}
                    testID={`moderation-delete-${post.id}`}
                  >
                    <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                      Delete
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            ))}
            {hasMore && (
              <AnimatedPressable
                onPress={() => void load(posts.length, true)}
                disabled={loadingMore}
                scaleValue={0.97}
                style={[styles.actionBtn, { borderColor: C.borderLight }]}
                testID="moderation-load-more"
              >
                <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Text>
              </AnimatedPressable>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

// Pre-launch a11y lane D (PL-H9): house createStyles(T) pattern so the
// Larger Text toggle scales this screen. Normal-size values reproduce the
// old literals (see lane report for the mapping table).
function createStyles(T: any) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    title: { fontSize: T.scale(16) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    body: { fontSize: T.scale(14), textAlign: 'center', lineHeight: T.scale(21) },
    list: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
    card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    kind: { fontSize: T.scale(11), letterSpacing: 1 },
    meta: { fontSize: T.scale(11) },
    preview: { fontSize: T.scale(14), lineHeight: T.scale(21) },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    actionText: { fontSize: T.scale(12) },
  });
}
