import { useMemo } from 'react';
import { useApp } from '@/providers/AppProvider';

const LARGE_SCALE = 1.2;
const BASE_SCALE = 1.08;
const MIN_LEGIBLE_SIZE = 13.4;
const LABEL_MAX_SIZE = 13.8;

export function useTypography() {
  const { state } = useApp();
  const isLarge = state.fontSize === 'large';

  return useMemo(() => ({
    scale: (base: number): number => {
      const scaled = base * BASE_SCALE * (isLarge ? LARGE_SCALE : 1);
      const minimum = MIN_LEGIBLE_SIZE * (isLarge ? LARGE_SCALE : 1);
      const legibleSize = base < 12 ? Math.max(scaled, minimum) : scaled;
      const normalizedSize = base < 12 ? Math.min(legibleSize, LABEL_MAX_SIZE * (isLarge ? LARGE_SCALE : 1)) : legibleSize;
      return Math.round(normalizedSize * 10) / 10;
    },
    isLarge,
  }), [isLarge]);
}
