import { HtmlDayData } from '@/types';
import { DAYS as FOUNDATIONS_DAYS } from './content';
import { FREEDOM_DAYS } from './freedom';

export interface Track {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  dayCount: number;
  days: HtmlDayData[];
  // Recommended order (1-based). Lower = earlier in the journey.
  order: number;
  // Whether this track is available now or still being prepared.
  status: 'live' | 'coming_soon';
  // Short theme summary for the track card.
  theme: string;
}

export const TRACKS: Track[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    subtitle: 'Learn to pray',
    description:
      'A 30-day journey from your first honest prayer to a habit that is yours. We walk with you at first. Then you walk on your own.',
    dayCount: 30,
    days: FOUNDATIONS_DAYS,
    order: 1,
    status: 'live',
    theme: 'Learn to pray',
  },
  {
    id: 'freedom',
    title: 'Freedom',
    subtitle: 'Get free, stay free',
    description:
      'A 21-day journey into truth, breaking free, and staying free. From the Total Reset course. Renounce, which means let go of, the lies, forgive, take authority, and walk free.',
    dayCount: 21,
    days: FREEDOM_DAYS,
    order: 2,
    status: 'live',
    theme: 'Get free, stay free',
  },
  {
    id: 'hearing-god',
    title: 'Hearing God',
    subtitle: 'Learn to listen',
    description:
      'A 14-day journey into knowing His voice when He speaks. Quieter, slower, deeper, with longer quiet times and room to listen.',
    dayCount: 14,
    days: [],
    order: 3,
    status: 'coming_soon',
    theme: 'Learn to listen',
  },
  {
    id: 'intercession',
    title: 'Intercession',
    subtitle: 'Carry others',
    description:
      'A 14-day outward journey. You have learned to pray and get free. You can hear Him. Now pray for others. Stand in the gap for people you love.',
    dayCount: 14,
    days: [],
    order: 4,
    status: 'coming_soon',
    theme: 'Carry others',
  },
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}

export function getLiveTracks(): Track[] {
  return TRACKS.filter((t) => t.status === 'live').sort((a, b) => a.order - b.order);
}

export function getTrackDay(trackId: string, day: number): HtmlDayData | undefined {
  const track = getTrack(trackId);
  if (!track || track.days.length === 0) return undefined;
  const idx = Math.max(0, Math.min(day - 1, track.days.length - 1));
  return track.days[idx];
}

/** The track every user starts on. */
export const DEFAULT_TRACK_ID = 'foundations';
