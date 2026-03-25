import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';

const LARGE_SCALE = 1.25;

export function useTypography() {
  const { state } = useApp();
  const isLarge = state.fontSize === 'large';

  return useMemo(() => ({
    scale: (base: number): number => isLarge ? Math.round(base * 1.15 * LARGE_SCALE * 10) / 10 : Math.round(base * 1.15 * 10) / 10,
    isLarge,
  }), [isLarge]);
}
