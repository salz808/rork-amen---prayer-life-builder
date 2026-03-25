import React, { useState, useRef, useEffect } from 'react';
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
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetSlide = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      setQ1('');
      setQ2('');
      setQ3('');
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
      week: day, // Mapping 'day' directly into the 'week' property so database migrations aren't needed
      q1,
      q2,
      q3,
      date: new Date().toLocaleDateString(),
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
                  Taking two minutes to write this down often becomes the most meaningful part of the journey.
                </Text>

                <View style={styles.question}>
                  <Text style={[styles.qLabel, { fontFamily: Fonts.titleSemiBold }]}>WHAT STOOD OUT TO YOU TODAY?</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: Fonts.serifRegular }]}
                    value={q1}
                    onChangeText={setQ1}
                    placeholder="Something felt different when…"
                    placeholderTextColor="rgba(244,237,224,0.22)"
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
                    placeholderTextColor="rgba(244,237,224,0.22)"
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
                    placeholderTextColor="rgba(244,237,224,0.22)"
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

const styles = StyleSheet.create({
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(200,137,74,0.2)',
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
    fontSize: 10.4,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: '#C8894A',
    marginBottom: 8,
  },
  title: {
    fontSize: 36.8,
    lineHeight: 36,
    color: '#F4EDE0',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 17.3,
    lineHeight: 26,
    color: 'rgba(244,237,224,0.55)',
    marginBottom: 24,
  },
  question: {
    marginBottom: 22,
  },
  qLabel: {
    fontSize: 10.4,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: '#C8894A',
    marginBottom: 10,
  },
  input: {
    fontSize: 19.5,
    lineHeight: 28,
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
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14.4,
    letterSpacing: 2,
    color: '#180C02',
  },
});
