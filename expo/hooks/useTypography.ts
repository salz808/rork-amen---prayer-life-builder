import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';

const LARGE_SCALE = 1.18;
const BASE_SCALE = 1.15;
const MIN_LEGIBLE_SIZE = 12.4;

export function useTypography() {
  const { state } = useApp();
  const isLarge = state.fontSize === 'large';

  return useMemo(() => ({
    scale: (base: number): number => {
      const scaled = base * BASE_SCALE * (isLarge ? LARGE_SCALE : 1);
      const legibleSize = base < 12 ? Math.max(scaled, MIN_LEGIBLE_SIZE) : scaled;
      return Math.round(legibleSize * 10) / 10;
    },
    isLarge,
  }), [isLarge]);
}
