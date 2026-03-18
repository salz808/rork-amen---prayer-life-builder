import { Soundscape } from '@/types';

export interface SoundscapeOption {
  id: Soundscape;
  label: string;
  description: string;
  uri: string;
  unlockDay: number;
}

const GOOGLE_DRIVE_AUDIO_BASE = 'https://drive.usercontent.google.com/download';

export const DEFAULT_SOUNDSCAPE: Soundscape = 'throughTheDoor';

export const SOUNDSCAPE_OPTIONS: SoundscapeOption[] = [
  {
    id: 'throughTheDoor',
    label: 'Through The Door',
    description: 'Ambient piano backing track',
    uri: `${GOOGLE_DRIVE_AUDIO_BASE}?id=1zM341OojGO_IVUAJ7uR18pucvxOugJps&export=download`,
    unlockDay: 1,
  },
  {
    id: 'firstLight',
    label: 'First Light',
    description: 'Ambient piano backing track',
    uri: `${GOOGLE_DRIVE_AUDIO_BASE}?id=11p1KAE09eLyWu23cg4IFLY0GmOLRgwGi&export=download`,
    unlockDay: 7,
  },
  {
    id: 'reunion',
    label: 'Reunion',
    description: 'Ambient piano backing track',
    uri: `${GOOGLE_DRIVE_AUDIO_BASE}?id=1aEUPEDClrcNKfiMfNJdUuj0toAmHI_gM&export=download`,
    unlockDay: 14,
  },
];

export const SOUNDSCAPE_MAP = SOUNDSCAPE_OPTIONS.reduce<Record<Soundscape, SoundscapeOption>>(
  (accumulator, option) => {
    accumulator[option.id] = option;
    return accumulator;
  },
  {} as Record<Soundscape, SoundscapeOption>
);

export function isSoundscape(value: unknown): value is Soundscape {
  return typeof value === 'string' && SOUNDSCAPE_OPTIONS.some((option) => option.id === value);
}
