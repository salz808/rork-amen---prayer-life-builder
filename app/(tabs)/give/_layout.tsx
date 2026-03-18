import { Stack } from 'expo-router';
import DarkColors from '@/constants/darkColors';

export default function GiveLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: DarkColors.background },
      }}
    />
  );
}
