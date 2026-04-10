import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
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
} from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedPressable from '@/components/AnimatedPressable';
import FeatureLockSheet from './FeatureLockSheet';
import { Fonts } from '@/constants/fonts';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';
import { getFeatureRequirement } from '@/services/entitlements';
import { Soundscape, UserTier } from '@/types';

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(), []);
  const {
    state,
    setSoundscape,
    setFontSize,
    updateReminderTime,
    signOut,
    deleteAccount,
    toggleVoiceover,
    hasFeature,
    setMonaticTheme,
  } = useApp();

  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const [lockFeature, setLockFeature] = useState<{ name: string; req: string }>({ name: '', req: '' });
  const [timePickerVisible, setTimePickerVisible] = useState<boolean>(false);
  const [tempHour, setTempHour] = useState<string>('8');
  const [tempMin, setTempMin] = useState<string>('00');
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');

  const slideAnim = useRef(new Animated.Value(560)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;
  const pickerSlideAnim = useRef(new Animated.Value(80)).current;
  const pickerBgAnim = useRef(new Animated.Value(0)).current;
  const entranceAnims = useRef(
    Array.from({ length: ENTRANCE_ITEM_COUNT }, () => new Animated.Value(0))
  ).current;

  const currentReminder = state.user?.reminderTime ?? '8:00 AM';

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(560);
      bgAnim.setValue(0);
      entranceAnims.forEach((anim) => anim.setValue(0));

      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 1,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.stagger(
          40,
          entranceAnims.map((anim) =>
            Animated.parallel([
              Animated.timing(anim, {
                toValue: 1,
                duration: 260,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
              }),
            ])
          )
        ).start();
      });
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

  const saveTime = () => {
    const newTime = `${tempHour}:${tempMin} ${tempAmPm}`;
    updateReminderTime(newTime);
    setTimePickerVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void signOut();
          onClose();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your progress and local data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            void deleteAccount();
            onClose();
          },
        },
      ]
    );
  };

  const handleOpenLegal = (type: 'privacy' | 'terms') => {
    const url = type === 'privacy' ? 'https://iammadewhole.com/privacy' : 'https://iammadewhole.com/terms';
    void Linking.openURL(url);
  };

  const renderEntranceStyle = (index: number) => ({
    opacity: entranceAnims[index],
    transform: [
      {
        translateY: entranceAnims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  });

  const handleThemeSelect = (theme: 'seasonal' | 'monastic') => {
    if (theme === 'monastic' && !hasFeature('MONASTIC_THEME')) {
      setLockFeature({ name: 'Monastic Theme', req: getFeatureRequirement('MONASTIC_THEME') });
      setLockVisible(true);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMonaticTheme(theme === 'monastic');
  };

  const summaryPills = [
    state.monaticTheme ? 'Monastic Theme' : 'Seasonal Theme',
    state.voiceoverEnabled ? 'Voiceover Active' : 'Voiceover Off',
    `Reminder ${currentReminder}`,
  ];

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
              <View style={[styles.heroCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}> 
                <Text style={[styles.heroTitle, { color: C.text, fontFamily: Fonts.serifMedium }]}>Build a room you want to return to.</Text>
                <Text style={[styles.heroBody, { color: C.textSecondary, fontFamily: Fonts.italic }]}>Tune the atmosphere, text, and reminders so every session feels more intentional.</Text>
                <View style={styles.pillRow}>
                  {summaryPills.map((pill) => (
                    <View key={pill} style={[styles.summaryPill, { backgroundColor: C.accentBg, borderColor: C.borderLight }]}>
                      <Text style={[styles.summaryPillText, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>{pill}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(1)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Music</Text>
                <Text style={[styles.sectionSub, { color: C.textMuted, fontFamily: Fonts.italic }]}>Choose what carries the room during prayer.</Text>
                <View style={styles.cardStack}>
                  {SOUNDSCAPE_OPTIONS.map(({ id, label, description }, index) => {
                    const isSelected = state.soundscape === id;
                    const unlockedCount = Number(hasFeature('AMBIENT_SOUNDSCAPES_COUNT'));
                    const soundscapeReqs: Partial<Record<Soundscape, UserTier>> = {
                      firstLight: UserTier.SUPPORT,
                      reunion: UserTier.MISSIONS,
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
                              req: reqTier !== undefined ? `${tierBadge?.slice(0, 1)}${tierBadge?.slice(1).toLowerCase()} Level` : getFeatureRequirement('DARK_MODE'),
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
                            <Text style={[styles.soundscapeLabel, { color: isLocked && !isSelected ? C.textMuted : C.text, fontFamily: Fonts.titleMedium }]}>
                              {label}
                            </Text>
                            {isSelected ? (
                              <View style={[styles.soundscapeBadge, { backgroundColor: C.accent }]}> 
                                <Text style={[styles.soundscapeBadgeText, { color: C.white, fontFamily: Fonts.titleMedium }]}>Active</Text>
                              </View>
                            ) : isLocked && tierBadge ? (
                              <View style={[styles.soundscapeBadge, { backgroundColor: C.overlayLight, borderColor: C.borderLight, borderWidth: 1 }]}> 
                                <Text style={[styles.soundscapeBadgeText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>{`${tierBadge.slice(0, 1)}${tierBadge.slice(1).toLowerCase()}`}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.soundscapeDesc, { color: isLocked && !isSelected ? C.iconMuted : C.textSecondary, fontFamily: Fonts.titleLight }]}> 
                            {isLocked && tierBadge
                              ? `Unlock with ${tierBadge.slice(0, 1)}${tierBadge.slice(1).toLowerCase()}`
                              : description}
                          </Text>
                        </View>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(2)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Audio & Display</Text>
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
                      subColor={C.textMuted}
                      testID="voiceover-toggle"
                    />
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                    <ThemeSelectorRow
                      icon={<Moon size={16} color={C.accent} />}
                      iconBackgroundColor={C.accentBg}
                      iconBorderColor={C.borderLight}
                      title="Theme"
                      subtitle={state.monaticTheme ? 'Warm parchment palette' : 'Seasonal liturgical colors'}
                      textColor={C.text}
                      subColor={C.textMuted}
                      activeTheme={state.monaticTheme ? 'monastic' : 'seasonal'}
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
                      subtitle={state.fontSize === 'large' ? 'Larger prayer text' : 'Standard text size'}
                      value={state.fontSize === 'large'}
                      onValueChange={handleFontSize}
                      trackTrueColor={C.sage}
                      trackFalseColor={C.border}
                      textColor={C.text}
                      subColor={C.textMuted}
                      testID="font-size-toggle"
                    />
                    <View style={[styles.rowDivider, { backgroundColor: C.borderLight }]} />
                  </View>
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(3)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Notifications</Text>
                <View style={styles.cardStack}>
                  <AnimatedPressable
                    style={[styles.settingsCard, styles.reminderCard, { backgroundColor: C.surfaceAlt, borderColor: C.borderLight }]}
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
                        <Text style={[styles.toggleSub, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>A gentle nudge to keep your time with God protected.</Text>
                      </View>
                    </View>
                    <View style={[styles.timeDisplay, { backgroundColor: C.accentBg, borderColor: C.borderLight }]}>
                      <Text style={[styles.timeDisplayText, { color: C.accentDark, fontFamily: Fonts.titleMedium }]}>{currentReminder}</Text>
                      <ChevronDown size={14} color={C.accentDark} />
                    </View>
                  </AnimatedPressable>
                </View>
              </View>
            </Animated.View>

            <Animated.View style={renderEntranceStyle(4)}>
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Support & Account</Text>
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
                      <Text style={[styles.supportSub, { color: C.accentDark, fontFamily: Fonts.italic }]}>Help fund development, discipleship, and missions.</Text>
                    </View>
                  </AnimatedPressable>

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
                      scaleValue={0.97}
                      testID="settings-delete-account"
                    >
                      <Trash2 size={16} color={C.heartRed} />
                      <Text style={[styles.accountBtnText, { color: C.heartRed, fontFamily: Fonts.titleMedium }]}>Delete Account</Text>
                    </AnimatedPressable>
                  </View>

                  <View style={styles.legalLinks}>
                    <AnimatedPressable
                      onPress={() => handleOpenLegal('privacy')}
                      style={[styles.legalLink, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="settings-privacy-policy"
                    >
                      <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
                      <ExternalLink size={12} color={C.textMuted} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={() => handleOpenLegal('terms')}
                      style={[styles.legalLink, { backgroundColor: C.overlayLight, borderColor: C.borderLight }]}
                      scaleValue={0.97}
                      testID="settings-terms-of-use"
                    >
                      <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
                      <ExternalLink size={12} color={C.textMuted} />
                    </AnimatedPressable>
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
            <View style={styles.pickerOverlay}>
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

                  <Text style={[styles.pickerColon, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>:</Text>

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
  activeTheme: 'seasonal' | 'monastic';
  onSelectTheme: (theme: 'seasonal' | 'monastic') => void;
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
  );
}

const toggleRowStyles = StyleSheet.create({
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
  title: {
    fontSize: 16,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});

const themeSelectorStyles = StyleSheet.create({
  container: {
    gap: 14,
    paddingVertical: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
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
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
});

function createStyles() {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      shadowOffset: { width: 0, height: -12 },
      shadowOpacity: 0.18,
      shadowRadius: 32,
      elevation: 24,
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
      fontSize: 11,
      lineHeight: 16,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    title: {
      fontSize: 32,
      lineHeight: 36,
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
    heroCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      gap: 12,
    },
    heroTitle: {
      fontSize: 25,
      lineHeight: 28,
    },
    heroBody: {
      fontSize: 15,
      lineHeight: 22,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    summaryPill: {
      minHeight: 32,
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    summaryPillText: {
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    sectionBlock: {
      gap: 12,
    },
    sectionLabel: {
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sectionSub: {
      fontSize: 14,
      lineHeight: 20,
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
      fontSize: 16,
      lineHeight: 20,
    },
    soundscapeDesc: {
      fontSize: 13,
      lineHeight: 18,
    },
    soundscapeBadge: {
      minHeight: 28,
      borderRadius: 999,
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    soundscapeBadgeText: {
      fontSize: 10,
      lineHeight: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    rowDivider: {
      height: 1,
    },
    reminderCard: {
      minHeight: 76,
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
      fontSize: 16,
      lineHeight: 20,
    },
    toggleSub: {
      fontSize: 13,
      lineHeight: 18,
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
      fontSize: 14,
      lineHeight: 18,
    },
    supportRow: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 4,
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
      fontSize: 16,
      lineHeight: 20,
    },
    supportSub: {
      fontSize: 13,
      lineHeight: 18,
    },
    accountBtn: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    accountBtnText: {
      fontSize: 14,
      lineHeight: 18,
    },
    legalLinks: {
      flexDirection: 'row',
      gap: 12,
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
      fontSize: 13,
      lineHeight: 18,
    },
    pickerOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 20,
    },
    pickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    pickerContent: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
      alignItems: 'center',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 20,
    },
    pickerTitle: {
      fontSize: 26,
      lineHeight: 30,
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
      fontSize: 40,
      lineHeight: 44,
      textAlign: 'center',
    },
    pickerColon: {
      fontSize: 32,
      lineHeight: 36,
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
      fontSize: 18,
      lineHeight: 22,
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
      fontSize: 14,
      lineHeight: 18,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
  });
}
