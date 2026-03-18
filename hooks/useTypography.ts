import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';

const LARGE_SCALE = 1.25;
const BASE_SCALE = 1.21;

export function useTypography() {
  const { state } = useApp();
  const isLarge = state.fontSize === 'large';

  return useMemo(() => ({
    scale: (base: number): number => {
      const scaled = base * BASE_SCALE;
      return isLarge ? Math.round(scaled * LARGE_SCALE * 10) / 10 : Math.round(scaled * 10) / 10;
    },
    isLarge,
  }), [isLarge]);
}
