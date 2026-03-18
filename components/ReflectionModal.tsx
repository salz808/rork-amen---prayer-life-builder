import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { Fonts } from '@/constants/fonts';
import { WeeklyReflection } from '@/types';

interface Props {
  visible: boolean;
  week: number;
  onSave: (reflection: WeeklyReflection) => void;
  onClose: () => void;
}

const QUESTIONS = [
  'What has God been teaching you this week?',
  'Where did you sense His presence most?',
  'What is one thing you want to carry forward?',
];

export default function ReflectionModal({ visible, week, onSave, onClose }: Props) {
  const C = useColors();
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');

  const handleSave = () => {
    onSave({
      week,
      q1,
      q2,
      q3,
      date: new Date().toISOString().split('T')[0],
    });
    setQ1('');
    setQ2('');
    setQ3('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text, fontFamily: Fonts.serifSemiBold }]}>
              Week {week} Reflection
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {([
              { label: QUESTIONS[0], value: q1, onChange: setQ1 },
              { label: QUESTIONS[1], value: q2, onChange: setQ2 },
              { label: QUESTIONS[2], value: q3, onChange: setQ3 },
            ] as const).map((item, i) => (
              <View key={i} style={styles.fieldGroup}>
                <Text style={[styles.question, { color: C.textSecondary, fontFamily: Fonts.titleMedium }]}>
                  {item.label}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: C.text,
                      borderColor: C.border,
                      backgroundColor: C.surfaceAlt,
                      fontFamily: Fonts.titleRegular,
                    },
                  ]}
                  value={item.value}
                  onChangeText={item.onChange}
                  multiline
                  placeholder="Write your reflection..."
                  placeholderTextColor={C.textMuted}
                />
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: C.accent }]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { fontFamily: Fonts.titleSemiBold }]}>Save Reflection</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
  },
  body: {
    paddingBottom: 16,
    gap: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  question: {
    fontSize: 12,
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
