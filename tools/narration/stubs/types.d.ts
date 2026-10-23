// Compile-time stub for '@/types' so the content mocks can be compiled to
// plain JS for extraction. Field shapes mirror the real HtmlDayData in
// expo/types/index.ts; the mocks only import types from '@/types', so the
// emitted JS elides the import entirely.
export interface HtmlDayData {
  title: string;
  subtitle: string;
  phase: string;
  settle: string;
  focus: string;
  thank: string | null;
  thankPrompt?: string | null;
  repent: string | null;
  repentPrompt?: string | null;
  invite: string | null;
  invitePrompt?: string | null;
  ask: string | null;
  askPrompt?: string | null;
  declare: string | null;
  declarePrompt?: string | null;
  silence: number;
  silenceTxt: string;
  act: string;
  identity: string;
  verse: string;
}

export interface DayContent {
  [key: string]: unknown;
}

export interface PrayerLifeOption {
  [key: string]: unknown;
}
