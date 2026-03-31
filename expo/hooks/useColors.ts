import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';
import LightColors from '@/constants/colors';
import DarkColors from '@/constants/darkColors';
import { getActiveThemeName, getThemeOverride, applyTheme } from '@/services/themes';

export function useColors() {
  const { state } = useApp();

  return useMemo(() => {
    if (!state.darkMode) return LightColors;
    const themeName = getActiveThemeName(state.tierLevel, state.monaticTheme ?? false);
    const override = getThemeOverride(themeName);
    return applyTheme(DarkColors, override);
  }, [state.darkMode, state.tierLevel, state.monaticTheme]);
}
