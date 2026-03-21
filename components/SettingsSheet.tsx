import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TouchableWithoutFeedback,
  Switch,
  Platform,
  ScrollView,
} from 'react-native';
import { X, Music2, Moon, Sun, AlignLeft, Heart, Lock, Bell, ChevronDown, LogOut, Trash2, ExternalLink } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { Fonts } from '@/constants/fonts';
import { Soundscape } from '@/types';
import { SOUNDSCAPE_OPTIONS } from '@/constants/soundscapes';

const SOUNDSCAPE_ICONS: Record<Soundscape, typeof Music2> = {
  throughTheDoor: Music2,
  firstLight: Sun,
  reunion: Heart,
};

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const C = useColors();
  const router = useRouter();
  const { state, setSoundscape, toggleDarkMode, setFontSize, updateReminderTime, signOut, deleteAccount } = useApp();
  const [timePickerVisible, setTimePickerVisible] = React.useState(false);
  const [tempHour, setTempHour] = React.useState('8');
  const [tempMin, setTempMin] = React.useState('00');
  const [tempAmPm, setTempAmPm] = React.useState('AM');
  const slideAnim = useRef(new Animated.Value(400)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, bgAnim]);

  const handleSoundscape = (id: Soundscape) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSoundscape(id);
  };

  const handleDarkMode = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleDarkMode();
  };

  const handleFontSize = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFontSize(state.fontSize === 'normal' ? 'large' : 'normal');
  };

  const currentReminder = state.user?.reminderTime || '8:00 AM';

  const openTimePicker = () => {
    const [time, period] = currentReminder.split(' ');
    const [h, m] = time.split(':');
    setTempHour(h);
    setTempMin(m);
    setTempAmPm(period);
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
        }
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
          }
        },
      ]
    );
  };

  const openLegal = (type: 'privacy' | 'terms') => {
    const url = type === 'privacy' ? 'https://iammadewhole.com/privacy' : 'https://iammadewhole.com/terms';
    void Linking.openURL(url);
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
                opacity: bgAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: C.surface, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifRegular }]}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: C.overlayLight }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Music</Text>
          <Text style={[styles.sectionSub, { color: C.textMuted, fontFamily: Fonts.italic }]}>Choose what plays during prayer.</Text>
          <View style={styles.soundscapeGrid}>
            {SOUNDSCAPE_OPTIONS.map(({ id, label, description, unlockDay }) => {
              const isSelected = state.soundscape === id;
              const isLocked = unlockDay > state.currentDay;
              const Icon = isLocked ? Lock : SOUNDSCAPE_ICONS[id];

              return (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.soundscapeCard,
                    {
                      backgroundColor: isSelected ? C.accentBg : C.surfaceAlt,
                      borderColor: isSelected ? C.accentDark : C.border,
                      opacity: isLocked ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (isLocked) {
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      return;
                    }
                    handleSoundscape(id);
                  }}
                  activeOpacity={0.7}
                  testID={`soundscape-${id}`}
                >
                  <View
                    style={[
                      styles.soundscapeIconWrap,
                      { backgroundColor: isSelected ? C.accentLight : C.border },
                    ]}
                  >
                    <Icon size={16} color={isSelected ? C.accentDark : C.textMuted} />
                  </View>

                  <View style={styles.soundscapeTextWrap}>
                    <Text style={[styles.soundscapeLabel, { color: isSelected ? C.accentDark : C.text, fontFamily: Fonts.titleMedium }]}> 
                      {label}
                    </Text>
                    <Text style={[styles.soundscapeDesc, { color: isSelected ? C.accent : C.textMuted, fontFamily: Fonts.titleLight }]}> 
                      {isLocked ? `Unlocks Day ${unlockDay}` : description}
                    </Text>
                  </View>

                  {isSelected ? (
                    <View style={[styles.soundscapeBadge, { backgroundColor: C.accentDark }]}>
                      <Text style={[styles.soundscapeBadgeText, { fontFamily: Fonts.titleMedium }]}>Selected</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

          <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Display</Text>

          <View style={[styles.toggleRow, { borderColor: C.borderLight }]}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIcon, { backgroundColor: state.darkMode ? '#2E2318' : C.accentBg }]}>
                {state.darkMode ? (
                  <Moon size={16} color={C.accentDark} />
                ) : (
                  <Sun size={16} color={C.accentDark} />
                )}
              </View>
              <View>
                <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Dark Mode</Text>
                <Text style={[styles.toggleSub, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
                  {state.darkMode ? 'Warm charcoal theme' : 'Light parchment theme'}
                </Text>
              </View>
            </View>
            <Switch
              value={state.darkMode}
              onValueChange={handleDarkMode}
              trackColor={{ false: C.border, true: C.accentDark }}
              thumbColor={Platform.OS === 'android' ? C.white : undefined}
              ios_backgroundColor={C.border}
              testID="dark-mode-toggle"
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: C.borderLight }]}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIcon, { backgroundColor: C.sageBg }]}>
                <AlignLeft size={16} color={C.sageDark} />
              </View>
              <View>
                <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Larger Text</Text>
                <Text style={[styles.toggleSub, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
                  {state.fontSize === 'large' ? 'Larger prayer text' : 'Standard text size'}
                </Text>
              </View>
            </View>
            <Switch
              value={state.fontSize === 'large'}
              onValueChange={handleFontSize}
              trackColor={{ false: C.border, true: C.sageDark }}
              thumbColor={Platform.OS === 'android' ? C.white : undefined}
              ios_backgroundColor={C.border}
              testID="font-size-toggle"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

          <Text style={[styles.sectionLabel, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>Notifications</Text>

          <TouchableOpacity
            style={[styles.toggleRow, { borderColor: C.borderLight, borderBottomWidth: 0 }]}
            onPress={openTimePicker}
            activeOpacity={0.7}
          >
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIcon, { backgroundColor: 'rgba(200,137,74,0.1)' }]}>
                <Bell size={16} color={C.accentDark} />
              </View>
              <View>
                <Text style={[styles.toggleLabel, { color: C.text, fontFamily: Fonts.titleSemiBold }]}>Daily Reminder</Text>
                <Text style={[styles.toggleSub, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>Get a nudge to show up</Text>
              </View>
            </View>
            <View style={styles.timeDisplay}>
              <Text style={[styles.timeDisplayText, { color: C.accent, fontFamily: Fonts.titleMedium }]}>{currentReminder}</Text>
              <ChevronDown size={14} color={C.accent} style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

          <TouchableOpacity
            style={[styles.supportRow, { backgroundColor: C.accentBg, borderColor: C.accentLight, marginBottom: 12 }]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
              setTimeout(() => router.push('/paywall'), 300);
            }}
            activeOpacity={0.8}
            testID="open-paywall"
          >
            <View style={[styles.supportIcon, { backgroundColor: C.accentDark }]}>
              <Heart size={16} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={styles.supportText}>
              <Text style={[styles.supportTitle, { color: C.accentDark, fontFamily: Fonts.titleBold }]}>Support the App</Text>
              <Text style={[styles.supportSub, { color: C.accent, fontFamily: Fonts.italic }]}>Help fund development & missions</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.accountActions}>
            <TouchableOpacity 
              style={[styles.accountBtn, { borderColor: C.borderLight }]}
              onPress={handleSignOut}
            >
              <LogOut size={16} color={C.textSecondary} />
              <Text style={[styles.accountBtnText, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.accountBtn, { borderColor: C.borderLight }]}
              onPress={handleDeleteAccount}
            >
              <Trash2 size={16} color={C.heartRed} />
              <Text style={[styles.accountBtnText, { color: C.heartRed, fontFamily: Fonts.titleMedium }]}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => openLegal('privacy')} style={styles.legalLink}>
              <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Privacy Policy</Text>
              <ExternalLink size={10} color={C.textMuted} />
            </TouchableOpacity>
            <View style={[styles.legalDot, { backgroundColor: C.textMuted }]} />
            <TouchableOpacity onPress={() => openLegal('terms')} style={styles.legalLink}>
              <Text style={[styles.legalLinkText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>Terms of Use</Text>
              <ExternalLink size={10} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          </ScrollView>

          {/* Time Picker Modal */}
          <Modal
            visible={timePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setTimePickerVisible(false)}
          >
            <View style={styles.pickerOverlay}>
              <TouchableWithoutFeedback onPress={() => setTimePickerVisible(false)}>
                <View style={styles.pickerBackdrop} />
              </TouchableWithoutFeedback>
              <View style={[styles.pickerContent, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.pickerTitle, { color: C.text, fontFamily: Fonts.serifRegular }]}>Reminder Time</Text>
                
                <View style={styles.pickerWheels}>
                  {/* Hour */}
                  <View style={styles.pickerColumn}>
                    <TouchableOpacity onPress={() => setTempHour(h => String(Math.max(1, (parseInt(h) % 12) + 1)))}>
                      <ChevronDown size={20} color={C.accent} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                    <Text style={[styles.pickerVal, { color: C.text, fontFamily: Fonts.titleBold }]}>{tempHour}</Text>
                    <TouchableOpacity onPress={() => setTempHour(h => String(parseInt(h) === 1 ? 12 : parseInt(h) - 1))}>
                      <ChevronDown size={20} color={C.accent} />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.pickerColon, { color: C.textMuted }]}>:</Text>

                  {/* Minute */}
                  <View style={styles.pickerColumn}>
                    <TouchableOpacity onPress={() => setTempMin(m => (parseInt(m) === 55 ? '00' : String(parseInt(m) + 5).padStart(2, '0')))}>
                      <ChevronDown size={20} color={C.accent} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                    <Text style={[styles.pickerVal, { color: C.text, fontFamily: Fonts.titleBold }]}>{tempMin}</Text>
                    <TouchableOpacity onPress={() => setTempMin(m => (parseInt(m) === 0 ? '55' : String(parseInt(m) - 5).padStart(2, '0')))}>
                      <ChevronDown size={20} color={C.accent} />
                    </TouchableOpacity>
                  </View>

                  {/* AM/PM */}
                  <TouchableOpacity 
                    style={[styles.ampmBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                    onPress={() => setTempAmPm(p => p === 'AM' ? 'PM' : 'AM')}
                  >
                    <Text style={[styles.ampmText, { color: C.accent, fontFamily: Fonts.titleBold }]}>{tempAmPm}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: C.accent }]}
                  onPress={saveTime}
                >
                  <Text style={[styles.saveBtnText, { fontFamily: Fonts.titleBold }]}>SET REMINDER</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,4,1,0.85)',
  },
  sheet: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingBottom: 44,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 36,
    elevation: 28,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32.2,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 12.6,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  sectionSub: {
    fontSize: 13.8,
    lineHeight: 18,
    marginBottom: 12,
  },
  soundscapeGrid: {
    gap: 10,
    marginBottom: 20,
  },
  soundscapeCard: {
    borderRadius: 18,
    padding: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  soundscapeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundscapeTextWrap: {
    flex: 1,
  },
  soundscapeLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  soundscapeDesc: {
    fontSize: 12.6,
    fontWeight: '500' as const,
  },
  soundscapeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soundscapeBadgeText: {
    fontSize: 10.4,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 17.3,
    fontWeight: '600' as const,
    marginBottom: 1,
  },
  toggleSub: {
    fontSize: 13.8,
    fontWeight: '400' as const,
  },
  supportRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  supportIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportText: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 17.3,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  supportSub: {
    fontSize: 13.8,
    fontWeight: '500' as const,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(200,137,74,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timeDisplayText: {
    fontSize: 16.1,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerContent: {
    width: '100%',
    borderRadius: 32,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  pickerTitle: {
    fontSize: 25.3,
    marginBottom: 24,
  },
  pickerWheels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  pickerColumn: {
    alignItems: 'center',
    gap: 8,
  },
  pickerVal: {
    fontSize: 41.4,
    minWidth: 50,
    textAlign: 'center',
  },
  pickerColon: {
    fontSize: 36.8,
    marginTop: -4,
  },
  ampmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  ampmText: {
    fontSize: 20.7,
    letterSpacing: 1,
  },
  saveBtn: {
    width: '100%',
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16.1,
    letterSpacing: 1.5,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 24,
  },
  accountBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  accountBtnText: {
    fontSize: 13.8,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  legalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legalLinkText: {
    fontSize: 12.6,
    textDecorationLine: 'underline',
  },
  legalDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.3,
  },
});
