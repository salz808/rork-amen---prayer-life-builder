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
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Trash2, Plus, Flag, ChevronDown, HandHeart } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { Fonts } from '@/constants/fonts';
import AgeAttestationModal from '@/components/AgeAttestationModal';
import { Echo } from '@/mocks/echoes';
import { DatabaseService } from '@/lib/database';
import { isHeldWallPost, supportCardVariantForBlock, supportCardVariantForHold } from '@/lib/moderation';
import WallGuidelinesSheet from '@/components/WallGuidelinesSheet';
import { getSafeSession, supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/timeAgo';
import type { Testimony } from '@/types';
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
  // F52: index staggers the hands pulse so the wall doesn't breathe in
  // lockstep; animateIn is true only for cards mounted after the first
  // paint (the first batch is covered by the container entrance).
  index = 0,
  animateIn = false,
  reduceMotion = false,
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
  index?: number;
  animateIn?: boolean;
  reduceMotion?: boolean;
}) {
  const scale = useState(() => new Animated.Value(1))[0]
  const glowOpacity = useState(() => new Animated.Value(0))[0]
  const countScale = useState(() => new Animated.Value(1))[0]
  // F52 — living motion, restrained: the HandHeart icon breathes slowly; a new
  // card fades/slides in; the "Prayed ✓" hint pops softly in place (F53).
  const handsPulse = useState(() => new Animated.Value(1))[0]
  const enterOpacity = useState(() => new Animated.Value(animateIn && !reduceMotion ? 0 : 1))[0]
  const enterY = useState(() => new Animated.Value(animateIn && !reduceMotion ? 10 : 0))[0]
  const prayedPop = useState(() => new Animated.Value(1))[0]
  const prevAmensRef = useRef(echo.amens);
  const ownTapRef = useRef(false);

  // F52: hands breathe — one slow cycle every ~2.8s, staggered per card so
  // the wall feels alive without pulsing in unison. Still once prayed, or
  // with Reduce Motion on.
  useEffect(() => {
    if (reduceMotion || isOwn || isAmened) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(handsPulse, { toValue: 1.08, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(handsPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), (index % 6) * 450);
    return () => {
      clearTimeout(timer);
      loop.stop();
      handsPulse.setValue(1);
    };
  }, [reduceMotion, isOwn, isAmened, index, handsPulse]);

  // F52: a card mounted after the first paint (a new prayer, load-more,
  // refresh) fades/slides in. The first batch mounts still — the container
  // entrance already carries it.
  useEffect(() => {
    if (!animateIn || reduceMotion) return;
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enterY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [animateIn, reduceMotion, enterOpacity, enterY]);

  // F53: when the hint flips to "Prayed ✓" it pops softly, in place.
  useEffect(() => {
    if (!isAmened || reduceMotion) return;
    prayedPop.setValue(0.94);
    Animated.spring(prayedPop, { toValue: 1, tension: 160, friction: 12, useNativeDriver: true }).start();
  }, [isAmened, reduceMotion, prayedPop]);

  // F52: the praying count ticks softly when it moves for another reason
  // than this card's own tap (someone else praying while you watch). The
  // own-tap spring in handlePress already covers the tap itself.
  useEffect(() => {
    if (echo.amens === prevAmensRef.current) return;
    const wasOwnTap = ownTapRef.current;
    ownTapRef.current = false;
    prevAmensRef.current = echo.amens;
    if (wasOwnTap || reduceMotion) return;
    Animated.sequence([
      Animated.spring(countScale, { toValue: 1.12, tension: 160, friction: 12, useNativeDriver: true }),
      Animated.spring(countScale, { toValue: 1, tension: 120, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [echo.amens, reduceMotion, countScale]);

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

    // F52: the count ticks softly (was 1.4 — too loud for a prayer space).
    Animated.sequence([
      Animated.spring(countScale, { toValue: 1.18, useNativeDriver: true, tension: 200, friction: 8 }),
      Animated.spring(countScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 10 }),
    ]).start();

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ownTapRef.current = true;
    onAmen();
  };

  return (
    <Animated.View style={[
      styles.echoCard,
      isAmened && styles.echoCardActive,
      highlighted && styles.echoCardHighlighted,
      { opacity: enterOpacity, transform: [{ scale }, { translateY: enterY }] },
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
        {/* F53: the confirmation no longer jumps to a top-right badge —
            it morphs in place at the bottom-right, where the finger was
            (see the footer below). The header keeps only the timestamp —
            and the report flag, moved up from the footer so the footer
            holds exactly one action (4x pass). */}
        <View style={styles.echoHeader}>
          <Text style={styles.echoTime}>{timeAgo(echo.createdAt)}</Text>
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
            <Text style={[styles.carriedBadgeText, { fontFamily: Fonts.titleBold }]}>YOU PRAYED FOR THIS</Text>
          </View>
        )}
        {/* 4x pass: one Amen action, not two pills. The count and the state
            live in a single full-width pill — [icon] 15 praying · Tap to say
            Amen — which morphs in place to Prayed ✓ (F53, same container,
            same spot). The 🙏 emoji is a drawn HandHeart now; the whole
            card is still the tap target. */}
        <View style={styles.echoFooter}>
          {isOwn ? (
            <Text style={[styles.amenCount, { fontFamily: Fonts.titleBold }]}>
              {echo.amens} praying
            </Text>
          ) : (
            <Animated.View style={[
              styles.amenAction,
              isAmened && styles.amenActionActive,
              { transform: [{ scale: prayedPop }] },
            ]}>
              <Animated.View style={{ transform: [{ scale: handsPulse }] }}>
                <HandHeart size={15} color={isAmened ? _C.accentDark : _C.iconMuted} />
              </Animated.View>
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
              <Text style={[styles.amenLabel, isAmened && styles.amenCountActive, { fontFamily: Fonts.titleLight }]}>
                ·
              </Text>
              <Text
                style={[
                  styles.tapToAmen,
                  { fontFamily: isAmened ? Fonts.titleBold : Fonts.titleLight },
                ]}
                numberOfLines={1}
              >
                {isAmened ? 'Prayed ✓' : 'Tap to say Amen'}
              </Text>
            </Animated.View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Community tab — the Prayer Wall and Testimonies feed.
 * One destination for everything shared. The wall is public-only.
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
  // loaders stay memoized — a state.user?.id dep trips
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

  // Bell landing: tapping a prayer notification routes here with
  // highlightEchoId (+ a highlightNonce so repeat taps re-land). Once the
  // first page has loaded, fetch that echo and prepend it if it is not
  // already on screen, then scroll to the top and briefly highlight the
  // card — audit round 3, J-B12: the old code neither scrolled nor
  // highlighted, so the tap landed on whatever the wall happened to show.
  const wallParams = useLocalSearchParams();
  const highlightEchoId =
    typeof wallParams.highlightEchoId === 'string' ? wallParams.highlightEchoId : undefined;
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

  // 4x pass: the hero is gone, so the entrance is the content alone —
  // no stagger, no hero fade/slide.
  const contentFadeAnim = useState(() => new Animated.Value(0))[0]
  const contentSlideAnim = useState(() => new Animated.Value(16))[0]

  useEffect(() => {
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
    ]).start();
  }, [contentFadeAnim, contentSlideAnim]);

  // F52 — living motion on the Wall, restrained. A quiet pulsing dot on
  // the presence row; renders still with Reduce Motion on.
  const reduceMotion = useReduceMotion();
  const presenceDotOpacity = useState(() => new Animated.Value(0.5))[0]

  useEffect(() => {
    if (reduceMotion) {
      presenceDotOpacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(presenceDotOpacity, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(presenceDotOpacity, { toValue: 0.4, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [reduceMotion, presenceDotOpacity]);

  // F52: cards mounted after the first paint fade/slide in; the first
  // batch is covered by the container entrance, so it mounts still. The
  // ref flips in an effect — after the render that first shows the wall —
  // so the first batch always reads false at mount.
  const wallSettledRef = useRef(false);
  useEffect(() => {
    if (!echoesLoading && echoes.length > 0) wallSettledRef.current = true;
  }, [echoesLoading, echoes.length]);

  // F52: a quiet "someone is praying now" presence — honest, from real
  // data only: it shows when the newest public prayer is under an hour
  // old, and stays hidden on a quiet wall rather than inventing life.
  const newestEcho = echoes[0] ?? null;
  const showPresence =
    newestEcho != null &&
    Date.now() - new Date(newestEcho.createdAt).getTime() < 60 * 60 * 1000;

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
        // Consume (never re-record) after the write: a minted
        // anonymous id gets stamped into the map; a seed Amen
        // mints no session, so the flag is dropped and the next
        // write re-prompts instead of riding a standing pass.
        void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
      } catch {
        // The write reports its own errors; the gate must not add a second.
        // The pending flag survives a failed write by design (the
        // consume above runs only after success), so a retry of
        // this same write passes the gate — and its success
        // consumes the flag.
      } finally {
        wallGateBypassRef.current = false;
      }
    } else {
      void DatabaseService.recordAgeAttestation().catch(() => {});
      // No write follows, so there is nothing to consume after:
      // recording here could strand a pending flag with no write
      // to consume it. Consuming is a no-op when no flag exists
      // and stamps the map when an anonymous session does.
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
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
      const newEcho = await DatabaseService.createCommunityEcho(echoInput.trim());
      if (!newEcho) {
        throw new Error('No prayer request was returned after saving.');
      }
      // Audit fix F7: consume a pending pre-session attestation once
      // it has authorized this write (stamped under the minted id when
      // one exists, otherwise dropped) — never a standing pass for a
      // later account. Best-effort; the post already landed.
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
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
            'This prayer contains language that can’t appear on the wall, so it wasn’t shared. Your words are still here. You can reword and try again.',
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
      // Audit fix F7: consume the pending flag once it authorized
      // this write (a seed Amen mints no session, so this drops the
      // flag and the next seed Amen re-prompts — tighter by design).
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
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
      // Audit fix F7: consume the pending flag once this Amen landed
      // (see the share path note above).
      void DatabaseService.consumeAnonymousAgeAttestationPending().catch(() => {});
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
      // Coordinator integration (M1): reuse the mount-cached muted
      // set once loaded, instead of re-reading the mute tables here.
      const mutedOpt = mutedLoadedRef.current ? { mutedAuthors: mutedAuthorIdsRef.current } : undefined;
      const dbEchoes = await DatabaseService.getCommunityEchoes(
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
    } catch (error) {
      console.error('[PrayerWall] loadEchoesPage FAILED:', error);
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
  }, []);

  // Community testimonies — publicly shared answered prayers. Free for all.
  const loadTestimoniesPage = useCallback(async (reset: boolean, cursor?: string) => {
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
    } catch (error) {
      console.error('[PrayerWall] loadTestimoniesPage FAILED:', error);
      if (reset) {
        setTestimonies([]);
        setWallError('The wall couldn’t load. Check your connection and try again.');
      } else {
        setWallError('Couldn’t load more testimonies. Try again.');
      }
    } finally {
      if (reset) setTestimoniesLoading(false); else setTestimoniesLoadingMore(false);
    }
  }, []);

  const reloadWall = useCallback(() => {
    setWallError(null);
    setNewEchoCount(0);
    setNewTestimonyCount(0);
    void loadEchoesPage(true);
    void loadTestimoniesPage(true);
  }, [loadEchoesPage, loadTestimoniesPage]);

  // Load the public wall.
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
    // Unconfigured client: no Realtime subscription; pull-to-refresh
    // and focus refetch still cover the wall.
    if (!supabase) return;
    // Narrowed local binding: TS resets imported-variable narrowing
    // inside closures (the cleanup below), so capture it once here.
    const client = supabase;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    try {
      channel = client
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
        void client.removeChannel(channel);
      }
    };
  }, []);

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


  const openEchoComposer = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSharingToEchoes(true);
    // The composer renders in-flow near the top of the wall; a tap
    // from deep in the feed used to change nothing on screen (the
    // composer opened above the viewport). Bring it into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Wall order (Kai, 2026-10-23): requests lead, testimonies sit below them.
  // The pointer near the top scrolls to the testimonies section; it only
  // appears when requests are on screen above the testimonies.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const testimonySectionRef = useRef<ViewInstance>(null);
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
    !testimoniesLoading && testimonies.length > 0 && echoes.length > 0;

  // First paint gate: while the initial fetch is in flight, show the
  // skeleton so nothing paints as if it were real wall content.
  const wallLoading = echoesLoading || testimoniesLoading;
  const wallSkeleton = (
    <View testID="wall-loading-skeleton">
      <View style={styles.wallSkeletonCard} />
      <View style={styles.wallSkeletonCard} />
      <View style={[styles.wallSkeletonCard, styles.wallSkeletonCardShort]} />
    </View>
  );

  const testimoniesBlock = !testimoniesLoading && testimonies.length > 0 ? (
    <View ref={testimonySectionRef} style={styles.testimonySection}>
      <View style={styles.testimonySectionHeader}>
        <Text style={[styles.testimonySectionTitle, { fontFamily: Fonts.serifSemiBold }]}>
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
                {t.firstName}
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
          {/* 4x pass: the hero is gone — it said the same thing three times
              ("PRAY TOGETHER" / "Never pray alone." / "Prayer Wall" + sub)
              and ate ~40% of the screen before the first request. The
              header below ("Prayer Wall" + one warm subline) is the whole
              header now. */}
          <Animated.View style={[styles.entriesContainer, { opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }]}>
            {/* F52: quiet presence — only when a prayer landed in the last
                hour, so it never invents life on a quiet wall. */}
            {showPresence && newestEcho && (
              <View style={styles.presenceRow}>
                <Animated.View style={[styles.presenceDot, { backgroundColor: C.accent, opacity: presenceDotOpacity }]} />
                <Text style={[styles.presenceText, { fontFamily: Fonts.titleLight }]}>
                  Someone prayed here {timeAgo(newestEcho.createdAt)} ago
                </Text>
              </View>
            )}
            <View style={styles.echoesHeader}>
              <Text style={[styles.echoesTitle, { fontFamily: Fonts.serifMedium }]}>
                Prayer Wall
              </Text>
              <Text style={[styles.echoesSub, { fontFamily: Fonts.italic }]}>
                You are not alone. Come pray with others here.
              </Text>
              <Pressable
                onPress={openEchoComposer}
                style={styles.requestPrayerBtn}
              >
                <Plus size={15} color={C.accent} strokeWidth={2.5} />
                <Text style={[styles.requestPrayerBtnText, { fontFamily: Fonts.titleBold }]}>REQUEST PRAYER</Text>
              </Pressable>
            </View>

            {isSharingToEchoes && (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.echoAddCard}>
                <Text style={[styles.echoAddTitle, { fontFamily: Fonts.titleBold }]}>
                  SHARE WITHOUT YOUR NAME
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
                {/* Public-visibility note (ChatGPT submission audit
                    2026-11-12, Justin-approved): the composer never
                    said the request goes public. One quiet line,
                    not a banner, so the composer stays clean. */}
                <Text style={[styles.echoPublicNote, { fontFamily: Fonts.titleMedium }]}>
                  Your request will be visible to the TRIAD community. Please don’t share private details about yourself or others.
                </Text>
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

            {(newEchoCount > 0 || newTestimonyCount > 0) && (
              <Pressable onPress={reloadWall} style={styles.newPrayersPill} testID="wall-new-prayers-pill">
                <Text style={[styles.newPrayersPillText, { fontFamily: Fonts.titleMedium }]}>
                  {newEchoCount + newTestimonyCount} new {newEchoCount + newTestimonyCount === 1 ? 'prayer' : 'prayers'}. Tap to see
                </Text>
              </Pressable>
            )}

            {/* M34: suppress the "Silent, for now" block when testimonies
                exist — they already render above via testimoniesBlock,
                so the empty wall is not empty. Audit §8b: a failed
                load is not an empty wall — suppress the empty state
                (and its copy) while the error banner is set, so the
                error shows alone. */}
            {echoes.length === 0 && !(testimonies.length > 0) && !isSharingToEchoes && !wallError ? (
              <View style={styles.emptyContainer}>
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
              echoes.map((echo, index) => {
                const isAmened = mergedAmenedEchoes.has(echo.id);
                return (
                  <EchoCard
                    key={echo.id}
                    echo={echo}
                    isAmened={isAmened}
                    // F52: stagger the hands pulse; animate in only once
                    // the wall has settled (see wallSettledRef).
                    index={index}
                    animateIn={wallSettledRef.current}
                    reduceMotion={reduceMotion}
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
    // Clearance for the floating tab bar (~100pt incl. its bottom offset)
    // plus breathing room, so the last content — including the empty-state
    // SHARE A REQUEST button — never rests underneath it (audit §8b).
    paddingBottom: 176,
  },
  // F52: quiet presence row — a softly pulsing dot and one
  // factual line, shown only while the wall has had a prayer in the
  // last hour.
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presenceText: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 0.5,
    color: C.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.textSecondary,
  },
  emptySub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.5,
    color: C.accentDark,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    color: C.textSecondary,
    letterSpacing: 1,
  },
  guidelinesLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  guidelinesLinkText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  saveBtnMiniText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#FFF',
    letterSpacing: 1,
  },
  echoesHeader: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  echoesTitle: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: C.text,
    marginBottom: 4,
  },
  echoesSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.4,
    color: C.accentDark,
  },
  echoCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    // 4x pass: 24pt of padding around a two-line quote read as empty
    // space; 20pt keeps the card calm without the void.
    padding: 20,
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
  echoTime: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    letterSpacing: 1,
  },
  supportCardAffordance: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  supportCardAffordanceText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    letterSpacing: 0.5,
  },
  echoText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginBottom: 16,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 2,
    color: C.textSecondary,
  },
  testimonySection: {
    marginTop: 32,
  },
  testimonySectionHeader: {
    marginBottom: 16,
  },
  testimonySectionTitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: C.text,
  },
  testimonySectionSub: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
  testimonyRequest: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  testimonyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testimonyName: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.accentDark,
    flex: 1,
  },
  testimonyDate: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    marginRight: 8,
  },
  testimonyActions: {
    flexDirection: 'row',
  },
  testimonyActionBtn: {
    padding: 6,
  },
  // F51: the footer wraps instead of clipping — the pill, the hint and
  // the flag get real gaps, and the hint drops to its own line (still
  // bottom-right, via marginLeft auto on the wrap) rather than running
  // into the card's edge.
  echoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    rowGap: 8,
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
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 1.5,
    color: C.textSecondary,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    marginRight: 12,
  },
  wallErrorRetry: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  wallErrorRetryText: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#0D0804',
  },
  // 4x pass: one Amen action per card — the count and the state share a
  // single full-width pill (see the footer in EchoCard). The old two-pill
  // split (amenPill + tapToAmenWrap) and the 🙏 emoji are gone.
  amenAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  amenActionActive: {
    backgroundColor: C.accentBg,
    borderColor: C.accent,
  },
  amenCount: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
  },
  amenCountActive: {
    color: C.accentDark,
  },
  amenLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    color: C.textSecondary,
  },
  tapToAmen: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
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
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    letterSpacing: 2,
    color: C.accent,
    marginBottom: 16,
  },
  echoAddInput: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.text,
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  echoPublicNote: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
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
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    letterSpacing: 1.5,
    color: C.accentDark,
  },
});
