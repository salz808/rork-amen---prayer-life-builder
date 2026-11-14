import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Fonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { WeeklyReflection } from '@/types';

const { height: SCREEN_H } = Dimensions.get('window');

interface ReflectionModalProps {
  visible: boolean;
  day: number;
  onSave: (reflection: WeeklyReflection) => void;
  onClose: () => void;
}

function ReflectionModalComponent({ visible, day, onSave, onClose }: ReflectionModalProps) {
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');
  const overlayOpacity = useState(() => new Animated.Value(0))[0]
  const sheetSlide = useState(() => new Animated.Value(60))[0]
  // Lane D (PL-H12): house pattern so Larger Text scales this modal.
  const T = useTypography();
  const C = useColors();
  const styles = useMemo(() => createStyles(T), [T]);

  // C-7: the answers clear when the modal opens — prop-driven state,
  // adjusted during render when the prop changes (the documented
  // pattern), instead of setState in an effect. The entrance animation
  // stays in the effect below, where side effects belong.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) {
      setQ1('');
      setQ2('');
      setQ3('');
    }
  }

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(sheetSlide, { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(sheetSlide, { toValue: 60, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, overlayOpacity, sheetSlide]);

  const handleSave = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const reflection: WeeklyReflection = {
      // Audit round 3, J-B8: the 'week' column holds the journey DAY
      // (1–30); the CHECK constraint was widened to 1..30 so days 5–30
      // sync instead of failing the constraint.
      week: day,
      q1,
      q2,
      q3,
      // Audit round 4, Sync Low L4: store ISO, format at render time.
      // Locale strings made merge's newest-wins comparison
      // locale-fragile (unparseable in some locales = loses to any
      // parseable cloud date). Journal already parses + formats.
      date: new Date().toISOString(),
    };
    onSave(reflection);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={onClose} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetSlide }] }]}>
            <LinearGradient
              colors={['#251508', '#1A1006']}
              style={styles.sheetGradient}
            >
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.handle} />
                <Text style={[styles.eyebrow, { fontFamily: Fonts.titleSemiBold }]}>
                  DAY {day} REFLECTION
                </Text>
                <Text style={[styles.title, { fontFamily: Fonts.serifRegular }]}>
                  Capture what God is doing.
                </Text>
                <Text style={[styles.subtitle, { fontFamily: Fonts.italic }]}>
                  Two minutes to write this down can become the sweetest part of the journey.
                </Text>

                <View style={styles.question}>
                  <Text style={[styles.qLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT STOOD OUT TO YOU TODAY?</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: Fonts.serifRegular }]}
                    value={q1}
                    onChangeText={setQ1}
                    placeholder="Something felt different when…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.question}>
                  <Text style={[styles.qLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT ARE YOU PRAYING FOR?</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: Fonts.serifRegular }]}
                    value={q2}
                    onChangeText={setQ2}
                    placeholder="I need God to move in…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.question}>
                  <Text style={[styles.qLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT DO YOU WANT TO REMEMBER?</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: Fonts.serifRegular }]}
                    value={q3}
                    onChangeText={setQ3}
                    placeholder="I will carry this truth with me…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <LinearGradient
                    colors={['#D49550', '#A86B2A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.saveBtnGradient}
                  >
                    <Text style={[styles.saveBtnText, { fontFamily: Fonts.titleMedium }]}>
                      SAVE & CONTINUE →
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </LinearGradient>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

export default React.memo(ReflectionModalComponent);

function createStyles(T: any) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,4,1,0.9)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayTouch: {
    flex: 1,
  },
  sheet: {
    maxHeight: SCREEN_H * 0.86,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  sheetGradient: {
    paddingHorizontal: 28,
    paddingTop: 0,
    paddingBottom: 52,
  },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(200,137,74,0.22)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#C8894A',
    marginBottom: 8,
  },
  title: {
    fontSize: T.size.title,
    lineHeight: T.leading.title,
    color: '#F4EDE0',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: T.size.sectionTitle,
    lineHeight: T.leading.sectionTitle,
    color: 'rgba(244,237,224,0.55)',
    marginBottom: 24,
  },
  question: {
    marginBottom: 22,
  },
  qLabel: {
    fontSize: T.size.label,
    lineHeight: T.leading.label,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#C8894A',
    marginBottom: 10,
  },
  input: {
    fontSize: T.size.body,
    lineHeight: T.leading.body,
    color: '#F4EDE0',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,137,74,0.28)',
    paddingVertical: 10,
    paddingHorizontal: 0,
    minHeight: 52,
  },
  saveBtn: {
    borderRadius: 100,
    overflow: 'hidden',
    marginTop: 8,
  },
  saveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: T.size.button,
    lineHeight: T.leading.button,
    letterSpacing: 2,
    color: '#180C02',
  },
  });
}
