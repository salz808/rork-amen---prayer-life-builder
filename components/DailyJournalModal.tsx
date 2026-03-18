import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import GlowButton from './GlowButton';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';

interface DailyJournalModalProps {
  visible: boolean;
  day: number;
  onClose: () => void;
  onSave: (text: string) => void;
}

export function DailyJournalModal({ visible, day, onClose, onSave }: DailyJournalModalProps) {
  const C = useColors();
  const T = useTypography();
  const [journalText, setJournalText] = useState('');

  const handleClose = () => {
    setJournalText('');
    onClose();
  };

  const handleSave = () => {
    if (journalText.trim()) {
      onSave(journalText.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setJournalText('');
    onClose();
  };

  const styles = createStyles(C, T);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.sheet, { backgroundColor: C.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { fontFamily: Fonts.serifLight, color: C.text }]}>
              Day {day} Journal
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { fontFamily: Fonts.italic, color: C.textSecondary }]}>
            What stood out to you today?
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                fontFamily: Fonts.italic,
                color: C.text,
                borderColor: 'rgba(200,137,74,0.18)',
                backgroundColor: C.surfaceAlt
              }
            ]}
            placeholder="Write about what God is showing you..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={6}
            value={journalText}
            onChangeText={setJournalText}
            autoFocus
            textAlignVertical="top"
          />

          <GlowButton
            label="SAVE TO JOURNAL"
            onPress={handleSave}
            variant="primary"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: T.scale(22),
    lineHeight: 28,
  },
  subtitle: {
    fontSize: T.scale(14),
    marginBottom: 20,
    opacity: 0.8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: T.scale(15),
    lineHeight: 22,
    marginBottom: 24,
    minHeight: 160,
  },
});
