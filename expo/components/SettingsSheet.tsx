import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
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
  Trash2,
  ExternalLink,
  Volume2,
  Mic2,
  Gauge,
  Clock,
  User,
  Users,
  Shield,
  Bug,
} from 'lucide-react-native';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from './FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { FEATURES } from '@/constants/features';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { Soundscape, ThemePreference, UserTier } from '@/types';
import { absoluteFillObject } from '@/lib/absoluteFillObject';
import { DatabaseService } from '@/lib/database';
import { hasAnonymousSession } from '@/lib/supabase';

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
    toggleVoiceover,
    hasFeature,
    setThemePreference,
    setPlaybackRate,
  } = useApp();

  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [lockFeature, setLockFeature] = useState<{ name: string; req: string }>({ name: '', req: '' });
  const [timePickerVisible, setTimePickerVisible] = useState<boolean>(false);
  const [tempHour, setTempHour] = useState<string>('8');
  const [tempMin, setTempMin] = useState<string>('00');
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  // Audit round 3, S9: double-tap sign-out guard (same pattern as delete).
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSoundscape(id);
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

  const handleDeleteAccount = () => {
    if (isDeletingAccount) return;
    Alert.alert(
      'Delete Account',
      // Kai-approved 2026-10-26 (deletion anonymize): wall posts are
      // NOT deleted — they stay for intercessors, anonymized (no
      // author link, testimonies shown as "A friend"). Say so here,
      // or the old "deletes your account and progress" line would
      // imply the wall posts vanish too.
      'This permanently deletes your TRIAD account and progress. Your prayer requests and testimonies stay on the Prayer Wall for others to pray over, but without your name — shown as “A friend”. If you have an active subscription, cancel it first in your device’s subscription settings so billing does not continue.',
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
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(2)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary, fontFamily: Fonts.titleBold }]}>Soundscape</Text>
                <Text style={[styles.sectionSub, { color: C.textSecondary, fontFamily: Fonts.italic }]}>Choose what carries the room during prayer.</Text>
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
                    {FEATURES.circles && (
                      <>
                        <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                        <AnimatedPressable
                          style={styles.accountBtn}
                          onPress={() => {
                            onClose();
                            setTimeout(() => router.push('/circles'), 320);
                          }}
                          scaleValue={0.97}
                          testID="settings-open-circles"
                        >
                          <Users size={16} color={C.textSecondary} />
                          <Text style={[styles.accountBtnText, { color: C.text, fontFamily: Fonts.titleMedium }]}>Circles</Text>
                        </AnimatedPressable>
                      </>
                    )}
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

                  {/* Round-5 lane 2, B-1 + M-6: guests see "Save your
                      progress" instead of Sign Out / Delete Account. While
                      the session check is pending, no account row renders. */}
                  {hasAccount === false ? (
                    <View style={[styles.settingsCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}>
                      <AnimatedPressable
                        style={styles.accountBtn}
                        onPress={() => {
                          onClose();
                          setTimeout(() => router.push('/auth'), 320);
                        }}
                        scaleValue={0.97}
                        testID="settings-save-progress"
                      >
                        <LogOut size={16} color={C.textSecondary} />
                        <Text style={[styles.accountBtnText, { color: C.text, fontFamily: Fonts.titleMedium }]}>Save your progress</Text>
                      </AnimatedPressable>
                      <Text style={[styles.mutedSectionSub, { color: C.textSecondary, fontFamily: Fonts.italic, paddingHorizontal: 16, paddingBottom: 12 }]}>
                        You haven&apos;t signed in, so your journey lives only on this device. Sign in to keep it safe.
                      </Text>
                    </View>
                  ) : hasAccount === true ? (
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
        {/* Flex wrappers: AnimatedPressable puts its style on an inner
            Pressable, so flex:1 on the button never reaches this row and
            the three theme buttons shrink-wrapped to their labels. */}
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
          <Text style={[themeSelectorStyles.buttonText, { color: activeTheme === 'fireside' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Fireside</Text>
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
          <Text style={[themeSelectorStyles.buttonText, { color: activeTheme === 'seasonal' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Seasonal</Text>
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
            <Text style={[themeSelectorStyles.buttonText, { color: activeTheme === 'monastic' ? primaryColor : subColor, fontFamily: Fonts.titleMedium }]}>Monastic</Text>
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
    gap: 12,
    paddingVertical: 16,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  // Lane D (PL-H11): title scales and stays above its subtitle (19.0) at
  // Larger Text; old normal values were 17/20.
  title: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
  },
  subtitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
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
      paddingHorizontal: 16,
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
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 6,
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
