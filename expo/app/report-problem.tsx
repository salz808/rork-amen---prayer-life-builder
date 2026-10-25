import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import AnimatedPressable from '@/components/AnimatedPressable';
import { DatabaseService } from '@/lib/database';
import { hasAnonymousSession } from '@/lib/supabase';
import { MAX_BUG_REPORT_DESCRIPTION_LENGTH } from '@/lib/bugReport';

/**
 * Bug report form (build 7, migration 00016).
 *
 * Privacy boundary: the only thing sent is the user's description plus
 * app version / build / platform / OS diagnostics. No prayer text,
 * journal content, message content, or wall content is attached — the
 * form has no field for any of it. Signed-in, non-anonymous users only:
 * a guest (no session) or an anonymous session gets a sign-in prompt
 * instead of the form (crash reporting already covers guests
 * automatically, so no guest path is built here), and submit never
 * mints an anonymous session.
 */
export default function ReportProblemScreen() {
  const router = useRouter();
  const C = useColors();
  const T = useTypography();
  const styles = useMemo(() => createStyles(T), [T]);

  const [phase, setPhase] = useState<'checking' | 'prompt' | 'form' | 'done'>('checking');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus-driven (not a mount effect): mirrors the moderation screen
  // and sidesteps the set-state-in-effect lint rule.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([DatabaseService.getCurrentUserId(), hasAnonymousSession()]).then(
        ([userId, anonymous]) => {
          if (!cancelled) setPhase(userId && !anonymous ? 'form' : 'prompt');
        },
      );
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const submit = useCallback(async () => {
    const trimmed = description.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await DatabaseService.submitBugReport(trimmed);
      setPhase('done');
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('BUG_REPORT_DAILY_LIMIT')) {
        setError('You’ve already sent several reports today — thanks. Please try again tomorrow.');
      } else if (message === 'User not authenticated') {
        setPhase('prompt');
      } else {
        setError('Couldn’t send that. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [description, submitting]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.root, { backgroundColor: C.background }]}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            scaleValue={0.96}
            testID="report-problem-back"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={C.text} />
          </AnimatedPressable>
          <Text style={[styles.title, { color: C.text, fontFamily: Fonts.titleBold }]}>
            Report a problem
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {phase === 'checking' ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : phase === 'prompt' ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.textMuted, fontFamily: Fonts.serifRegular }]}>
              Sign in to report a problem, so the team can follow up if needed.
            </Text>
            <AnimatedPressable
              onPress={() => router.push('/auth')}
              scaleValue={0.97}
              style={[styles.actionBtn, { borderColor: C.borderLight }]}
              testID="report-problem-sign-in"
            >
              <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                Sign in
              </Text>
            </AnimatedPressable>
          </View>
        ) : phase === 'done' ? (
          <View style={styles.center}>
            <Text style={[styles.body, { color: C.text, fontFamily: Fonts.serifRegular }]}>
              Thanks — your report is in. The team reviews these in a weekly batch.
            </Text>
            <AnimatedPressable
              onPress={() => router.back()}
              scaleValue={0.97}
              style={[styles.actionBtn, { borderColor: C.borderLight }]}
              testID="report-problem-done"
            >
              <Text style={[styles.actionText, { color: C.text, fontFamily: Fonts.titleMedium }]}>
                Done
              </Text>
            </AnimatedPressable>
          </View>
        ) : (
          // Pre-launch a11y lane D (M-2): same KeyboardAvoidingView pattern
          // as the journal modal / profile / onboarding, so Send report
          // stays reachable with the keyboard open. Device test D5 still
          // confirms it on a short phone.
          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: C.textMuted, fontFamily: Fonts.titleBold }]}>
              What happened?
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={MAX_BUG_REPORT_DESCRIPTION_LENGTH}
              placeholder="Tell us what went wrong, and what you were doing when it happened."
              placeholderTextColor={C.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: C.surfaceAlt,
                  borderColor: C.borderLight,
                  color: C.text,
                  fontFamily: Fonts.serifRegular,
                },
              ]}
              testID="report-problem-input"
            />
            <Text style={[styles.count, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
              {description.length} / {MAX_BUG_REPORT_DESCRIPTION_LENGTH}
            </Text>
            <Text style={[styles.privacy, { color: C.textMuted, fontFamily: Fonts.titleLight }]}>
              Only your description and your app version and device are sent — never your
              prayers, journal, or messages.
            </Text>
            {error && (
              <Text style={[styles.error, { color: C.heartRed, fontFamily: Fonts.titleMedium }]}>
                {error}
              </Text>
            )}
            <AnimatedPressable
              onPress={() => void submit()}
              disabled={submitting || !description.trim()}
              scaleValue={0.97}
              style={[
                styles.submitBtn,
                {
                  backgroundColor: C.accent,
                  opacity: submitting || !description.trim() ? 0.5 : 1,
                },
              ]}
              testID="report-problem-submit"
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={[styles.submitText, { color: C.white, fontFamily: Fonts.titleBold }]}>
                  Send report
                </Text>
              )}
            </AnimatedPressable>
          </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </>
  );
}

// Pre-launch a11y lane D (PL-H9): house createStyles(T) pattern so the
// Larger Text toggle scales this screen. Normal-size values reproduce the
// old literals (see lane report for the mapping table).
function createStyles(T: any) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    title: { fontSize: T.scale(16) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
    body: { fontSize: T.scale(14), textAlign: 'center', lineHeight: T.scale(21) },
    keyboardView: { flex: 1 },
    form: { paddingHorizontal: 20, paddingBottom: 32, gap: 10 },
    label: { fontSize: T.scale(11), letterSpacing: 1 },
    input: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      fontSize: T.scale(14),
      lineHeight: T.scale(21),
      minHeight: 160,
      textAlignVertical: 'top',
    },
    count: { fontSize: T.scale(11), textAlign: 'right' },
    privacy: { fontSize: T.scale(12), lineHeight: T.scale(17) },
    error: { fontSize: T.scale(12), lineHeight: T.scale(17) },
    actionBtn: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    actionText: { fontSize: T.scale(12) },
    submitBtn: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    submitText: { fontSize: T.scale(14) },
  });
}
