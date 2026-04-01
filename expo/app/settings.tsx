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
          animation: 'fade',
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
