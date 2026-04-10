export interface UserProfile {
  id?: string;
  firstName: string;
  prayerLife: 'new' | 'inconsistent' | 'growing';
  reminderTime?: string;
  onboardingComplete: boolean;
  blocker?: number;
  cloudPromptDismissedAt?: number; // timestamp ms — set when user taps "Maybe later"
}

export interface DayProgress {
  day: number;
  completed: boolean;
  completedAt: string | null;
  duration: number;
}

export type Soundscape = 'throughTheDoor' | 'firstLight' | 'reunion' | 'monastic';
export type FontSize = 'normal' | 'large';
export type ThemePreference = 'fireside' | 'seasonal' | 'monastic';

export interface WeeklyReflection {
  week: number;
  q1: string;
  q2: string;
  q3: string;
  date: string;
}

export interface PrayerRequest {
  id: string;
  text: string;
  date: string;
  isAnswered: boolean;
  answer?: string;
  answeredAt?: string;
}

export interface AnsweredPrayer {
  id: string;
  request: string;
  answer: string;
  date: string;
  shared?: boolean;
}

export interface DailyPrayerLogEntry {
  date: string;
  day: number;
  completedAt: string;
  duration: number;
}

export enum UserTier {
  FREE = 0,
  SUPPORT = 1,
  MISSIONS = 2,
  PARTNER = 3,
}

export interface AppState {
  user: UserProfile | null;
  currentDay: number;
  progress: DayProgress[];
  streakCount: number;
  lastCompletedDate: string | null;
  journeyComplete: boolean;
  ambientMuted: boolean;
  soundscape: Soundscape;
  darkMode: boolean;
  fontSize: FontSize;
  lastOpenedDate: string | null;
  openStreakCount: number;
  reflections: WeeklyReflection[];
  phaseTimings: Record<string, number>;
  answeredPrayers: AnsweredPrayer[];
  prayerRequests: PrayerRequest[];
  dailyPrayerLog: DailyPrayerLogEntry[];
  journeyPass: number;
  isSubscriber: boolean;
  entitlements: string[];
  tierLevel: UserTier;
  voiceoverEnabled: boolean;
  monaticTheme: boolean;
  themePreference: ThemePreference;
  declarationFavorites: string[];
  firstStepsCompletedIds: string[];
  activeSession: {
    day: number;
    phase: string | null;
    secondsElapsed: number;
    lastUpdated: string;
  } | null;
}

export interface TriadItem {
  label: string | null;
  text: string;
}

export interface SilenceSection {
  durationSeconds: number;
  prompt: string;
}

export type SessionPhase = 'settle' | 'teach' | 'triad' | 'silence' | 'act';

export interface DayContent {
  day: number;
  title: string;
  phase: string;
  settle: string;
  teach: string;
  triad: TriadItem[];
  silence: SilenceSection;
  act: string;
  identity?: string;
  verse?: string;
  declare?: string;
}

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

export type PrayerLifeOption = {
  value: UserProfile['prayerLife'];
  label: string;
  description: string;
};
