import { DECLARATIONS } from './declarations';

export type FeelingId = 'anxious' | 'overwhelmed' | 'afraid' | 'grieving';

export interface Feeling {
  id: FeelingId;
  title: string;
  subtitle: string;
  declarationIds: string[];
}

export const FEELINGS: Feeling[] = [
  {
    id: 'anxious',
    title: 'Anxious',
    subtitle: 'When your chest is tight',
    declarationIds: ['peace-2', 'peace-4', 'peace-5', 'peace-1'],
  },
  {
    id: 'overwhelmed',
    title: 'Overwhelmed',
    subtitle: "When it's too much",
    declarationIds: ['strength-2', 'strength-6', 'peace-8', 'strength-8'],
  },
  {
    id: 'afraid',
    title: 'Afraid',
    subtitle: 'When fear is loud',
    declarationIds: ['strength-3', 'identity-8', 'peace-6', 'strength-4'],
  },
  {
    id: 'grieving',
    title: 'Grieving',
    subtitle: 'When your heart is broken',
    declarationIds: ['healing-4', 'healing-7', 'healing-8', 'healing-6'],
  },
];

export function getDeclarationsForFeeling(feelingId: FeelingId) {
  const feeling = FEELINGS.find((f) => f.id === feelingId);
  if (!feeling) return [];
  return feeling.declarationIds
    .map((id) => DECLARATIONS.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
}
