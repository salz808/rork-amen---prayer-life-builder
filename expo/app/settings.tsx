import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import SettingsSheet from '@/components/SettingsSheet';
import { useColors } from '@/hooks/useColors';

export default function SettingsScreen() {
  const C = useColors();
  const router = useRouter();

  return (
    <View style={[styles.screen, { backgroundColor: C.overlay }]} testID="settings-route-screen">
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          // 'none': the sheet runs its own slide/fade; a route-level fade on
          // top of it stacked into the open delay Kai reported.
          animation: 'none',
        }}
      />
      <SettingsSheet visible onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
