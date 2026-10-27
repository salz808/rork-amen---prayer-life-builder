import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  TextInput,
  Alert,
  AlertButton,
  KeyboardAvoidingView,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Plus, Users, Flag, ChevronRight, ChevronDown } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import { FEATURES } from '@/constants/features';
import AnimatedPressable from '@/components/AnimatedPressable';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import { Echo } from '@/mocks/echoes';
import { DatabaseService } from '@/lib/database';
import { isHeldWallPost, supportCardVariantForBlock, supportCardVariantForHold } from '@/lib/moderation';
import WallGuidelinesSheet from '@/components/WallGuidelinesSheet';
import { getSafeSession, supabase } from '@/lib/supabase';
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
  onRequestSupportCard,
  styles,
  _C,
  Fonts,
  carried = false,
  isOwn = false,
  highlighted = false,
}: {
  echo: Echo;
  isAmened: boolean;
  onAmen: () => void;
  onOptions?: () => void;
  onRequestSupportCard?: () => void;
  styles: any;
  _C: any;
  Fonts: any;
  carried?: boolean;
  isOwn?: boolean;
  highlighted?: boolean;
}) {
  const scale = useState(() => new Animated.Value(1))[0]
  const glowOpacity = useState(() => new Animated.Value(0))[0]
  const countScale = useState(() => new Animated.Value(1))[0]

  const handlePress = () => {
    // Audit must-fix #8: the server now rejects self-amens outright, so
    // the pill is hidden on your own cards (below) and the press is a
    // no-op here as defense in depth.
    if (isAmened || isOwn) return;

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
      highlighted && styles.echoCardHighlighted,
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
        accessibilityRole="button"
        accessibilityLabel={
          isOwn
            ? `Your prayer request: ${echo.text}. ${echo.amens} praying.`
            : isAmened
              ? `Prayer request: ${echo.text}. You prayed for this.`
              : `Prayer request: ${echo.text}. ${echo.amens} praying. Tap to say Amen.`
        }
        accessibilityHint={onOptions && !isOwn ? 'Long-press for more options, including report.' : undefined}
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
        {isOwn && echo.hiddenAt && (
          <Text style={[styles.echoTime, { fontFamily: Fonts.titleLight }]}>
            Not on the wall yet. It is saved for review, and only you can see it here.
          </Text>
        )}
        {/* S9 re-open affordance: an own held self_harm/threat row can
            re-request its support card from the stored server reason
            only (supportCardVariantForHold reads hiddenReason, never
            re-scans the prayer text). Each row carries its own variant,
            so a second held row's card is never lost behind the
            single-scalar card state's last-variant-wins behaviour —
            tapping that row's affordance shows its variant. */}
        {isOwn && echo.hiddenAt && supportCardVariantForHold(echo) && onRequestSupportCard && (
          <Pressable
            onPress={onRequestSupportCard}
            style={styles.supportCardAffordance}
            testID={`wall-echo-support-${echo.id}`}
            accessibilityRole="button"
            accessibilityLabel="Pray this with us"
          >
            <Text style={[styles.supportCardAffordanceText, { fontFamily: Fonts.titleMedium }]}>
              Pray this with us
            </Text>
          </Pressable>
        )}
        {carried && (
          <View style={styles.carriedBadge}>
            <Text style={[styles.carriedBadgeText, { fontFamily: Fonts.titleBold }]}>🕊 YOU PRAYED FOR THIS</Text>
          </View>
        )}
        <View style={styles.echoFooter}>
          {isOwn && (
            <Text style={[styles.amenCount, { fontFamily: Fonts.titleBold }]}>
              {echo.amens} praying
            </Text>
          )}
          {!isOwn && (
            <View style={[styles.amenPill, isAmened && styles.amenPillActive]}>
              <Text style={[styles.amenIcon, isAmened && styles.amenIconActive]}>🙏</Text>
              <Animated.Text style={[
                styles.amenCount,
                isAmened && styles.amenCountActive,
                { fontFamily: Fonts.titleBold, transform: [{ scale: countScale }] },
              ]}>
                {echo.amens}
              </Animated.Text>
              <Text style={[styles.amenLabel, isAmened && styles.amenCountActive, { fontFamily: Fonts.titleLight }]}>
                praying
              </Text>
            </View>
          )}
          {!isAmened && !isOwn && (
            <View style={styles.tapToAmenWrap}>
              <Text style={[styles.tapToAmen, { fontFamily: Fonts.titleLight }]}>Tap to say Amen</Text>
            </View>
          )}
          {onOptions && (
            <Pressable
              onPress={onOptions}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.echoFlagBtn}
              testID={`wall-echo-report-${echo.id}`}
              accessibilityRole="button"
              accessibilityLabel="Request options"
            >
              <Flag size={15} color={_C.iconMuted} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Community tab — the Prayer Wall and Testimonies feed.
 * One destination for everything shared. Circles join this tab when
 * FEATURES.circles is on; while hidden, the wall is the global wall only.
 */
export default function CommunityScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const { state, isLoading: userLoading, carriedEchoIds, markEchoAmenedLocally, requestSupportCard, supportCardVariant } = useApp();
  const [amenedEchoes, setAmenedEchoes] = useState<Set<string>>(new Set());
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [echoesLoading, setEchoesLoading] = useState(true);
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [testimoniesLoading, setTestimoniesLoading] = useState(true);
  // Wall paging/refresh/realtime (Kai's scaling question): 25 per page,
  // pull-to-refresh, refetch on return, and a non-disruptive pill for
  // live arrivals instead of yanking the list.
  const [echoesHasMore, setEchoesHasMore] = useState(false);
  const [echoesLoadingMore, setEchoesLoadingMore] = useState(false);
  const [testimoniesHasMore, setTestimoniesHasMore] = useState(false);
  const [testimoniesLoadingMore, setTestimoniesLoadingMore] = useState(false);
  const [wallError, setWallError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newEchoCount, setNewEchoCount] = useState(0);
  const [newTestimonyCount, setNewTestimonyCount] = useState(0);
  const ownEchoIdsRef = useRef<Set<string>>(new Set());
  // Audit round 3, J-S5: the realtime pill counted every new post,
  // including muted authors' — keep a cached muted set (populated on
  // mount, updated on mute/report) so live arrivals from muted authors
  // don't inflate the pill.
  const mutedAuthorIdsRef = useRef<Set<string>>(new Set());
  // Coordinator integration (M1): only pass the cached set to the
  // loaders once the mount fetch has resolved. Passing an empty set
  // early would bypass mute filtering; until then the loaders fetch
  // the set themselves, exactly as before.
  const mutedLoadedRef = useRef(false);
  useEffect(() => {
    void DatabaseService.getMutedAuthorIds()
      .then((ids) => { mutedAuthorIdsRef.current = ids; mutedLoadedRef.current = true; })
      .catch(() => { /* Pill stays unfiltered; the list itself filters. */ });
  }, []);
  // Fix-everything D3: current-user id for the feed held filter,
  // kept in a ref (same pattern as the muted set) so the page
  // loaders stay [wallScope]-memoized — a state.user?.id dep trips
  // preserve-manual-memoization on these callbacks.
  const ownUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { ownUserIdRef.current = state.user?.id; }, [state.user?.id]);
  // S9: a support card counts as shown this session the moment the
  // provider's variant becomes non-null from ANY source (live share
  // here, session/journal share, or the testimony reconcile) — the
  // wall re-request below must not re-fire over a card the user
  // already saw or dismissed this session.
  const supportCardShownThisSessionRef = useRef(false);
  useEffect(() => {
    if (supportCardVariant) supportCardShownThisSessionRef.current = true;
  }, [supportCardVariant]);
  const focusCountRef = useRef(0);
  const [isSharingToEchoes, setIsSharingToEchoes] = useState(false);
  const [showWallGuidelines, setShowWallGuidelines] = useState(false);
  const [echoInput, setEchoInput] = useState('');
  const [echoSubmitting, setEchoSubmitting] = useState(false);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [wallScope, setWallScope] = useState<string>('public');
  const [shareScope, setShareScope] = useState<string>('public');

  // Bell landing: tapping a prayer notification routes here with
  // highlightEchoId (+ a highlightNonce so repeat taps re-land). Once the
  // first page has loaded, fetch that echo and prepend it if it is not
  // already on screen, then scroll to the top and briefly highlight the
  // card — audit round 3, J-B12: the old code neither scrolled nor
  // highlighted, so the tap landed on whatever the wall happened to show.
  // (Known edge: a circle-scoped request lands in the public view rather
  // than switching scope; RLS still gates the fetch itself.)
  const wallParams = useLocalSearchParams();
  const highlightEchoId =
    typeof wallParams.highlightEchoId === 'string' ? wallParams.highlightEchoId : undefined;
  // Round-2 L4: a circle link rewritten by gateCircles (+native-intent)
  // arrives here with ?circles_notice=1. Say so once, instead of
  // silently landing an invite sender/recipient on the wall.
  const circlesNotice =
    typeof wallParams.circles_notice === 'string' ? wallParams.circles_notice : undefined;
  const circlesNoticeShownRef = useRef(false);
  useEffect(() => {
    // Round-3 A-L3: key the notice to arrivals, not mounts — reset
    // when the param clears so a second invite in the same session
    // alerts again instead of landing silently.
    if (!circlesNotice) {
      circlesNoticeShownRef.current = false;
      return;
    }
    if (circlesNoticeShownRef.current) return;
    circlesNoticeShownRef.current = true;
    Alert.alert(
      'Circles aren’t open yet',
      'That link was for a prayer circle. Circles aren’t open yet, so you’ve landed on the Prayer Wall instead.',
    );
  }, [circlesNotice]);
  const highlightNonce =
    typeof wallParams.highlightNonce === 'string' ? wallParams.highlightNonce : undefined;
  const fetchedHighlightRef = useRef<Set<string>>(new Set());
  const [highlightedEchoId, setHighlightedEchoId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);
  const landOnEcho = useCallback((id: string) => {
    setHighlightedEchoId(id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedEchoId(null), 4000);
  }, []);
  useEffect(() => {
    if (!highlightEchoId || echoesLoading) return;
    const nonceKey = `${highlightEchoId}:${highlightNonce ?? ''}`;
    if (fetchedHighlightRef.current.has(nonceKey)) return;
    // Audit round 4, lane 5 (G-M4): highlightEchoId arrives from a
    // navigation param, which any deep link can set — it is untrusted
    // input, not a bell proof. An invalid UUID never reaches the fetch
    // (it used to error into a generic alert); the fetch branch below
    // additionally requires the id to appear in this recipient's own
    // prayer_notifications rows, so a crafted link cannot force an
    // arbitrary (e.g. circle-scoped) post into the public view. The
    // already-on-screen branch needs no such check: that post is
    // already visible public content.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(highlightEchoId)) {
      fetchedHighlightRef.current.add(nonceKey);
      Alert.alert('That prayer is no longer available', 'It may have been removed by its author.');
      return;
    }
    // Deferred past layout: the highlight state + scroll must run after
    // the row exists (especially for a just-prepended echo), and the
    // lint rule forbids synchronous setState inside an effect body.
    const landSoon = () => { setTimeout(() => landOnEcho(highlightEchoId), 0); };
    if (echoes.some((e) => e.id === highlightEchoId)) {
      fetchedHighlightRef.current.add(nonceKey);
      landSoon();
      return;
    }
    fetchedHighlightRef.current.add(nonceKey);
    void (async () => {
      try {
        const echo = await DatabaseService.getCommunityEchoById(highlightEchoId);
        if (!echo) {
          Alert.alert('That prayer is no longer available', 'It may have been removed by its author.');
          return;
        }
        // A muted author's post must not be resurrected by a bell tap.
        const mutedAuthors = await DatabaseService.getMutedAuthorIds();
        if (echo.userId != null && mutedAuthors.has(echo.userId)) {
          Alert.alert('That prayer is no longer available', 'You chose to hide requests from this person.');
          return;
        }
        // MOD-9 companion (lane 5 side): a hidden post must never be
        // prepended for a non-author, even if RLS ever lets the fetch
        // through — and a bell landing is only legitimate for an echo
        // this recipient actually has a notification row for (the Home
        // bell is the sole producer of highlightEchoId params).
        const currentUserId = await DatabaseService.getCurrentUserId();
        if (echo.hiddenAt && echo.userId !== currentUserId) {
          Alert.alert('That prayer is no longer available', 'It may have been removed by its author.');
          return;
        }
        // M31, partial: the echo itself is already verified via direct
        // getCommunityEchoById above (not the capped list). The
        // notification-proof check below still uses the capped-50
        // getPrayerNotifications() — a dedicated per-echo lookup in
        // lib/database.ts (out of this lane's scope) is needed to close
        // it fully; the check is kept, not dropped, because
        // highlightEchoId is untrusted deep-link input.
        const notifications = await DatabaseService.getPrayerNotifications();
        if (!notifications.some((n) => n.echoId === echo.id)) {
          Alert.alert('That prayer is no longer available', 'It may have been removed by its author.');
          return;
        }
        setEchoes((prev) => {
          if (prev.some((p) => p.id === echo.id)) return prev;
          return [{ id: echo.id, text: echo.text, amens: echo.amens, createdAt: echo.createdAt, userId: echo.userId, hiddenAt: echo.hiddenAt ?? null, hiddenReason: echo.hiddenReason ?? null }, ...prev];
        });
        landSoon();
      } catch {
        Alert.alert('Couldn’t open that prayer', 'Check your connection and try again.');
      }
    })();
  }, [highlightEchoId, highlightNonce, echoesLoading, echoes, landOnEcho]);

  const headerFadeAnim = useState(() => new Animated.Value(0))[0]
  const headerSlideAnim = useState(() => new Animated.Value(12))[0]
  const contentFadeAnim = useState(() => new Animated.Value(0))[0]
  const contentSlideAnim = useState(() => new Animated.Value(16))[0]

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

  // Audit round 2, hole #4b: the wall-write gate. The startup gate covers
  // signed-in legacy users, but an anonymous guest's first Amen (and a
  // signed-in user whose attestation check was skipped offline at launch)
  // would otherwise reach the social feed unattested. Every wall write —
  // Amen or post — checks the recorded attestation first; on confirm the
  // attestation is recorded BEFORE the pending write runs (H22), so a
  // legacy signed-in user's first post passes the server's
  // age_attested_at INSERT policy instead of failing once and only
  // succeeding on retry. The bypass ref still lets the retried write
  // pass its own gate check. Declining blocks only the wall, never the
  // rest of the app.
  const [showWallAgeGate, setShowWallAgeGate] = useState(false);
  const pendingWallWriteRef = useRef<(() => Promise<void>) | null>(null);
  // Set on modal confirm so the retried write passes its own gate check
  // (the attestation is recorded only AFTER the write, because an
  // anonymous user's session is created by the write itself). Always
  // cleared after the retried write, so it can never skip a later gate.
  const wallGateBypassRef = useRef(false);

  const requestWallAttestation = async (retry: () => Promise<void>): Promise<boolean> => {
    if (wallGateBypassRef.current) {
      wallGateBypassRef.current = false;
      return true;
    }
    try {
      if (await DatabaseService.getAgeAttested()) return true;
      // Anonymous guests: the server record may not exist yet (their
      // session is minted by the write itself; seed Amens mint none),
      // so the device-local anonymous attestation counts too. It is
      // always false for signed-in users, so their flow is unchanged.
      if (await DatabaseService.getAnonymousAgeAttested()) return true;
    } catch {
      // Unknown (offline, no profile row yet): gate, don't assume.
    }
    pendingWallWriteRef.current = retry;
    setShowWallAgeGate(true);
    return false;
  };

  const confirmWallAgeGate = async () => {
    setShowWallAgeGate(false);
    const write = pendingWallWriteRef.current;
    pendingWallWriteRef.current = null;
    if (write) {
      wallGateBypassRef.current = true;
      try {
        // H22: record BEFORE the pending write, while the bypass ref
        // is held, so the write's own gate check passes and the
        // server INSERT policy sees the attestation on first try.
        // Fallback only: an anonymous user's first Amen mints its
        // session via the write itself, so a pre-write record has no
        // session to land on — if it failed, retry once after the
        // write, preserving the old single-modal behaviour.
        let attested = false;
        try {
          await DatabaseService.recordAgeAttestation();
          attested = true;
        } catch {
          attested = false;
        }
        // Anonymous confirm: record locally BEFORE the write too, so a
        // seed Amen (no session minted) still remembers the confirm,
        // and the post-write re-stamp below lands it under the minted
        // anonymous user id for server Amen writes.
        await DatabaseService.recordAnonymousAgeAttestation().catch(() => {});
        await write();
        if (!attested) {
          void DatabaseService.recordAgeAttestation().catch(() => {});
        }
        void DatabaseService.recordAnonymousAgeAttestation().catch(() => {});
      } catch {
        // The write reports its own errors; the gate must not add a second.
      } finally {
        wallGateBypassRef.current = false;
      }
    } else {
      void DatabaseService.recordAgeAttestation().catch(() => {});
      void DatabaseService.recordAnonymousAgeAttestation().catch(() => {});
    }
  };

  const declineWallAgeGate = () => {
    setShowWallAgeGate(false);
    wallGateBypassRef.current = false;
    pendingWallWriteRef.current = null;
    // Decline records nothing and publishes nothing: the pending write
    // above is dropped, so no post is published and no Amen is recorded.
    // Defensive clear — a decline must never leave a pending pass behind.
    void DatabaseService.clearAnonymousAgeAttestationPending().catch(() => {});
    Alert.alert(
      'The Prayer Wall is for ages 13 and up',
      'You can keep using TRIAD for your personal prayer journey. The community wall needs someone who is 13 or older.',
    );
  };

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

    if (!(await requestWallAttestation(() => handleShareToEchoes()))) return;

    setEchoSubmitting(true);
    try {
      const newEcho = await DatabaseService.createCommunityEcho(
        echoInput.trim(),
        shareScope === 'public' ? null : shareScope
      );
      if (!newEcho) {
        throw new Error('No prayer request was returned after saving.');
      }
      // Own posts must not light the realtime pill (they're already on screen).
      ownEchoIdsRef.current.add(newEcho.id);
      setEchoes((prev) => [{ ...newEcho, createdAt: newEcho.createdAt }, ...prev]);
      setIsSharingToEchoes(false);
      setEchoInput('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Moderation tiers (migration 00019): a held post is a SUCCESS
      // with hidden_at set — not an error, and never a retry loop.
      // The own card below already renders its "Under review" line
      // from hiddenAt. Self-harm and threat holds replace the
      // generic notice with the support card (rendered once from
      // the root layout via context); every other hold keeps the
      // generic notice. The post stays held either way.
      const supportVariant = supportCardVariantForHold(newEcho);
      if (supportVariant) {
        supportCardShownThisSessionRef.current = true;
        requestSupportCard(supportVariant);
      } else if (isHeldWallPost(newEcho)) {
        Alert.alert(
          'Under review',
          'Not on the wall yet. It is saved for review, and only you can see it here.',
        );
      }
    } catch (err) {
      // Moderation stack: the server trigger is the gate, so its message
      // can surface here even when the pre-check was skipped or raced.
      // Held posts never reach this catch (migration 00019: a hold is
      // a successful insert with hidden_at set, handled above).
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('MODERATION_BLOCKED')) {
        // Block-wins card: ONLY on a server-signalled self_harm/
        // threat block (supportCardVariantForBlock — no client
        // text scan, see its oracle note). The card replaces the
        // generic alert and its blocked line states the post was
        // not shared; it publishes nothing. Profanity-only and
        // all other blocks keep the generic alert.
        const blockVariant = supportCardVariantForBlock(message);
        if (blockVariant) {
          supportCardShownThisSessionRef.current = true;
          requestSupportCard(blockVariant, { blocked: true });
        } else {
          Alert.alert(
            'Not shared',
            'This prayer contains language that can’t appear on the wall, so it wasn’t shared. Your words are still here — you can reword and try again.',
          );
        }
      } else if (message.includes('MODERATION_DAILY_LIMIT')) {
        Alert.alert(
          'Already shared today',
          'You’ve already shared a prayer today. Come back tomorrow to share another one.',
        );
      } else {
        Alert.alert('Couldn’t share your prayer', 'Your words are still here. Check your connection and try again.');
      }
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
    if (!(await requestWallAttestation(() => handleAmenEcho(echoId)))) return;
    if (mergedAmenedEchoes.has(echoId)) return;
    setAmenedEchoes((prev) => new Set(prev).add(echoId));
    // Audit round 3, J-B11: the count now comes from the row itself, not
    // from a render-time +1 (which double-counted after a refetch, since
    // the server row already includes your amen). Bump the local row on
    // success; a seed amen bumps its local row too.
    const bumpLocalCount = () =>
      setEchoes((prev) => prev.map((e) => (e.id === echoId ? { ...e, amens: e.amens + 1 } : e)));

    // Seeded/fallback posts have no server row — save the amen on this device.
    if (echoId.startsWith('seed-')) {
      markEchoAmenedLocally(echoId);
      bumpLocalCount();
      return;
    }

    try {
      const result = await DatabaseService.amenEcho(echoId);
      if (result.alreadyAmened) {
        // Another device already amened: trust the server row, don't add
        // a second +1 on top of it.
        const fresh = await DatabaseService.getCommunityEchoById(echoId);
        if (fresh) {
          setEchoes((prev) => prev.map((e) => (e.id === echoId ? { ...e, amens: fresh.amens } : e)));
        }
      } else {
        bumpLocalCount();
      }
    } catch (err) {
      setAmenedEchoes((prev) => {
        const next = new Set(prev);
        next.delete(echoId);
        return next;
      });
      // Fix-everything D3: a held row's amen is rejected server-side
      // as "Post under review" — say so, instead of a generic
      // connection error, so a user who somehow tapped a held pill
      // understands why it did not save.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Post under review')) {
        Alert.alert('This prayer is under review', 'This prayer is under review and can’t collect amens right now.');
      } else {
        Alert.alert('Amen wasn’t saved', 'Check your connection and try again.');
      }
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
      "It disappears from your wall right away and is saved for review.",
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
                // Audit round 3, J-S5: a report used to hide only requests
                // — the author's testimonies stayed on the wall.
                if (echo.userId) {
                  setTestimonies((prev) => prev.filter((t) => t.userId !== echo.userId));
                  mutedAuthorIdsRef.current.add(echo.userId);
                }
                Alert.alert('Thank you', 'You helped keep this space gentle for everyone.');
              } catch (err) {
                // Fix-everything G2: a daily report-limit rejection
                // must say so, not masquerade as a connection error.
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes('MODERATION_REPORT_LIMIT')) {
                  Alert.alert('Report limit reached', 'You’ve reached today’s report limit. Try again tomorrow.');
                } else {
                  Alert.alert("Couldn't report this", 'Check your connection and try again.');
                }
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
        // Audit round 3, J-S5: hiding an author hides their testimonies
        // too, not just their requests.
        setTestimonies((prev) => prev.filter((t) => t.userId !== mutedUserId));
        mutedAuthorIdsRef.current.add(mutedUserId);
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

  // Wall paging: 25 per page, cursor = oldest loaded created_at. The DB
  // layer uses .lte on the cursor, so appends dedup by id — rows sharing
  // the boundary timestamp are never skipped.
  const WALL_PAGE_SIZE = 25;

  const loadEchoesPage = useCallback(async (reset: boolean, cursor?: string) => {
    if (reset) setEchoesLoading(true); else setEchoesLoadingMore(true);
    try {
      const scope = wallScope === 'public' ? undefined : { circleId: wallScope };
      // Coordinator integration (M1): reuse the mount-cached muted
      // set once loaded, instead of re-reading the mute tables here.
      const mutedOpt = mutedLoadedRef.current ? { mutedAuthors: mutedAuthorIdsRef.current } : undefined;
      const dbEchoes = await DatabaseService.getCommunityEchoes(
        scope,
        reset ? { pageSize: WALL_PAGE_SIZE } : { cursor, pageSize: WALL_PAGE_SIZE },
        mutedOpt,
      );
      const rows = dbEchoes.map((e) => ({
        id: e.id,
        text: e.text,
        amens: e.amens,
        createdAt: e.createdAt,
        userId: e.userId,
        hiddenAt: e.hiddenAt ?? null,
        // Fix-everything (support lane G7): preserve the reason
        // the DB layer already returns — refetching used to drop
        // it, so no feed rendering could ever key on reason.
        hiddenReason: e.hiddenReason ?? null,
      }));
      // Fix-everything D3: defense in depth — RLS already excludes
      // other users' hidden rows, but the feed must never render a
      // leaked non-author held row with a tappable Amen pill. Own
      // held rows stay (they render their "Under review" line).
      const ownId = ownUserIdRef.current;
      const visibleRows = rows.filter((r) => r.hiddenAt == null || r.userId === ownId);
      if (reset) {
        // Audit round 3, J-B12: a refresh drops a bell-prepended echo, so
        // clear the landed set — the highlight effect re-runs and
        // re-prepends it instead of leaving the bell tap stranded.
        fetchedHighlightRef.current.clear();
        setEchoes(visibleRows);
      } else {
        setEchoes((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...visibleRows.filter((r) => !seen.has(r.id))];
        });
      }
      setEchoesHasMore(dbEchoes.length === WALL_PAGE_SIZE);
      // Coordinator integration (H12): on reset, fetch amen state
      // for the visible page only and MERGE it into the existing
      // set, instead of replacing the set from a full lifetime
      // download. Non-reset pages keep the set they already have.
      if (reset) {
        const pageAmenIds = await DatabaseService.getUserAmenedEchoIds(visibleRows.map((r) => r.id));
        setAmenedEchoes((prev) => new Set([...prev, ...pageAmenIds]));
      }
    } catch {
      // The public wall never falls back to invented posts: on a failed
      // first load it is honestly empty, with a retry banner.
      if (reset) {
        setEchoes([]);
        setWallError('The wall couldn’t load. Check your connection and try again.');
      } else {
        setWallError('Couldn’t load more prayers. Try again.');
      }
    } finally {
      if (reset) setEchoesLoading(false); else setEchoesLoadingMore(false);
    }
  }, [wallScope]);

  // Community testimonies — publicly shared answered prayers. Free for all;
  // shown on the public wall only (circles keep requests private).
  const loadTestimoniesPage = useCallback(async (reset: boolean, cursor?: string) => {
    if (wallScope !== 'public') return;
    if (reset) setTestimoniesLoading(true); else setTestimoniesLoadingMore(true);
    try {
      const mutedOpt = mutedLoadedRef.current ? { mutedAuthors: mutedAuthorIdsRef.current } : undefined;
      const rows = await DatabaseService.getCommunityTestimonies(
        reset ? { pageSize: WALL_PAGE_SIZE } : { cursor, pageSize: WALL_PAGE_SIZE },
        mutedOpt,
      );
      // Fix-everything D3, testimonies side: same defense-in-depth
      // filter as echoes — a leaked non-author hidden testimony
      // never renders in the feed. Own held testimonies stay (they
      // render their "Under review" line).
      const ownId = ownUserIdRef.current;
      const visibleRows = rows.filter((r) => (r as { hiddenAt?: string | null }).hiddenAt == null || r.userId === ownId);
      if (reset) {
        setTestimonies(visibleRows);
      } else {
        setTestimonies((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...visibleRows.filter((r) => !seen.has(r.id))];
        });
      }
      setTestimoniesHasMore(rows.length === WALL_PAGE_SIZE);
    } catch {
      if (reset) {
        setTestimonies([]);
        setWallError('The wall couldn’t load. Check your connection and try again.');
      } else {
        setWallError('Couldn’t load more testimonies. Try again.');
      }
    } finally {
      if (reset) setTestimoniesLoading(false); else setTestimoniesLoadingMore(false);
    }
  }, [wallScope]);

  const reloadWall = useCallback(() => {
    setWallError(null);
    setNewEchoCount(0);
    setNewTestimonyCount(0);
    void loadEchoesPage(true);
    void loadTestimoniesPage(true);
  }, [loadEchoesPage, loadTestimoniesPage]);

  // Load the wall for the selected scope — the public wall or a private circle.
  useEffect(() => {
    reloadWall();
  }, [reloadWall]);

  // Returning to the wall re-reads page 1 (the first focus is the mount
  // load above, so it is skipped) so new prayers appear without a manual
  // refresh.
  useFocusEffect(useCallback(() => {
    focusCountRef.current += 1;
    if (focusCountRef.current > 1) reloadWall();
  }, [reloadWall]));

  // S9: on wall load, if the current user has an own held echo with a
  // self_harm/threat hold and no card has shown this session, re-request
  // the card from the stored server reason only — no text re-scan (the
  // variant comes from hiddenReason via supportCardVariantForHold).
  // Scanned from the loaded rows (first page, then appended pages as
  // they arrive), so a held row below page 1 still recovers its card
  // once LOAD MORE brings it on screen; the per-row affordance covers
  // any row the scan has not reached yet. Single-scalar card state
  // means only the first (newest) matching row's variant auto-shows;
  // other variants stay reachable through their own row's affordance,
  // not silently overwritten — the testimony reconcile's
  // last-variant-wins loss is not copied here.
  useEffect(() => {
    if (supportCardShownThisSessionRef.current) return;
    const ownId = ownUserIdRef.current ?? state.user?.id;
    if (!ownId) return;
    const held = echoes.find((e) => e.userId === ownId && supportCardVariantForHold(e) != null);
    if (!held) return;
    const variant = supportCardVariantForHold(held);
    if (!variant) return;
    // Deferred past layout: the lint rule forbids synchronous setState
    // inside an effect body (this file's highlight effect uses the
    // same setTimeout-0 pattern). The ref is set inside the callback,
    // so a cleanup before it fires does not permanently block a retry.
    const timer = setTimeout(() => {
      if (supportCardShownThisSessionRef.current) return;
      supportCardShownThisSessionRef.current = true;
      requestSupportCard(variant);
    }, 0);
    return () => clearTimeout(timer);
  }, [echoes, state.user?.id, requestSupportCard]);

  // Realtime: new public posts light a pill instead of yanking the list.
  // If Realtime isn't enabled for these tables the subscription simply
  // never fires — pull-to-refresh and focus refetch still cover it.
  useEffect(() => {
    if (wallScope !== 'public') return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('public-wall')
        // Audit round 4, lane 5 (G-M2): defense in depth — the public
        // channel must never carry circle-scoped rows. RLS on Realtime
        // is the primary gate (verify it live, post-deploy: the lane
        // report checklist); this filter means a loosened Realtime
        // config still cannot stream a private circle post's full row
        // to a public-wall subscriber. Testimonies have no circle_id,
        // so their subscription is unchanged.
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_echoes', filter: 'circle_id=is.null' }, (payload) => {
          const row = payload.new as { id?: string; user_id?: string; hidden_at?: string | null } | null;
          const id = row?.id;
          // Fix-everything G7: a held INSERT must never light the
          // pill — it never appears in the feed, so a count for it
          // is a phantom. (No content leak: the pill is a count only.)
          if (id && row?.hidden_at == null && !ownEchoIdsRef.current.has(id)
            && !(row?.user_id && mutedAuthorIdsRef.current.has(row.user_id))) {
            setNewEchoCount((c) => c + 1);
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_testimonies' }, (payload) => {
          // Audit round 4, fix lane 1 (M-W4/M-W7): mirror the echo
          // handler — a muted author's testimony must not light the
          // pill either. (The pill is a count, never payload content.)
          const row = payload.new as { id?: string; user_id?: string; hidden_at?: string | null } | null;
          const id = row?.id;
          if (id && row?.hidden_at == null && !(row?.user_id && mutedAuthorIdsRef.current.has(row.user_id))) {
            setNewTestimonyCount((c) => c + 1);
          }
        })
        .subscribe();
    } catch {
      // Realtime unavailable — the wall still refreshes manually.
    }
    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [wallScope]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadEchoesPage(true), loadTestimoniesPage(true)]);
    } finally {
      setRefreshing(false);
      setNewEchoCount(0);
      setNewTestimonyCount(0);
      setWallError(null);
    }
  }, [loadEchoesPage, loadTestimoniesPage]);

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
      "It disappears from your wall right away and is saved for review.",
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
              } catch (err) {
                // Fix-everything G2: see confirmReportEcho.
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes('MODERATION_REPORT_LIMIT')) {
                  Alert.alert('Report limit reached', 'You’ve reached today’s report limit. Try again tomorrow.');
                } else {
                  Alert.alert("Couldn't report this", 'Check your connection and try again.');
                }
              }
            })();
          },
        },
      ],
    );
  };

  // Load the user's private circles for the scope switcher.
  // Skipped entirely while Circles are hidden — the wall stays public-scoped.
  useEffect(() => {
    if (!FEATURES.circles) return;
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
    // The composer renders in-flow near the top of the wall; a tap
    // from deep in the feed used to change nothing on screen (the
    // composer opened above the viewport). Bring it into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Wall order (Kai, 2026-10-23): requests lead, testimonies sit below them.
  // The pointer near the top scrolls to the testimonies section; it only
  // appears when requests are on screen above the testimonies.
  const scrollRef = useRef<ScrollView>(null);
  const testimonySectionRef = useRef<View>(null);
  const scrollToTestimonies = () => {
    const section = testimonySectionRef.current;
    const scroll = scrollRef.current;
    if (!section || !scroll) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    section.measureLayout(
      findNodeHandle(scroll) as number,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 16), animated: true });
      },
      () => {}
    );
  };
  const showTestimonyPointer =
    wallScope === 'public' && !testimoniesLoading && testimonies.length > 0 && echoes.length > 0;

  // First paint gate: while the initial fetch is in flight, show the
  // skeleton so nothing paints as if it were real wall content.
  const wallLoading = echoesLoading || (wallScope === 'public' && testimoniesLoading);
  const wallSkeleton = (
    <View testID="wall-loading-skeleton">
      <View style={styles.wallSkeletonCard} />
      <View style={styles.wallSkeletonCard} />
      <View style={[styles.wallSkeletonCard, styles.wallSkeletonCardShort]} />
    </View>
  );

  const testimoniesBlock = wallScope === 'public' && !testimoniesLoading && testimonies.length > 0 ? (
    <View ref={testimonySectionRef} style={styles.testimonySection}>
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
            {isOwn && t.hiddenAt && (
              <Text style={[styles.testimonyDate, { fontFamily: Fonts.titleLight }]}>
                Not on the wall yet. It is saved for review, and only you can see it here.
              </Text>
            )}
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
      {testimoniesHasMore && (
        <Pressable
          onPress={() => void loadTestimoniesPage(false, testimonies[testimonies.length - 1]?.createdAt)}
          disabled={testimoniesLoadingMore}
          style={styles.loadMoreBtn}
          testID="wall-load-more-testimonies"
        >
          <Text style={[styles.loadMoreBtnText, { fontFamily: Fonts.titleMedium }]}>
            {testimoniesLoadingMore ? 'LOADING…' : 'LOAD MORE TESTIMONIES'}
          </Text>
        </Pressable>
      )}
    </View>
  ) : null;

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
        <ScrollView ref={scrollRef} bounces={true} decelerationRate="fast" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="community-scroll" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}>
          <Animated.View style={{ opacity: headerFadeAnim, transform: [{ translateY: headerSlideAnim }] }}>
            <Text style={[styles.eyebrow, { fontFamily: Fonts.titleMedium }]}>PRAY TOGETHER</Text>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Never pray{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.italicMedium }}>alone.</Text>
            </Text>

            {/* Circles entry card — hidden with the feature (Posture C) */}
            {FEATURES.circles && (
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
                <Text style={[styles.circlesTitle, { fontFamily: Fonts.titleSemiBold }]}>Circles</Text>
                <Text style={[styles.circlesSub, { fontFamily: Fonts.italic }]}>
                  {myCircles.length > 0
                    ? `${myCircles.length} circle${myCircles.length === 1 ? '' : 's'} · pray with people you know`
                    : 'Pray with people you know. Create one or join with a code.'}
                </Text>
              </View>
              <ChevronRight size={16} color={C.chevronMuted} />
            </AnimatedPressable>
            )}
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
                  ? 'You are not alone. Come pray with others here.'
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

            {FEATURES.circles && myCircles.length > 0 && (
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
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.echoAddCard}>
                <Text style={[styles.echoAddTitle, { fontFamily: Fonts.titleBold }]}>
                  {shareScope === 'public' ? 'SHARE WITHOUT YOUR NAME' : 'SHARE WITH YOUR CIRCLE'}
                </Text>
                <TextInput
                  style={[styles.echoAddInput, { fontFamily: Fonts.italic }]}
                  placeholder="How can the community pray for you?"
                  placeholderTextColor={C.textMuted}
                  value={echoInput}
                  onChangeText={setEchoInput}
                  multiline
                  autoFocus
                  maxLength={1000}
                />
                {FEATURES.circles && myCircles.length > 0 && (
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
                  <Pressable onPress={() => setIsSharingToEchoes(false)} style={styles.cancelBtn}>
                    <Text style={[styles.cancelBtnText, { fontFamily: Fonts.titleMedium }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable onPress={handleShareToEchoes} style={styles.echoSaveBtn}>
                    <Text style={[styles.saveBtnMiniText, { fontFamily: Fonts.titleBold }]}>SHARE</Text>
                  </Pressable>
                </View>
                {/* Quiet, one-tap guidelines — a sheet, never a
                    permanent banner, so the composer stays clean. */}
                <Pressable
                  onPress={() => setShowWallGuidelines(true)}
                  style={styles.guidelinesLink}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  testID="wall-guidelines-open"
                  accessibilityRole="button"
                  accessibilityLabel="Open wall guidelines"
                >
                  <Text style={[styles.guidelinesLinkText, { fontFamily: Fonts.titleMedium }]}>
                    Wall guidelines
                  </Text>
                </Pressable>
              </View>
              </KeyboardAvoidingView>
            )}

            {/* While the initial fetch is in flight: skeleton only. */}
            {wallLoading ? wallSkeleton : (
              <>
            {showTestimonyPointer && (
              <Pressable
                onPress={scrollToTestimonies}
                style={styles.testimonyPointer}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                testID="wall-testimonies-pointer"
              >
                <Text style={[styles.testimonyPointerText, { fontFamily: Fonts.titleMedium }]}>
                  TESTIMONIES OF ANSWERED PRAYER
                </Text>
                <ChevronDown size={14} color={C.textMuted} />
              </Pressable>
            )}

            {/* Empty wall: testimonies lead, so nothing sits above them. */}
            {echoes.length === 0 ? testimoniesBlock : null}

            {wallError && (
              <View style={styles.wallErrorBanner} testID="wall-error-banner">
                <Text style={[styles.wallErrorText, { fontFamily: Fonts.titleMedium }]}>{wallError}</Text>
                <Pressable
                  onPress={reloadWall}
                  hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                  style={styles.wallErrorRetry}
                >
                  <Text style={[styles.wallErrorRetryText, { fontFamily: Fonts.titleBold }]}>RETRY</Text>
                </Pressable>
              </View>
            )}

            {(newEchoCount > 0 || newTestimonyCount > 0) && wallScope === 'public' && (
              <Pressable onPress={reloadWall} style={styles.newPrayersPill} testID="wall-new-prayers-pill">
                <Text style={[styles.newPrayersPillText, { fontFamily: Fonts.titleMedium }]}>
                  {newEchoCount + newTestimonyCount} new {newEchoCount + newTestimonyCount === 1 ? 'prayer' : 'prayers'} — tap to see
                </Text>
              </Pressable>
            )}

            {/* M34: suppress the "Silent, for now" block when testimonies
                exist — they already render above via testimoniesBlock,
                so the empty wall is not empty. Public scope only: the
                circle view never renders testimonies. */}
            {echoes.length === 0 && !(wallScope === 'public' && testimonies.length > 0) && !isSharingToEchoes ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🙏</Text>
                <Text style={[styles.emptyTitle, { fontFamily: Fonts.serifRegular }]}>Silent, for now.</Text>
                <Text style={[styles.emptySub, { fontFamily: Fonts.italic }]}>
                  This is where you see others and pray for them. Be the first to share a quiet request.
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
                    // Audit round 3, J-S23: while the user is still
                    // hydrating, treat every card as "own" so the Amen
                    // pill never flashes on your own requests (a signed-in
                    // user's own cards would briefly show a tappable pill
                    // that the server then rejects).
                    isOwn={echo.userId != null && (userLoading || echo.userId === state.user?.id)}
                    highlighted={echo.id === highlightedEchoId}
                    carried={carriedEchoIds.has(echo.id)}
                    onRequestSupportCard={() => {
                      const variant = supportCardVariantForHold(echo);
                      if (variant) {
                        supportCardShownThisSessionRef.current = true;
                        requestSupportCard(variant);
                      }
                    }}
                    onAmen={() => handleAmenEcho(echo.id)}
                    onOptions={echo.userId ? () => showEchoOptions(echo) : undefined}
                    styles={styles}
                    _C={C}
                    Fonts={Fonts}
                  />
                );
              })
            )}

            {echoes.length > 0 && echoesHasMore && (
              <Pressable
                onPress={() => void loadEchoesPage(false, echoes[echoes.length - 1]?.createdAt)}
                disabled={echoesLoadingMore}
                style={styles.loadMoreBtn}
                testID="wall-load-more-echoes"
              >
                <Text style={[styles.loadMoreBtnText, { fontFamily: Fonts.titleMedium }]}>
                  {echoesLoadingMore ? 'LOADING…' : 'LOAD MORE PRAYERS'}
                </Text>
              </Pressable>
            )}

            {/* Requests present: testimonies sit immediately below them. */}
            {echoes.length > 0 ? testimoniesBlock : null}
              </>
            )}

            <View style={styles.echoesFooterSpacer} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      <AgeAttestationModal
        visible={showWallAgeGate}
        onConfirm={() => void confirmWallAgeGate()}
        onDecline={declineWallAgeGate}
      />
      <WallGuidelinesSheet
        visible={showWallGuidelines}
        onClose={() => setShowWallGuidelines(false)}
      />
    </View>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    overflow: 'hidden' as const,
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
    lineHeight: T.scale(17),
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
    lineHeight: T.scale(23),
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
    minHeight: 44,
    justifyContent: 'center',
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
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    fontSize: T.scale(10),
    color: C.textMuted,
    letterSpacing: 1,
  },
  guidelinesLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  guidelinesLinkText: {
    fontSize: T.scale(13),
    color: C.textMuted,
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
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
  // Audit round 3, J-B12: the bell-landing highlight — a thicker accent
  // border so the tapped request is unmissable at the top of the wall.
  echoCardHighlighted: {
    borderColor: C.accent,
    borderWidth: 2,
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
    paddingVertical: 4,
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
  supportCardAffordance: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  supportCardAffordanceText: {
    fontSize: T.scale(13),
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  echoText: {
    fontSize: T.scale(18),
    lineHeight: T.scale(24),
    color: C.textSecondary,
    marginBottom: 20,
  },
  echoTextActive: {
    color: C.text,
  },
  testimonyPointer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  testimonyPointerText: {
    fontSize: T.scale(10.5),
    letterSpacing: 2,
    color: C.textMuted,
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
    lineHeight: T.scale(18),
    color: C.textSecondary,
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
    lineHeight: T.scale(23),
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
    lineHeight: T.scale(20),
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
  // Visible report affordance: reporting was long-press-only before, so
  // most users never found it.
  echoFlagBtn: {
    padding: 6,
    marginLeft: 8,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 12,
  },
  loadMoreBtnText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: C.textMuted,
  },
  wallErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(180,80,60,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(180,80,60,0.30)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  wallErrorText: {
    flex: 1,
    fontSize: T.scale(11),
    color: C.text,
    marginRight: 12,
  },
  wallErrorRetry: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  wallErrorRetryText: {
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  newPrayersPill: {
    alignSelf: 'center',
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  newPrayersPillText: {
    fontSize: T.scale(11),
    color: '#0D0804',
  },
  amenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  amenPillActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  // Intentionally fixed: 🙏 emoji glyph size, not reading text (lane D).
  amenIcon: {
    fontSize: 16,
    opacity: 0.5,
  },
  amenIconActive: {
    opacity: 1,
  },
  amenCount: {
    fontSize: T.scale(14),
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
  wallSkeletonCard: {
    height: 118,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  wallSkeletonCardShort: {
    height: 84,
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
    lineHeight: T.scale(24),
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
    minHeight: 44,
    justifyContent: 'center',
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
    fontSize: T.scale(11),
    letterSpacing: 1.5,
    color: C.accentDark,
  },
});
