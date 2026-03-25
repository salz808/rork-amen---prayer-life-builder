import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { X, Lock, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Fonts } from '@/constants/fonts';

interface FeatureLockSheetProps {
  visible: boolean;
  onClose: () => void;
  featureName: string;
  requirement: string;
}

export default function FeatureLockSheet({ 
  visible, 
  onClose, 
  featureName, 
  requirement 
}: FeatureLockSheetProps) {
  const C = useColors();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, bgAnim]);

  const handleSeeOptions = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(() => {
      router.push('/paywall');
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
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

          <View style={styles.content}>
            <View style={[styles.iconWrap, { backgroundColor: C.accentBg }]}>
              <Lock size={24} color={C.accentDark} />
            </View>

            <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              {featureName}
            </Text>
            
            <Text style={[styles.description, { color: C.textSecondary, fontFamily: Fonts.serifRegular }]}>
              This feature is reserved for our{'\n'}
              <Text style={{ color: C.accentDark, fontFamily: Fonts.titleSemiBold }}>
                {requirement}
              </Text>
              {' '}partners.
            </Text>

            <View style={[styles.infoBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
               <Heart size={16} color={C.accentDark} style={{ marginBottom: 8 }} />
               <Text style={[styles.infoText, { color: C.textMuted, fontFamily: Fonts.italic }]}>
                 Every dollar goes directly toward keeping this app free for everyone and sharing the Gospel of Jesus Christ with the world.
               </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: C.accent }]}
              onPress={handleSeeOptions}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryBtnText, { fontFamily: Fonts.titleBold }]}>
                SEE SUPPORT OPTIONS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.6}
            >
              <Text style={[styles.cancelBtnText, { color: C.textMuted, fontFamily: Fonts.titleMedium }]}>
                MAYBE LATER
              </Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(8, 4, 1, 0.85)',
  },
  sheet: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 32,
  },
  content: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 32,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  cancelBtn: {
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontSize: 13,
    letterSpacing: 1,
  },
});
