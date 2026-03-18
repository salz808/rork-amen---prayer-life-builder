import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';
import LightColors from '@/constants/colors';
import DarkColors from '@/constants/darkColors';

export function useColors() {
  const { state } = useApp();
  return useMemo(() => (state.darkMode ? DarkColors : LightColors), [state.darkMode]);
}
