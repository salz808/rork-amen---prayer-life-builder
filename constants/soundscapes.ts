import { Soundscape } from '@/types';

export const DEFAULT_SOUNDSCAPE: Soundscape = 'throughTheDoor';

const SOUNDSCAPE_VALUES: Soundscape[] = ['throughTheDoor', 'firstLight', 'reunion'];

export function isSoundscape(value: unknown): value is Soundscape {
  return SOUNDSCAPE_VALUES.includes(value as Soundscape);
}

export const SOUNDSCAPE_MAP: Record<Soundscape, { uri: string; label: string }> = {
  throughTheDoor: {
    label: 'Through the Door',
    uri: 'https://assets.mixkit.co/music/preview/mixkit-peaceful-guitar-background-2510.mp3',
  },
  firstLight: {
    label: 'First Light',
    uri: 'https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3',
  },
  reunion: {
    label: 'Reunion',
    uri: 'https://assets.mixkit.co/music/preview/mixkit-piano-reflections-22.mp3',
  },
};

export const SOUNDSCAPE_OPTIONS: Array<{
  id: Soundscape;
  label: string;
  description: string;
  unlockDay: number;
}> = [
  {
    id: 'throughTheDoor',
    label: 'Through the Door',
    description: 'Peaceful acoustic guitar',
    unlockDay: 1,
  },
  {
    id: 'firstLight',
    label: 'First Light',
    description: 'Serene ambient tones',
    unlockDay: 7,
  },
  {
    id: 'reunion',
    label: 'Reunion',
    description: 'Gentle piano reflections',
    unlockDay: 14,
  },
];
