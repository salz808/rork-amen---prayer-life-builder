import { Soundscape } from '@/types';

export interface SoundscapeOption {
  id: Soundscape;
  label: string;
  description: string;
  uri: string;
  unlockDay: number;
  bonusUris?: string[];
}

// Soundscape audio lives in the public Supabase Storage bucket
// `soundscapes` (live project). The URL is built directly from the
// project host so soundscapes play even when Supabase is not configured
// (local-guest mode) — the bucket is public, so no client or key is
// needed. Deliberately NOT read from EXPO_PUBLIC_SUPABASE_URL: the
// bucket exists only on the live project, and a process.env read here
// breaks Jest for every suite that imports this module (babel rewrites
// it to expo/virtual/env, which Jest cannot load as ESM).
const SOUNDSCAPE_AUDIO_BASE =
  'https://aexpgrcglddudxxcjlzj.supabase.co/storage/v1/object/public/soundscapes';

export const DEFAULT_SOUNDSCAPE: Soundscape = 'throughTheDoor';

export const SOUNDSCAPE_OPTIONS: SoundscapeOption[] = [
  {
    id: 'throughTheDoor',
    label: 'Through The Door',
    description: 'Ambient piano backing track',
    uri: `${SOUNDSCAPE_AUDIO_BASE}/throughTheDoor.mp3`,
    unlockDay: 1,
  },
  {
    id: 'firstLight',
    label: 'First Light',
    description: 'Ambient piano backing track',
    uri: `${SOUNDSCAPE_AUDIO_BASE}/firstLight.mp3`,
    unlockDay: 7,
  },
  {
    id: 'reunion',
    label: 'Reunion',
    description: 'Ambient piano backing track',
    uri: `${SOUNDSCAPE_AUDIO_BASE}/reunion.mp3`,
    unlockDay: 14,
  },
  {
    id: 'monastic',
    label: 'The Threshold',
    description: 'Choral ambient backing track',
    uri: `${SOUNDSCAPE_AUDIO_BASE}/monastic.mp3`,
    unlockDay: 21,
    bonusUris: [
      `${SOUNDSCAPE_AUDIO_BASE}/monastic-bonus1.mp3`,
      `${SOUNDSCAPE_AUDIO_BASE}/monastic-bonus2.mp3`,
    ],
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
