import { TYPOGRAPHY } from '@/constants/typography';
import { useMemo } from 'react';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function NotFoundScreen() {
  const C = useColors();
  const styles = useMemo(() => createStyles(C), [C]);

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This page doesn&apos;t exist.</Text>
        <Link href="/" replace style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: C.background,
  },
  title: {
    fontSize: TYPOGRAPHY.sectionTitle.size,
    lineHeight: TYPOGRAPHY.sectionTitle.lineHeight,
    fontWeight: '600',
    color: C.text,
  },
  link: {
    marginTop: 16,
    paddingVertical: 12,
  },
  linkText: {
    fontSize: TYPOGRAPHY.body.size,
    lineHeight: TYPOGRAPHY.body.lineHeight,
    color: C.accentDark,
    fontWeight: '600',
  },
});
