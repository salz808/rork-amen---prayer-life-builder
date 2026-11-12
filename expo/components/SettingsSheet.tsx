import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  Switch,
  Platform,
  ScrollView,
  Easing,
  Alert } from 'react-native';
import {
  X,
  Music2,
  Moon,
  Sun,
  AlignLeft,
  Heart,
  Lock,
  Bell,
  ChevronDown,
  LogOut,
  LogIn,
  RefreshCw,
  Trash2,
  ExternalLink,
  Volume2,
  Mic2,
  Gauge,
  Clock,
  User,
  Shield,
  Bug,
  Sparkles,
  Play,
  Square,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from './FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { SOUNDSCAPE_MAP, SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';
import { AudioManager } from '@/lib/audioManager';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { Soundscape, ThemePreference, UserTier } from '@/types';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { DatabaseService } from '@/lib/database';
import { hasAnonymousSession } from '@/lib/supabase';

// Steal B: Settings needs its own restore path — same lazy RevenueCat
// require as the paywall (react-native-purchases may be absent in some
// builds, so this must not throw at import time).
const getPurchases = () => {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
};

const SOUNDSCAPE_ICONS: Record<Soundscape, typeof Music2> = {
  throughTheDoor: Music2,
  firstLight: Sun,
  reunion: Heart,
  monastic: Mic2,
};

const ENTRANCE_ITEM_COUNT = 5;

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const C = useColors();
  const T = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(T), [T]);
  const {
    state,
    setSoundscape,
    setFontSize,
    updateReminderTime,
    setAdaptiveReminderEnabled,
    signOut,
    deleteAccount,
    syncSubscription,
    toggleVoiceover,
    hasFeature,
    setThemePreference,
    setPlaybackRate,
  } = useApp();

  // Finding 07 (device review 2026-11-10): widgets are a native
  // extension that only ships in a real build — Expo Go has no widget
  // module, so TRIAD never appears in the widget picker from this
  // preview. Same honest-Expo-Go detection as Give (Constants
  // .appOwnership === 'expo').
  const isExpoGo = Constants.appOwnership === 'expo';

  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [lockFeature, setLockFeature] = useState<{ name: string; req: string }>({ name: '', req: '' });
  const [timePickerVisible, setTimePickerVisible] = useState<boolean>(false);
  const [tempHour, setTempHour] = useState<string>('8');
  const [tempMin, setTempMin] = useState<string>('00');
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  // Audit round 3, S9: double-tap sign-out guard (same pattern as delete).
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);
  // Steal B: double-tap restore guard (same pattern as sign-out/delete).
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  // Muted wall authors — loaded when the sheet opens. A mute used to be
  // permanent and invisible (no UI ever called unmute); the section below
  // renders only when there is something to unmute.
  const [mutedAuthors, setMutedAuthors] = useState<{ id: string; label: string }[] | null>(null);
  const [unmutingId, setUnmutingId] = useState<string | null>(null);
  // Prayer-wall bell toggle — loaded when the sheet opens, written
  // straight to the profiles column the amen RPC reads. Until the
  // migration lands the read defaults to true and a write errors, so
  // the toggle reverts with feedback instead of pretending to save.
  const [wallPrayerNotifications, setWallPrayerNotifications] = useState<boolean | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void DatabaseService.getWallPrayerNotificationsEnabled().then((value) => {
      if (!cancelled) setWallPrayerNotifications(value);
    });
    return () => { cancelled = true; };
  }, [visible]);

  // Round-5 lane 2, B-1 + M-6: a guest (no session) or an anonymous session
  // has no cloud account, so Sign Out would wipe their only, device-local
  // copy of progress and Delete Account would dead-end. Until the session
  // check resolves (null), neither row renders — the check is local and
  // fast, and defaulting to "no account" would flash the wrong row at
  // signed-in users. The signOut/delete logic itself is untouched.
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void Promise.all([DatabaseService.getCurrentUserId(), hasAnonymousSession()]).then(
      ([userId, anonymous]) => {
        if (!cancelled) setHasAccount(userId !== null && !anonymous);
      },
    );
    return () => { cancelled = true; };
  }, [visible]);

  // Moderation stack: the review row appears only for flagged moderators.
  // Defaults to hidden; a failed lookup hides the row rather than
  // exposing a dead entry point.
  const [isModerator, setIsModerator] = useState<boolean>(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void DatabaseService.getIsModerator().then((value) => {
      if (!cancelled) setIsModerator(value);
    });
    return () => { cancelled = true; };
  }, [visible]);

  const toggleWallPrayerNotifications = () => {
    if (wallPrayerNotifications === null) return;
    const next = !wallPrayerNotifications;
    setWallPrayerNotifications(next);
    void DatabaseService.setWallPrayerNotificationsEnabled(next).catch(() => {
      setWallPrayerNotifications(!next);
      Alert.alert('Couldn’t save that', 'Check your connection and try again.');
    });
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [ids, names] = await Promise.all([
          DatabaseService.getMutedAuthorIds(),
          DatabaseService.getMutedAuthorDisplayNames(),
        ]);
        if (cancelled) return;
        setMutedAuthors(Array.from(ids).map((id) => ({
          id,
          label: names.get(id) ?? 'Anonymous prayer author',
        })));
      } catch {
        if (!cancelled) setMutedAuthors([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [visible]);

  const handleUnmuteAuthor = async (authorId: string) => {
    setUnmutingId(authorId);
    try {
      await DatabaseService.unmuteAuthorEverywhere(authorId);
      setMutedAuthors((prev) => (prev ?? []).filter((a) => a.id !== authorId));
    } catch {
      Alert.alert("Couldn't unmute", 'Check your connection and try again.');
    } finally {
      setUnmutingId(null);
    }
  };

  const slideAnim = useState(() => new Animated.Value(560))[0]
  const bgAnim = useState(() => new Animated.Value(0))[0]
  const pickerSlideAnim = useState(() => new Animated.Value(80))[0]
  const pickerBgAnim = useState(() => new Animated.Value(0))[0]
  const [entranceAnims] = useState(() =>
    Array.from({ length: ENTRANCE_ITEM_COUNT }, () => new Animated.Value(0)),
  );

  const currentReminder = state.user?.reminderTime?.trim() || '8:00 PM';

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(560);
      bgAnim.setValue(0);
      entranceAnims.forEach((anim) => anim.setValue(0));

      // Entrance fades run CONCURRENTLY with the slide, never chained behind
      // it: the previous choreography held every section at opacity 0 until
      // the slide spring's completion callback fired, then staggered them in
      // — the sheet arrived empty and content trickled in afterwards, which
      // read as a "weird delay" after tapping Settings.
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 27,
          stiffness: 260,
          mass: 1,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.stagger(
          25,
          entranceAnims.map((anim) =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            })
          )
        ),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 560,
        duration: 220,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(bgAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [bgAnim, entranceAnims, slideAnim, visible]);

  useEffect(() => {
    if (timePickerVisible) {
      pickerSlideAnim.setValue(80);
      pickerBgAnim.setValue(0);
      Animated.parallel([
        Animated.spring(pickerSlideAnim, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pickerBgAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(pickerSlideAnim, {
        toValue: 80,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pickerBgAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pickerBgAnim, pickerSlideAnim, timePickerVisible]);

  const handleSoundscape = (id: Soundscape) => {
    stopPreview();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSoundscape(id);
  };

  // Finding 08 (device review 2026-11-10, Justin's words): preview a
  // soundscape for 10–15 seconds even when it is locked. A 12-second
  // sample, faded in and out like the session Selah bed (same 12-step
  // curve to volume 0.3), plays WITHOUT unlocking or selecting the
  // soundscape, then auto-stops. A locked sample ends with the gentle
  // Partner prompt (the existing lock sheet) — try before you buy.
  // The player is local to this sheet and released on stop, on sheet
  // close, and on unmount, so a preview can never keep playing behind
  // the sheet or leak into a session.
  const PREVIEW_SECONDS = 12;
  const PREVIEW_FADE_MS = 1500;
  const PREVIEW_TARGET_VOLUME = 0.3;
  const [previewingId, setPreviewingId] = useState<Soundscape | null>(null);
  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const previewFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    if (previewFadeRef.current) { clearInterval(previewFadeRef.current); previewFadeRef.current = null; }
    if (previewStopRef.current) { clearTimeout(previewStopRef.current); previewStopRef.current = null; }
    const player = previewPlayerRef.current;
    previewPlayerRef.current = null;
    setPreviewingId(null);
    if (player) {
      try { if (player.playing) player.pause(); } catch {}
      try { player.release(); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!visible) stopPreview();
  }, [visible, stopPreview]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const handlePreviewSoundscape = async (id: Soundscape, isLocked: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Tapping the playing preview stops it.
    if (previewingId === id) { stopPreview(); return; }
    stopPreview();
    const option = SOUNDSCAPE_MAP[id];
    if (!option) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      const localUri = await AudioManager.getLocalUri(id, option.uri);
      const player = createAudioPlayer({ uri: localUri });
      previewPlayerRef.current = player;
      player.loop = false;
      player.volume = 0;
      player.play();
      setPreviewingId(id);
      // Fade in over ~1.5s.
      const STEPS = 12;
      let step = 0;
      previewFadeRef.current = setInterval(() => {
        step++;
        try {
          if (previewPlayerRef.current) {
            previewPlayerRef.current.volume = Math.min((step / STEPS) * PREVIEW_TARGET_VOLUME, PREVIEW_TARGET_VOLUME);
          }
        } catch {}
        if (step >= STEPS && previewFadeRef.current) {
          clearInterval(previewFadeRef.current);
          previewFadeRef.current = null;
        }
      }, 125);
      // Auto-stop at 12s: fade out over the last 1.5s, then stop. A
      // locked sample ends with the Partner prompt, not a dead end.
      previewStopRef.current = setTimeout(() => {
        let outStep = 0;
        const OUT_STEPS = 12;
        previewFadeRef.current = setInterval(() => {
          outStep++;
          try {
            if (previewPlayerRef.current) {
              previewPlayerRef.current.volume = Math.max(PREVIEW_TARGET_VOLUME * (1 - outStep / OUT_STEPS), 0);
            }
          } catch {}
          if (outStep >= OUT_STEPS) {
            if (previewFadeRef.current) { clearInterval(previewFadeRef.current); previewFadeRef.current = null; }
            stopPreview();
            if (isLocked) {
              setLockFeature({ name: option.label, req: getFeatureRequirement('AMBIENT_SOUNDSCAPES_COUNT') });
              setLockVisible(true);
            }
          }
        }, 125);
      }, PREVIEW_SECONDS * 1000 - PREVIEW_FADE_MS);
    } catch (error) {
      if (__DEV__) console.log('[SoundscapePreview] error:', error);
      stopPreview();
    }
  };

  const handleFontSize = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFontSize(state.fontSize === 'normal' ? 'large' : 'normal');
  };

  const playbackRange = String(hasFeature('PLAYBACK_SPEED_RANGE')) as 'full' | 'standard' | 'limited' | '1x';
  const playbackOptions = useMemo<number[]>(() => {
    if (playbackRange === 'full') return [0.5, 0.75, 1, 1.25, 1.5, 2];
    if (playbackRange === 'standard') return [0.5, 0.75, 1, 1.25, 1.5];
    if (playbackRange === 'limited') return [0.8, 1, 1.2];
    return [1];
  }, [playbackRange]);
  const playbackLocked = playbackRange === '1x';
  const currentRate = state.playbackRate ?? 1;

  const handlePlaybackRate = (rate: number) => {
    if (playbackLocked) {
      setLockFeature({ name: 'Playback Speed', req: getFeatureRequirement('PLAYBACK_SPEED_RANGE') });
      setLockVisible(true);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaybackRate(rate);
  };

  const handleVoiceover = () => {
    if (!hasFeature('VOICEOVER')) {
      setLockFeature({ name: 'Voiceover Guidance', req: getFeatureRequirement('VOICEOVER') });
      setLockVisible(true);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleVoiceover();
  };

  const openTimePicker = () => {
    const [time, period] = currentReminder.split(' ');
    const [hourValue, minValue] = time.split(':');
    setTempHour(hourValue ?? '8');
    setTempMin(minValue ?? '00');
    setTempAmPm(period === 'PM' ? 'PM' : 'AM');
    setTimePickerVisible(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveTime = async () => {
    const newTime = `${tempHour}:${tempMin} ${tempAmPm}`;
    updateReminderTime(newTime);
    setTimePickerVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // A saved time with denied permission silently never fires (the
    // scheduler returns early). 'denied' is the only case worth an
    // alert: 'undetermined' is left to the scheduler's own permission
    // request, which updateReminderTime just kicked off.
    try {
      if (Platform.OS === 'web') return;
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'denied') {
        Alert.alert(
          'Notifications are off',
          'Your reminder time is saved, but reminders can’t fire until notifications are allowed. Turn them on in Settings to receive it.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
      }
    } catch {
      // Permission check is advisory — the time is already saved.
    }
  };

  const handleSignOut = () => {
    // Round-5 lane 2, B-1 defence in depth: the guest row never calls this,
    // but if the session changed since the sheet opened, a guest must be
    // routed to sign-in, never into the data-wiping signOut path.
    if (hasAccount === false) {
      onClose();
      setTimeout(() => router.push('/auth'), 320);
      return;
    }
    if (isSigningOut) return;
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          if (isSigningOut) return;
          setIsSigningOut(true);
          void signOut();
          onClose();
        },
      },
    ]);
  };

  // Steal B — "Already a Partner?" restore path: same RevenueCat call
  // and alert copy as the paywall's restoreMutation (Settings had no
  // restore handler before this). Success syncs the granted
  // entitlements through AppProvider, exactly as the paywall does.
  const handleRestorePurchases = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const Purchases = getPurchases();
      if (!Purchases) throw new Error('Purchases not available');
      const customerInfo = await Purchases.restorePurchases();
      const activeEntitlements = Object.keys(customerInfo.entitlements.active ?? {});
      if (activeEntitlements.length > 0) {
        syncSubscription(activeEntitlements);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Welcome back. Your Partner access is restored.');
      } else {
        Alert.alert('Nothing to restore', "We couldn't find a past subscription on this store account. If you subscribed with a different Apple ID or Google account, sign in with that one and try again.");
      }
    } catch {
      Alert.alert('Restore failed', "Restore didn't work right now. Check your connection and try again. Your existing purchases are unaffected.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteAccount = () => {
    if (isDeletingAccount) return;
    Alert.alert(
      'Delete Account',
      // Kai-approved 2026-10-26 (deletion anonymize): wall posts are
      // NOT deleted — they stay for intercessors, anonymized (no
      // author link, testimonies shown as "A friend"). Say so here,
      // or the old "deletes your account and progress" line would
      // imply the wall posts vanish too.
      'This permanently deletes your TRIAD account and progress. Your prayer requests and testimonies stay on the Prayer Wall for others to pray over, but without your name. Shown as “A friend”. If you have an active subscription, cancel it first in your device’s subscription settings so billing does not continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              const didDelete = await deleteAccount();
              if (didDelete) {
                onClose();
              }
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenLegal = async (type: 'privacy' | 'terms') => {
    const url = type === 'privacy' ? 'https://tearsandoil.com/triadprivacy' : 'https://tearsandoil.com/triadterms';
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Couldn’t open that page', 'Check your connection and try again.');
    }
  };

  const renderEntranceStyle = (index: number) => {
    // Defensive clamp: an out-of-range index must never crash the sheet
    // (a stale hot-reload bundle once paired a 5-section tree with a
    // 4-entry anim array and threw on `.interpolate`).
    const anim = entranceAnims[index] ?? entranceAnims[entranceAnims.length - 1] ?? new Animated.Value(1);
    return {
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0],
          }),
        },
      ],
    };
  };

  const currentTheme: ThemePreference = state.themePreference ?? (state.monaticTheme ? 'monastic' : 'fireside');

  const handleThemeSelect = (theme: ThemePreference) => {
    if (theme === 'monastic' && !hasFeature('MONASTIC_THEME')) {
      setLockFeature({ name: 'Monastic Theme', req: getFeatureRequirement('MONASTIC_THEME') });
      setLockVisible(true);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemePreference(theme);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                backgroundColor: C.overlay,
                opacity: bgAnim,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              shadowColor: C.overlay,
              paddingBottom: Math.max(insets.bottom + 20, 32),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: C.accent, fontFamily: Fonts.titleMedium }]}>Prayer rhythm</Text>
              <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifRegular }]}>Settings</Text>
            </View>
            <AnimatedPressable
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
              scaleValue={0.96}
              hapticStyle={Haptics.ImpactFeedbackStyle.Light}
              testID="settings-close-button"
            >
              <X size={16} color={C.textMuted} />
            </AnimatedPressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={true}
            decelerationRate="fast"
          >
            <Animated.View style={renderEntranceStyle(0)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Reminders</Text>
                <View style={styles.cardStack}>
                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <AnimatedPressable
                      style={styles.reminderRow}
                      onPress={openTimePicker}
                      scaleValue={0.97}
                      testID="daily-reminder-row"
                    >
                      <View style={styles.toggleLeft}>
                        <View style={[styles.toggleIcon, { backgroundColor: C.accentBg, borderColor: C.borderLight }]}>
                          <Bell size={16} color={C.accentDark} />
                        </View>
                        <View style={styles.toggleCopy}>
                          <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Daily Reminder</Text>
                          <Text style={[styles.toggleSub, { color: C.textSecondary, fontFamily: Fonts.titleLight }]}>A gentle nudge to keep your time with God protected.</Text>
                        </View>
                      </View>
                      <View style={[styles.timeDisplay, { backgroundColor: C.accentBg, borderColor: C.borderLight }]}>
                        <Text style={[styles.timeDisplayText, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>{currentReminder}</Text>
                        <ChevronDown size={14} color={C.accentDark} />
                      </View>
                    </AnimatedPressable>
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                    <SettingToggleRow
                      icon={<Clock size={16} color={C.text} />}
                      iconBackgroundColor={C.overlayLight}
                      iconBorderColor={C.borderLight}
                      title="Adaptive Reminders"
                      subtitle={state.adaptiveReminderEnabled === false ? 'Stays at your chosen time' : 'Learns when you actually pray'}
                      value={state.adaptiveReminderEnabled !== false}
                      onValueChange={() => setAdaptiveReminderEnabled(state.adaptiveReminderEnabled === false)}
                      trackTrueColor={C.accent}
                      trackFalseColor={C.border}
                      textColor={C.text}
                      subColor={C.textSecondary}
                      testID="adaptive-reminder-toggle"
                    />
                  </View>
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(1)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Playback & Display</Text>
                <View style={styles.cardStack}>
                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <SettingToggleRow
                      icon={<Volume2 size={16} color={C.text} />}
                      iconBackgroundColor={C.overlayLight}
                      iconBorderColor={C.borderLight}
                      title="Voiceover Guidance"
                      subtitle={state.voiceoverEnabled ? 'Reads prompts out loud' : 'No spoken guidance'}
                      value={state.voiceoverEnabled}
                      onValueChange={handleVoiceover}
                      trackTrueColor={C.accent}
                      trackFalseColor={C.border}
                      textColor={C.text}
                      subColor={C.textSecondary}
                      testID="voiceover-toggle"
                    />
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                    <View style={styles.speedRow}>
                      <View style={styles.toggleLeft}>
                        <View style={[styles.toggleIcon, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}>
                          {playbackLocked ? <Lock size={16} color={C.textMuted} /> : <Gauge size={16} color={C.text} />}
                        </View>
                        <View style={styles.toggleCopy}>
                          <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Playback Speed</Text>
                          <Text style={[styles.toggleSub, { color: C.textSecondary, fontFamily: Fonts.titleLight }]}>
                            {playbackLocked ? 'Unlock with Partner' : `Currently ${currentRate}x`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.speedChips}>
                        {playbackOptions.map((rate) => {
                          const isActive = Math.abs(currentRate - rate) < 0.01;
                          return (
                            <AnimatedPressable
                              key={rate}
                              onPress={() => handlePlaybackRate(rate)}
                              style={[
                                styles.speedChip,
                                {
                                  backgroundColor: isActive ? C.accent : C.overlayLight,
                                  borderColor: isActive ? C.accent : C.borderLight,
                                },
                              ]}
                              scaleValue={0.94}
                              hapticStyle={Haptics.ImpactFeedbackStyle.Light}
                              testID={`playback-rate-${rate}`}
                            >
                              <Text
                                style={[
                                  styles.speedChipText,
                                  {
                                    color: isActive ? C.white : C.text,
                                    fontFamily: Fonts.titleSemiBold,
                                  },
                                ]}
                              >
                                {`${rate}x`}
                              </Text>
                            </AnimatedPressable>
                          );
                        })}
                        {playbackLocked ? (
                          <AnimatedPressable
                            onPress={() => handlePlaybackRate(1)}
                            style={[styles.speedChip, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                            scaleValue={0.94}
                            testID="playback-rate-locked"
                          >
                            <Lock size={12} color={C.textMuted} />
                          </AnimatedPressable>
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                    <ThemeSelectorRow
                      icon={<Moon size={16} color={C.accent} />}
                      iconBackgroundColor={C.accentBg}
                      iconBorderColor={C.borderLight}
                      title="Theme"
                      // Kai-approved 2026-10-26 (bundle 19, Settings
                      // microcopy): "liturgical" is church jargon —
                      // plain words for the same theme.
                      subtitle={currentTheme === 'monastic' ? 'Warm parchment palette' : currentTheme === 'seasonal' ? 'Seasonal colors for the church year' : 'The familiar dark palette'}
                      textColor={C.text}
                      subColor={C.textSecondary}
                      activeTheme={currentTheme}
                      onSelectTheme={handleThemeSelect}
                      primaryColor={C.accent}
                      primaryBackgroundColor={C.accentBg}
                      primaryBorderColor={C.borderLight}
                      mutedBackgroundColor={C.overlayLight}
                      mutedBorderColor={C.borderLight}
                      locked={state.tierLevel < UserTier.PARTNER}
                    />
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                    <SettingToggleRow
                      icon={<AlignLeft size={16} color={C.sageDark} />}
                      iconBackgroundColor={C.sageBg}
                      iconBorderColor={C.borderLight}
                      title="Larger Text"
                      subtitle={state.fontSize === 'large' ? 'Larger text in the app' : 'Standard text size'}
                      value={state.fontSize === 'large'}
                      onValueChange={handleFontSize}
                      trackTrueColor={C.sage}
                      trackFalseColor={C.border}
                      textColor={C.text}
                      subColor={C.textSecondary}
                      testID="font-size-toggle"
                    />
                    <Text style={[styles.a11yNote, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
                      For larger text everywhere, use iPhone Settings → Accessibility → Display &amp; Text Size → Larger Text.
                    </Text>
                  </View>
                  {/* Steal C — Daily Truth widget, surfaced here per the
                      steal pack ("Settings → Home screen"). iOS only:
                      the widget is WidgetKit (expo-widgets); there is
                      no Android widget, so other platforms get no row.
                      Deliberately NOT a button (pro-pass B1): there is
                      no widget deep link, so tapping it to a session
                      would lie about what it does — the row is the
                      instruction. */}
                  {Platform.OS === 'ios' ? (
                    <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]} testID="settings-daily-truth-widget">
                      <View style={styles.widgetRow}>
                        <View style={[styles.toggleIcon, { backgroundColor: C.accentBg, borderColor: C.borderLight }]}>
                          <Sparkles size={16} color={C.accent} />
                        </View>
                        <View style={styles.toggleCopy}>
                          <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Add the Daily Truth widget</Text>
                          <Text style={[styles.toggleSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
                            Put today&apos;s prayer on your Lock or Home Screen. Long-press your Home Screen → + → TRIAD.
                          </Text>
                          {/* Finding 07: in this Expo Go preview the
                              widget cannot appear in the picker at all —
                              say so, instead of leaving the row silent
                              about why TRIAD is missing. */}
                          {isExpoGo ? (
                            <Text style={[styles.toggleSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>
                              Available in the App Store build.
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(2)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Soundscape</Text>
                <Text style={[styles.sectionSub, { color: C.textSecondary, fontFamily: Fonts.italic }]}>Choose what carries the room during prayer. Tap play for a 12-second preview, even when locked.</Text>
                <View style={styles.cardStack}>
                  {SOUNDSCAPE_OPTIONS.map(({ id, label, description }, index) => {
                    const isSelected = state.soundscape === id;
                    const unlockedCount = Number(hasFeature('AMBIENT_SOUNDSCAPES_COUNT'));
                    const soundscapeReqs: Partial<Record<Soundscape, UserTier>> = {
                      firstLight: UserTier.PARTNER,
                      reunion: UserTier.PARTNER,
                      monastic: UserTier.PARTNER,
                    };
                    const reqTier = soundscapeReqs[id];
                    const isLocked = index >= unlockedCount;
                    const Icon = isLocked && !isSelected ? Lock : SOUNDSCAPE_ICONS[id];
                    const tierBadge = reqTier !== undefined ? UserTier[reqTier] : null;

                    return (
                      <AnimatedPressable
                        key={id}
                        style={[
                          styles.soundscapeCard,
                          {
                            backgroundColor: isSelected ? C.accentBg : C.surfaceAlt,
                            borderColor: isSelected ? C.accent : C.border,
                            opacity: isLocked && !isSelected ? 0.4 : 1,
                          },
                        ]}
                        scaleValue={0.97}
                        onPress={() => {
                          if (isLocked) {
                            stopPreview();
                            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            setLockFeature({
                              name: label,
                              req: getFeatureRequirement('AMBIENT_SOUNDSCAPES_COUNT'),
                            });
                            setLockVisible(true);
                            return;
                          }

                          handleSoundscape(id);
                        }}
                        testID={`soundscape-${id}`}
                      >
                        <View
                          style={[
                            styles.soundscapeIconWrap,
                            {
                              backgroundColor: isSelected ? C.accent : C.overlayLight,
                              borderColor: isSelected ? C.accentLight : C.borderLight,
                            },
                          ]}
                        >
                          <Icon size={16} color={isSelected ? C.white : isLocked ? C.iconMuted : C.textMuted} />
                        </View>

                        <View style={styles.soundscapeTextWrap}>
                          <View style={styles.rowBetween}>
                            <Text style={[styles.soundscapeLabel, { color: isLocked && !isSelected ? C.textSecondary : C.text, fontFamily: Fonts.titleMedium }]}>
                              {label}
                            </Text>
                            {isSelected ? (
                              <View style={[styles.soundscapeBadge, { backgroundColor: C.accent }]}> 
                                <Text style={[styles.soundscapeBadgeText, { color: C.white, fontFamily: Fonts.titleMedium }]}>Active</Text>
                              </View>
                            ) : isLocked && tierBadge ? (
                              <View style={[styles.soundscapeBadge, { backgroundColor: C.overlayLight, borderColor: C.borderLight, borderWidth: 1 }]}> 
                                <Text style={[styles.soundscapeBadgeText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>{`${tierBadge.slice(0, 1)}${tierBadge.slice(1).toLowerCase()}`}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.soundscapeDesc, { color: isLocked && !isSelected ? C.iconMuted : C.textSecondary, fontFamily: Fonts.titleLight }]}> 
                            {description}
                          </Text>
                        </View>

                        {/* Finding 08: 12-second preview — plays the
                            sample without unlocking or selecting. The
                            inner Pressable is the responder, so tapping
                            play never fires the card's lock/select. */}
                        <Pressable
                          onPress={() => void handlePreviewSoundscape(id, isLocked)}
                          style={[
                            styles.soundscapePreviewBtn,
                            {
                              backgroundColor: previewingId === id ? C.accent : C.overlayLight,
                              borderColor: previewingId === id ? C.accent : C.borderLight,
                            },
                          ]}
                          hitSlop={8}
                          testID={`soundscape-preview-${id}`}
                          accessibilityLabel={previewingId === id ? `Stop previewing ${label}` : `Preview ${label} for 12 seconds`}
                          accessibilityRole="button"
                        >
                          {previewingId === id ? (
                            <Square size={14} color={C.white} />
                          ) : (
                            <Play size={14} color={isLocked && !isSelected ? C.iconMuted : C.text} />
                          )}
                        </Pressable>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
            <Animated.View style={renderEntranceStyle(3)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Prayer Wall</Text>
                <View style={styles.cardStack}>
                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <SettingToggleRow
                      icon={<Bell size={16} color={C.accentDark} />}
                      iconBackgroundColor={C.accentBg}
                      iconBorderColor={C.borderLight}
                      title="Prayed-for notifications"
                      subtitle="A quiet bell when someone prays for your request"
                      value={wallPrayerNotifications ?? true}
                      onValueChange={toggleWallPrayerNotifications}
                      trackTrueColor={C.accent}
                      trackFalseColor={C.border}
                      textColor={C.text}
                      subColor={C.textSecondary}
                      testID="wall-prayer-notifications-toggle"
                    />
                  </View>
                  {isModerator && (
                    <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                      <AnimatedPressable
                        style={styles.accountBtn}
                        onPress={() => {
                          onClose();
                          setTimeout(() => router.push('/moderation'), 320);
                        }}
                        scaleValue={0.97}
                        testID="settings-open-moderation"
                      >
                        <Shield size={16} color={C.textSecondary} />
                        <Text style={[styles.accountBtnText, { color: C.text, fontFamily: Fonts.titleMedium }]}>Review hidden posts</Text>
                      </AnimatedPressable>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>
            <Animated.View style={renderEntranceStyle(4)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Support & Account</Text>
                <View style={styles.cardStack}>
                  <AnimatedPressable
                    style={[styles.supportRow, { backgroundColor: C.accentBg, borderColor: C.accentLight }]}
                    onPress={() => {
                      onClose();
                      setTimeout(() => router.push('/paywall'), 320);
                    }}
                    scaleValue={0.96}
                    testID="open-paywall"
                  >
                    <View style={[styles.supportIcon, { backgroundColor: C.accent }]}> 
                      <Heart size={16} color={C.white} />
                    </View>
                    <View style={styles.supportText}>
                      <Text style={[styles.supportTitle, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>Support the App</Text>
                      <Text style={[styles.supportSub, { color: C.accentDark, fontFamily: Fonts.italic }]}>Help fund building, teaching, and missions.</Text>
                    </View>
                  </AnimatedPressable>

                  {/* Steal B — "Already a Partner?" split, same card and
                      copy as the paywall footer: sign in vs store
                      restore, instead of one vague Restore link.
                      Pro-pass A1: the Sign-in row hides for signed-in
                      users (they already have an account — Restore
                      stays, for a store subscription on another
                      store account). A3: bordered buttons + centred
                      heading/sub, matching the paywall card. */}
                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <Text style={[styles.partnerHeading, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Already a Partner?</Text>
                    <Text style={[styles.partnerSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>If you subscribed before, get your access back. No need to pay twice.</Text>
                    {hasAccount !== true ? (
                      <>
                    <AnimatedPressable
                      style={[styles.partnerBtn, { borderColor: C.borderLight, backgroundColor: C.overlayLight }]}
                      onPress={() => {
                        onClose();
                        setTimeout(() => router.push('/auth'), 320);
                      }}
                      scaleValue={0.97}
                      testID="settings-already-partner-sign-in"
                    >
                      <LogIn size={16} color={C.textSecondary} />
                      <View style={styles.partnerBtnCopy}>
                        <Text style={[styles.partnerBtnTitle, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Sign in</Text>
                        <Text style={[styles.partnerBtnSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>I have a TRIAD account: Apple, Google, or email</Text>
                      </View>
                    </AnimatedPressable>
                    {/* Spacer, not a hairline: the buttons are bordered
                        boxes like the paywall's, so a divider line
                        between them would double the border. */}
                    <View style={{ height: 10 }} />
                      </>
                    ) : null}
                    <AnimatedPressable
                      style={[styles.partnerBtn, { borderColor: C.borderLight, backgroundColor: C.overlayLight }]}
                      onPress={() => void handleRestorePurchases()}
                      disabled={isRestoring}
                      scaleValue={0.97}
                      testID="settings-restore-purchases"
                    >
                      {isRestoring ? (
                        <ActivityIndicator color={C.textSecondary} size="small" />
                      ) : (
                        <>
                          <RefreshCw size={16} color={C.textSecondary} />
                          <View style={styles.partnerBtnCopy}>
                            <Text style={[styles.partnerBtnTitle, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Restore purchases</Text>
                            <Text style={[styles.partnerBtnSub, { color: C.textSecondary, fontFamily: Fonts.titleRegular }]}>I subscribed in the App Store or Google Play</Text>
                          </View>
                        </>
                      )}
                    </AnimatedPressable>
                    {/* Pro-pass A2: the guest "Save your progress" row
                        is gone (the partner card's Sign in already
                        covers it) — its warning lives on here, so a
                        guest still learns their journey is device-only. */}
                    {hasAccount === false ? (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                        <Text style={[styles.mutedSectionSub, { color: C.textSecondary, fontFamily: Fonts.italic, paddingTop: 12 }]}>
                          You haven&apos;t signed in, so your journey lives only on this device. Sign in to keep it safe.
                        </Text>
                      </>
                    ) : null}
                  </View>

                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <AnimatedPressable
                      style={styles.accountBtn}
                      onPress={() => {
                        onClose();
                        setTimeout(() => router.push('/profile'), 320);
                      }}
                      scaleValue={0.97}
                      testID="settings-open-profile"
                    >
                      <User size={16} color={C.textSecondary} />
                      <Text style={[styles.accountBtnText, { color: C.text, fontFamily: Fonts.titleMedium }]}>Your Profile</Text>
                    </AnimatedPressable>
                  </View>

                  <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                    <AnimatedPressable
                      style={styles.accountBtn}
                      onPress={() => {
                        onClose();
                        setTimeout(() => router.push('/report-problem'), 320);
                      }}
                      scaleValue={0.97}
                      testID="settings-open-report-problem"
                    >
                      <Bug size={16} color={C.textSecondary} />
                      <Text style={[styles.accountBtnText, { color: C.text, fontFamily: Fonts.titleMedium }]}>Report a problem</Text>
                    </AnimatedPressable>
                  </View>

                  {/* Round-5 lane 2, B-1 + M-6: signed-in users see
                      Sign Out / Delete Account. Guests see nothing
                      here — the partner card above already carries
                      the Sign-in row (pro-pass A2), so there is one
                      sign-in entry, not two. While the session check
                      is pending, no account row renders. */}
                  {hasAccount === true ? (
                    <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                      <AnimatedPressable
                        style={styles.accountBtn}
                        onPress={handleSignOut}
                        scaleValue={0.97}
                        testID="settings-sign-out"
                      >
                        <LogOut size={16} color={C.textSecondary} />
                        <Text style={[styles.accountBtnText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Sign Out</Text>
                      </AnimatedPressable>
                      <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                      <AnimatedPressable
                        style={styles.accountBtn}
                        onPress={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        scaleValue={0.97}
                        testID="settings-delete-account"
                      >
                        <Trash2 size={16} color={C.heartRed} />
                        <Text style={[styles.accountBtnText, { color: C.heartRed, fontFamily: Fonts.titleMedium }]}>{isDeletingAccount ? 'Deleting…' : 'Delete Account'}</Text>
                      </AnimatedPressable>
                    </View>
                  ) : null}

                  {mutedAuthors !== null && mutedAuthors.length > 0 && (
                    <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                      <Text style={[styles.mutedSectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Muted authors</Text>
                      <Text style={[styles.mutedSectionSub, { color: C.textSecondary, fontFamily: Fonts.italic }]}>Their prayers and testimonies are hidden from your wall.</Text>
                      {mutedAuthors.map((author, index) => (
                        <React.Fragment key={author.id}>
                          {index > 0 && <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />}
                          <View style={styles.mutedRow}>
                            <Text style={[styles.mutedName, { color: C.text, fontFamily: Fonts.titleMedium }]} numberOfLines={1}>{author.label}</Text>
                            <AnimatedPressable
                              style={styles.mutedUnmuteBtn}
                              onPress={() => void handleUnmuteAuthor(author.id)}
                              disabled={unmutingId === author.id}
                              scaleValue={0.97}
                              testID={`settings-unmute-${author.id}`}
                            >
                              <Text style={[styles.mutedUnmuteText, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>
                                {unmutingId === author.id ? 'UNMUTING…' : 'UNMUTE'}
                              </Text>
                            </AnimatedPressable>
                          </View>
                        </React.Fragment>
                      ))}
                    </View>
                  )}

                  <View style={styles.legalLinks}>
                    {/* Flex wrappers — same AnimatedPressable inner-style
                        reason as the theme buttons above. */}
                    <View style={styles.legalLinkWrap}>
                      <AnimatedPressable
                        onPress={() => handleOpenLegal('privacy')}
                        style={[styles.legalLink, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                        scaleValue={0.97}
                        testID="settings-privacy-policy"
                      >
                        <Text style={[styles.legalLinkText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
                        <ExternalLink size={12} color={C.textMuted} />
                      </AnimatedPressable>
                    </View>
                    <View style={styles.legalLinkWrap}>
                      <AnimatedPressable
                        onPress={() => handleOpenLegal('terms')}
                        style={[styles.legalLink, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                        scaleValue={0.97}
                        testID="settings-terms-of-use"
                      >
                        <Text style={[styles.legalLinkText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
                        <ExternalLink size={12} color={C.textMuted} />
                      </AnimatedPressable>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <Modal
            visible={timePickerVisible}
            transparent
            animationType="none"
            onRequestClose={() => setTimePickerVisible(false)}
          >
            <View style={[styles.pickerOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <TouchableWithoutFeedback onPress={() => setTimePickerVisible(false)}>
                <Animated.View
                  style={[
                    styles.pickerBackdrop,
                    {
                      backgroundColor: C.overlay,
                      opacity: pickerBgAnim,
                    },
                  ]}
                />
              </TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.pickerContent,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    shadowColor: C.overlay,
                    transform: [{ translateY: pickerSlideAnim }],
                  },
                ]}
              >
                <Text style={[styles.pickerTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>Reminder Time</Text>

                <View style={styles.pickerWheels}>
                  <View style={styles.pickerColumn}>
                    <AnimatedPressable
                      onPress={() => setTempHour((value) => String(Math.max(1, (Number(value) % 12) + 1)))}
                      style={[styles.wheelButton, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="reminder-hour-up"
                    >
                      <ChevronDown size={18} color={C.accent} style={styles.chevronUp} />
                    </AnimatedPressable>
                    <Text style={[styles.pickerVal, { color: C.text, fontFamily: Fonts.titleBold }]}>{tempHour}</Text>
                    <AnimatedPressable
                      onPress={() => setTempHour((value) => String(Number(value) === 1 ? 12 : Number(value) - 1))}
                      style={[styles.wheelButton, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="reminder-hour-down"
                    >
                      <ChevronDown size={18} color={C.accent} />
                    </AnimatedPressable>
                  </View>

                  <Text style={[styles.pickerColon, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>:</Text>

                  <View style={styles.pickerColumn}>
                    <AnimatedPressable
                      onPress={() => setTempMin((value) => (Number(value) === 55 ? '00' : String(Number(value) + 5).padStart(2, '0')))}
                      style={[styles.wheelButton, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="reminder-minute-up"
                    >
                      <ChevronDown size={18} color={C.accent} style={styles.chevronUp} />
                    </AnimatedPressable>
                    <Text style={[styles.pickerVal, { color: C.text, fontFamily: Fonts.titleBold }]}>{tempMin}</Text>
                    <AnimatedPressable
                      onPress={() => setTempMin((value) => (Number(value) === 0 ? '55' : String(Number(value) - 5).padStart(2, '0')))}
                      style={[styles.wheelButton, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="reminder-minute-down"
                    >
                      <ChevronDown size={18} color={C.accent} />
                    </AnimatedPressable>
                  </View>

                  <AnimatedPressable
                    style={[styles.ampmBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                    onPress={() => setTempAmPm((value) => (value === 'AM' ? 'PM' : 'AM'))}
                    scaleValue={0.97}
                    testID="reminder-ampm-toggle"
                  >
                    <Text style={[styles.ampmText, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>{tempAmPm}</Text>
                  </AnimatedPressable>
                </View>

                <AnimatedPressable
                  style={[styles.saveBtn, { backgroundColor: C.accent }]}
                  onPress={saveTime}
                  scaleValue={0.96}
                  testID="reminder-save-button"
                >
                  <Text style={[styles.saveBtnText, { color: C.white, fontFamily: Fonts.titleBold }]}>Set Reminder</Text>
                </AnimatedPressable>
              </Animated.View>
            </View>
          </Modal>

          <FeatureLockSheet
            visible={lockVisible}
            onClose={() => setLockVisible(false)}
            featureName={lockFeature.name}
            requirement={lockFeature.req}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

interface SettingToggleRowProps {
  icon: React.ReactNode;
  iconBackgroundColor: string;
  iconBorderColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: () => void;
  trackTrueColor: string;
  trackFalseColor: string;
  textColor: string;
  subColor: string;
  testID: string;
}

function SettingToggleRow({
  icon,
  iconBackgroundColor,
  iconBorderColor,
  title,
  subtitle,
  value,
  onValueChange,
  trackTrueColor,
  trackFalseColor,
  textColor,
  subColor,
  testID,
}: SettingToggleRowProps) {
  const T = useTypography();
  const toggleRowStyles = useMemo(() => createToggleRowStyles(T), [T]);
  return (
    <View style={toggleRowStyles.row}>
      <View style={toggleRowStyles.left}>
        <View style={[toggleRowStyles.iconWrap, { backgroundColor: iconBackgroundColor, borderColor: iconBorderColor }]}>{icon}</View>
        <View style={toggleRowStyles.copy}>
          <Text style={[toggleRowStyles.title, { color: textColor, fontFamily: Fonts.titleSemiBold }]}>{title}</Text>
          <Text style={[toggleRowStyles.subtitle, { color: subColor, fontFamily: Fonts.titleLight }]}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: trackFalseColor, true: trackTrueColor }}
        thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
        ios_backgroundColor={trackFalseColor}
        testID={testID}
        // Audit round 3, S5: the Switch sits next to, but unassociated
        // with, its row title — VoiceOver announced an unlabeled switch.
        // This one line covers every SettingToggleRow in the sheet.
        accessibilityLabel={title}
      />
    </View>
  );
}

interface ThemeSelectorRowProps {
  icon: React.ReactNode;
  iconBackgroundColor: string;
  iconBorderColor: string;
  title: string;
  subtitle: string;
  textColor: string;
  subColor: string;
  activeTheme: ThemePreference;
  onSelectTheme: (theme: ThemePreference) => void;
  primaryColor: string;
  primaryBackgroundColor: string;
  primaryBorderColor: string;
  mutedBackgroundColor: string;
  mutedBorderColor: string;
  locked: boolean;
}

function ThemeSelectorRow({
  icon,
  iconBackgroundColor,
  iconBorderColor,
  title,
  subtitle,
  textColor,
  subColor,
  activeTheme,
  onSelectTheme,
  primaryColor,
  primaryBackgroundColor,
  primaryBorderColor,
  mutedBackgroundColor,
  mutedBorderColor,
  locked,
}: ThemeSelectorRowProps) {
  const T = useTypography();
  const toggleRowStyles = useMemo(() => createToggleRowStyles(T), [T]);
  const themeSelectorStyles = useMemo(() => createThemeSelectorStyles(T), [T]);
  return (
    <View style={themeSelectorStyles.container}>
      <View style={toggleRowStyles.left}>
        <View style={[toggleRowStyles.iconWrap, { backgroundColor: iconBackgroundColor, borderColor: iconBorderColor }]}>{icon}</View>
        <View style={toggleRowStyles.copy}>
          <Text style={[toggleRowStyles.title, { color: textColor, fontFamily: Fonts.titleSemiBold }]}>{title}</Text>
          <Text style={[toggleRowStyles.subtitle, { color: subColor, fontFamily: Fonts.titleLight }]}>{subtitle}</Text>
        </View>
      </View>
      <View style={themeSelectorStyles.buttonRow}>
        {/* Flex wrappers: each button gets a flex:1 wrapper, and the
            default stretch alignment fills the row in thirds (the old
            comment's shrink-wrap claim did not survive Yoga's stretch
            defaults). The wrap defect was label size, not width: the
            button token (15pt) plus the single-line guard below fixes
            "Seasonal"/"Monastic" wrapping without touching the shared
            AnimatedPressable. */}
        <View style={themeSelectorStyles.buttonWrap}>
        <AnimatedPressable
          onPress={() => onSelectTheme('fireside')}
          style={[
            themeSelectorStyles.button,
            {
              backgroundColor: activeTheme === 'fireside' ? primaryBackgroundColor : mutedBackgroundColor,
              borderColor: activeTheme === 'fireside' ? primaryBorderColor : mutedBorderColor,
            },
          ]}
          scaleValue={0.97}
          testID="fireside-theme-button"
        >
          <Text numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[themeSelectorStyles.buttonText, { color: activeTheme === 'fireside' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Fireside</Text>
        </AnimatedPressable>
        </View>
        <View style={themeSelectorStyles.buttonWrap}>
        <AnimatedPressable
          onPress={() => onSelectTheme('seasonal')}
          style={[
            themeSelectorStyles.button,
            {
              backgroundColor: activeTheme === 'seasonal' ? primaryBackgroundColor : mutedBackgroundColor,
              borderColor: activeTheme === 'seasonal' ? primaryBorderColor : mutedBorderColor,
            },
          ]}
          scaleValue={0.97}
          testID="seasonal-theme-button"
        >
          <Text numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[themeSelectorStyles.buttonText, { color: activeTheme === 'seasonal' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Seasonal</Text>
        </AnimatedPressable>
        </View>
        <View style={themeSelectorStyles.buttonWrap}>
        <AnimatedPressable
          onPress={() => onSelectTheme('monastic')}
          style={[
            themeSelectorStyles.button,
            {
              backgroundColor: activeTheme === 'monastic' ? primaryBackgroundColor : mutedBackgroundColor,
              borderColor: activeTheme === 'monastic' ? primaryBorderColor : mutedBorderColor,
            },
          ]}
          scaleValue={0.97}
          testID="monastic-theme-button"
        >
          <View style={themeSelectorStyles.buttonContent}>
            <Text numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={[themeSelectorStyles.buttonText, { color: activeTheme === 'monastic' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Monastic</Text>
            {locked ? <Lock size={12} color={activeTheme === 'monastic' ? primaryColor : subColor} /> : null}
          </View>
        </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

const createToggleRowStyles = (T: any) => StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 16,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    // Finding 06: the 40pt icon + 12pt gaps squeezed the middle column
    // until "Adaptive Reminders" / "Voiceover Guidance" (22pt titles)
    // wrapped. Smaller icon and tighter gaps give the title column the
    // width back. Type sizes themselves are Phase 2 — untouched here.
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  // Audit 2026-11-10 (finding 06, verified on device): the icon shrink
  // alone did not fix the wrap — at 22pt the titles still broke to two
  // lines ("Adaptive / Reminders", "Voiceover / Guidance") in the new
  // build. The role is wrong, not the column: a card title in a
  // three-column row is body (17pt), and its subtext is caption (15pt)
  // — the same one-size-per-role rule as Home's card titles (finding
  // 05). Both still scale at Larger Text (title stays above subtitle).
  title: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
  },
  subtitle: {
    fontSize: T.size.caption,
    lineHeight: T.leading.caption,
  },
});

const createThemeSelectorStyles = (T: any) => StyleSheet.create({
  container: {
    gap: 14,
    paddingVertical: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonWrap: {
    flex: 1,
  },
  button: {
    minHeight: 44,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 0.3,
  },
});

function createStyles(T: any) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...absoluteFillObject,
    },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 8,
      maxHeight: '88%',
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: 999,
      alignSelf: 'center',
      marginBottom: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    eyebrow: {
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    // Lane D (PL-H11): sheet title per lane mapping; old normal 32/36.
    title: {
      fontSize: T.size.title,
      lineHeight: T.leading.title,
      letterSpacing: -0.4,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingBottom: 8,
      gap: 24,
    },
    sectionBlock: {
      gap: 12,
    },
    sectionLabel: {
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    sectionSub: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      marginTop: -4,
    },
    cardStack: {
      gap: 12,
    },
    settingsCard: {
      borderRadius: 12,
      borderWidth: 1,
      // Finding 06: 4pt less horizontal padding per side widens every
      // card's middle column a little more (see toggleRowStyles).
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    soundscapeCard: {
      minHeight: 76,
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    soundscapeIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    soundscapeTextWrap: {
      flex: 1,
      gap: 4,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    soundscapeLabel: {
      flex: 1,
      fontSize: T.size.label,
      lineHeight: T.leading.label,
    },
    soundscapeDesc: {
      fontSize: T.size.bodySmall,
      lineHeight: T.leading.bodySmall,
    },
    soundscapeBadge: {
      minHeight: 28,
      borderRadius: 999,
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    soundscapeBadgeText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    // Finding 08: the 12-second preview control — a full 44pt target,
    // fixed width so it never squeezes the label column.
    soundscapePreviewBtn: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowDivider: {
      height: 1,
    },
    reminderRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 16,
    },
    toggleLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    toggleIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleCopy: {
      flex: 1,
      gap: 4,
    },
    toggleLabel: {
      fontSize: T.size.label,
      lineHeight: T.leading.label,
    },
    toggleSub: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    a11yNote: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      paddingLeft: 52,
      paddingRight: 4,
      paddingBottom: 14,
    },
    speedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 16,
      flexWrap: 'wrap',
    },
    speedChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'flex-end',
    },
    speedChip: {
      minWidth: 40,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    speedChipText: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
    },
    timeDisplay: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    timeDisplayText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    supportRow: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
    },
    supportIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    supportText: {
      flex: 1,
      gap: 4,
    },
    supportTitle: {
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
    },
    supportSub: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
    },
    accountBtn: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    mutedSectionLabel: {
      fontSize: T.size.label,
      lineHeight: T.leading.label,
      letterSpacing: 2,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    mutedSectionSub: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 8,
    },
    mutedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    mutedName: {
      flex: 1,
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      marginRight: 12,
    },
    mutedUnmuteBtn: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    mutedUnmuteText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 1.5,
    },
    // Lane D (PL-H11): fontSize per lane mapping; lineHeight follows the
    // lane-D mapping table (18 -> T.scale(16) = 18.4) to preserve the old
    // normal leading, rather than the lane text's T.scale(22), which
    // would inflate normal leading from 18 to 25.3.
    accountBtnText: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
    },
    // Steal B — "Already a Partner?" card (same copy as the paywall
    // footer): sign-in vs store restore, inside the Support & Account
    // section's card stack. Pro-pass A3: same treatment as the
    // paywall card — centred heading/sub, bordered buttons, bodySmall
    // subtexts — so the two placements are one card, not two.
    partnerHeading: {
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
      textAlign: 'center' as const,
      paddingTop: 12,
    },
    partnerSub: {
      fontSize: T.size.bodySmall,
      lineHeight: T.leading.bodySmall,
      textAlign: 'center' as const,
      paddingTop: 4,
      paddingBottom: 8,
    },
    partnerBtn: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      // Border + background are set inline at the call sites (the
      // style factory only receives T, not the theme colours).
    },
    partnerBtnCopy: {
      flex: 1,
      gap: 2,
    },
    partnerBtnTitle: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
    },
    partnerBtnSub: {
      fontSize: T.size.bodySmall,
      lineHeight: T.leading.bodySmall,
    },
    // Steal C — Daily Truth widget info row (Playback & Display):
    // a plain row, not a button — there is no widget deep link.
    widgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    legalLinks: {
      flexDirection: 'row',
      gap: 12,
    },
    legalLinkWrap: {
      flex: 1,
    },
    legalLink: {
      minHeight: 44,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    legalLinkText: {
      fontSize: T.size.footnote,
      lineHeight: T.leading.footnote,
    },
    pickerOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 20,
    },
    pickerBackdrop: {
      ...absoluteFillObject,
    },
    pickerContent: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
      alignItems: 'center',
      // Phase 2b sweep 3: modal-family shadow — same 0.08/14/4 as the
      // modalContent sheets (was 0.08/12, elevation 6).
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 4,
    },
    pickerTitle: {
      fontSize: T.size.sectionTitle,
      lineHeight: T.leading.sectionTitle,
      marginBottom: 20,
    },
    pickerWheels: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 24,
    },
    pickerColumn: {
      alignItems: 'center',
      gap: 8,
    },
    wheelButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevronUp: {
      transform: [{ rotate: '180deg' }],
    },
    pickerVal: {
      minWidth: 52,
      fontSize: T.size.title,
      lineHeight: T.leading.title,
      textAlign: 'center',
    },
    pickerColon: {
      fontSize: T.scale(28),
      lineHeight: T.scale(31),
      marginTop: -4,
    },
    ampmBtn: {
      minHeight: 52,
      minWidth: 72,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    ampmText: {
      fontSize: T.size.body,
      lineHeight: T.leading.body,
      letterSpacing: 1,
    },
    saveBtn: {
      width: '100%',
      minHeight: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    saveBtnText: {
      fontSize: T.size.button,
      lineHeight: T.leading.button,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
  });
}
