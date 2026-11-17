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
import { reportReasonLabel } from '@/lib/moderation';
import { timeAgo } from '@/lib/timeAgo';
import type { HiddenWallPost } from '@/types';

/**
 * Moderator review queue (wall moderation stack, build 7; report
 * queue, GPT-6 item 12, 2026-11-16).
 *
 * Lists EVERY post with an unreviewed report (visible or hidden),
 * oldest report first, plus hidden posts with no unreviewed reports
 * (pure tier-2 holds) — the 3-distinct-reporter auto-hide threshold
 * is unchanged, but a post no longer needs 3 reports before a
 * moderator can see it. Restore unhides a hidden post and archives
 * its reports (they no longer count toward hiding, so a cleared post
 * needs a fresh threshold of new reports to hide again); Dismiss
 * archives a VISIBLE post's reports without touching the post;
 * Delete removes the post permanently, and its reports cascade with
 * it. The list itself is moderator-only: the RPC raises for anyone
 * else, and the Settings entry point is hidden from non-moderators —
 * both gates must agree, so a deep link alone cannot open the queue.
 */
const QUEUE_PAGE_SIZE = 50;

/** Oldest review event for a queue row: first unreviewed report, else hide time, else creation. */
function queueKey(p: HiddenWallPost): string {
  return p.firstReportedAt ?? p.hiddenAt ?? p.createdAt;
}

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

  // Round-5 lane 5, H5 (sort UI only): the queue arrives oldest-first
  // from the server (first report, then hold time), so under a flood
  // the newest reports sink out of reach without paging. These sorts
  // reorder the rows already loaded on this device; paging still walks
  // the server's oldest-first order, so "Load more" appends in that
  // order and the sort re-applies over everything loaded so far.
  // queueKey is the row's oldest review event: first unreviewed
  // report, else the hide time, else creation (hiddenAt is null for
  // visible reported posts, firstReportedAt null for pure holds).
  const [sort, setSort] = useState<'newest' | 'oldest' | 'mostReported' | 'selfHarmFirst'>('newest');
  const sortedPosts = useMemo(() => {
    if (sort === 'oldest') {
      return [...posts].sort((a, b) => queueKey(a).localeCompare(queueKey(b)));
    }
    if (sort === 'mostReported') {
      return [...posts].sort(
        (a, b) => b.reportCount - a.reportCount || queueKey(a).localeCompare(queueKey(b)),
      );
    }
    if (sort === 'selfHarmFirst') {
      // Coordinator integration (M22): self-harm holds first, then
      // threat holds, then everything else newest-first. Uses the
      // server-provided hiddenReason already mapped into the row.
      // Report reasons render below from recent_reasons (00020 §H24
      // column, now surfaced by the report queue RPC).
      const rank = (p: HiddenWallPost) =>
        p.hiddenReason === 'hold:self_harm' ? 0 : p.hiddenReason === 'hold:threat' ? 1 : 2;
      return [...posts].sort(
        (a, b) => rank(a) - rank(b) || queueKey(b).localeCompare(queueKey(a)),
      );
    }
    // 'newest': newest review event first (server order is oldest-first).
    return [...posts].sort((a, b) => queueKey(b).localeCompare(queueKey(a)));
  }, [posts, sort]);

  // Offset is passed explicitly so this callback stays stable: a
  // posts.length dependency would refetch on focus after paging.
  const load = useCallback(async (offset = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      // GPT-6 item 12 (2026-11-16): the report queue, not the old
      // hidden-posts queue — every unreviewed report, oldest first,
      // plus hidden posts with no unreviewed reports (pure holds).
      const rows = await DatabaseService.getReportQueue({
        limit: QUEUE_PAGE_SIZE,
        offset,
      });
      // Round 3 fix: offset paging over a live queue duplicates a row
      // when a new hidden post lands at the top between pages — dedup
      // on append so the queue never shows the same post twice.
      setPosts((prev) => (append ? [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))] : rows));
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
    (post: HiddenWallPost, action: 'unhide' | 'delete' | 'dismiss') => {
      const copy = {
        unhide: {
          title: 'Restore post',
          verb: 'Restore this post to the wall?',
          detail: 'It becomes visible on the wall again. Its past reports are archived, so only new reports can hide it again.',
          button: 'Restore',
        },
        delete: {
          title: 'Delete post',
          verb: 'Delete this post permanently?',
          detail: 'The post and its reports are gone for good.',
          button: 'Delete',
        },
        dismiss: {
          title: 'Dismiss reports',
          verb: 'Dismiss these reports?',
          detail: 'The post stays on the wall. Its past reports are archived, so only new reports can flag it again.',
          button: 'Dismiss',
        },
      }[action];
      Alert.alert(copy.title, `${copy.verb}\n\n${copy.detail}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: copy.button,
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
            Review reports
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {phase === 'checking' || loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : phase === 'denied' ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
              This area is for moderators.
            </Text>
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
              No reports to review. The wall is clear.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.sortRow}>
              {([
                { id: 'newest', label: 'Newest' },
                { id: 'oldest', label: 'Oldest first' },
                { id: 'mostReported', label: 'Most reported' },
                { id: 'selfHarmFirst', label: 'Urgent first' },
              ] as const).map((option) => (
                <AnimatedPressable
                  key={option.id}
                  onPress={() => setSort(option.id)}
                  scaleValue={0.97}
                  style={[styles.sortBtn, { borderColor: C.borderLight }, sort === option.id && { borderColor: C.accent, backgroundColor: 'rgba(200,137,74,0.12)' }]}
                  testID={`moderation-sort-${option.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === option.id }}
                  accessibilityLabel={`Sort queue: ${option.label}`}
                >
                  <Text style={[styles.sortText, { color: sort === option.id ? C.text : C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                    {option.label}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
            <Text style={[styles.sortNote, { color: C.textSecondary, fontFamily: Fonts.italic }]}>
              Sorting applies to the posts loaded here; load more to extend it.
            </Text>
            {sortedPosts.map((post) => (
              <View
                key={post.id}
                style={[styles.card, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.kind, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>
                    {post.kind === 'echo' ? 'PRAYER REQUEST' : 'TESTIMONY'}
                  </Text>
                  <Text style={[styles.meta, { color: C.textSecondary, fontFamily: Fonts.titleLight }]}>
                    {post.reportCount === 0
                      ? `No reports · hidden ${timeAgo(post.hiddenAt ?? post.createdAt)}`
                      : post.hiddenAt
                        ? `${post.reportCount} ${post.reportCount === 1 ? 'report' : 'reports'} · hidden ${timeAgo(post.hiddenAt)}`
                        : `${post.reportCount} ${post.reportCount === 1 ? 'report' : 'reports'} · reported ${timeAgo(post.firstReportedAt ?? post.createdAt)}`}
                  </Text>
                </View>
                <Text style={[styles.preview, { color: C.text, fontFamily: Fonts.serifRegular }]}>
                  {post.preview}
                </Text>
                {post.recentReasons && post.recentReasons.length > 0 && (
                  <Text style={[styles.meta, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>
                    {post.recentReasons.map((reason) => reportReasonLabel(reason)).join(' · ')}
                  </Text>
                )}
                {post.hiddenReason && (
                  <Text style={[styles.meta, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>
                    {post.hiddenReason.startsWith('hold:')
                      ? `HOLD: ${post.hiddenReason.slice(5).toUpperCase()}`
                      : post.hiddenReason.toUpperCase()}
                  </Text>
                )}
                {post.firstName && (
                  <Text style={[styles.meta, { color: C.textSecondary, fontFamily: Fonts.titleLight }]}>
                    {post.firstName}
                  </Text>
                )}
                <View style={styles.actions}>
                  {post.hiddenAt ? (
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
                  ) : (
                    <AnimatedPressable
                      onPress={() => act(post, 'dismiss')}
                      disabled={actingId === post.id}
                      scaleValue={0.97}
                      style={[styles.actionBtn, { borderColor: C.borderLight }]}
                      testID={`moderation-dismiss-${post.id}`}
                    >
                      <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                        Dismiss
                      </Text>
                    </AnimatedPressable>
                  )}
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
    title: { fontSize: T.size.sectionTitle, lineHeight: T.leading.sectionTitle },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    body: { fontSize: T.size.bodySmall, textAlign: 'center', lineHeight: T.leading.bodySmall },
    list: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
    sortRow: { flexDirection: 'row', gap: 8 },
    sortBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    sortText: { fontSize: T.size.body, lineHeight: T.leading.body },
    sortNote: { fontSize: T.size.body, textAlign: 'center', lineHeight: T.leading.body },
    card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    kind: { fontSize: T.size.body, letterSpacing: 1, lineHeight: T.leading.body },
    meta: { fontSize: T.size.body, lineHeight: T.leading.body },
    preview: { fontSize: T.size.bodySmall, lineHeight: T.leading.bodySmall },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionText: { fontSize: T.size.button, lineHeight: T.leading.button },
  });
}
