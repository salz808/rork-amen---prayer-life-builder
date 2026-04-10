import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';
import DarkColors from '@/constants/darkColors';
import { getActiveThemeName, getThemeOverride, applyTheme } from '@/services/themes';

export function useColors() {
  const { state } = useApp();

  return useMemo(() => {
    const themeName = getActiveThemeName(state.tierLevel, state.themePreference ?? (state.monaticTheme ? 'monastic' : 'fireside'));
    const override = getThemeOverride(themeName);
    return applyTheme(DarkColors, override);
  }, [state.tierLevel, state.themePreference, state.monaticTheme]);
}
