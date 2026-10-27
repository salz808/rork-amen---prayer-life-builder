export interface UserProfile {
  id?: string;
  firstName: string;
  prayerLife: 'new' | 'inconsistent' | 'growing';
  reminderTime?: string;
  onboardingComplete: boolean;
  blocker?: number;
  cloudPromptDismissedAt?: number; // timestamp ms — set when user taps "Maybe later"
  displayName?: string; // shown on invites and inside circles
}

export interface DayProgress {
  day: number;
  completed: boolean;
  completedAt: string | null;
  duration: number;
  /**
   * Partner jump-ahead marker: true when this day was completed while
   * it sat ahead of the frontier (Library jump-ahead). The frontier did
   * not advance for it, and the session gate's same-day lock ignores a
   * day whose only completions are jumped-ahead ones — otherwise a
   * jumped completion would lock the real frontier day for the rest of
   * the prayer day. Never set by frontier or replay completions.
   */
  jumpedAhead?: boolean;
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

export interface ConnectionCheckin {
  date: string;
  day: number;
  score: number; // 1-5
  createdAt: string;
}

export interface CarriedPrayer {
  echoId: string;
  text: string;
  amens: number;
  day: number;
  carriedAt: string;
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
  /** A testimony share was attempted for this entry and failed — the
      journal offers a retry instead of silently claiming it was shared. */
  testimonyShareFailed?: boolean;
  /** A testimony share succeeded as a held (under-review) post — the
      journal shows an under-review marker instead of implying the
      testimony is live on the wall. Cleared by a later published
      share; a moderator unhide does not push to the journal, so the
      marker can stay stale until the next share — known limitation. */
  testimonyHeld?: boolean;
}

/** Publicly shared answered prayer (testimony) shown on the community wall. */
export interface Testimony {
  id: string;
  request: string;
  answer: string;
  firstName: string;
  createdAt: string;
  /** Present on live testimonies; seeds have none. Own rows can be deleted. */
  userId?: string | null;
  /** Set when moderators hid the testimony; authors still see their own. */
  hiddenAt?: string | null;
  /** Hold/block reason when hidden, e.g. 'hold:self_harm' (migration 00019). */
  hiddenReason?: string | null;
}

export interface DailyPrayerLogEntry {
  date: string;
  day: number;
  completedAt: string;
  duration: number;
  /**
   * Daily Prayer expansion (Kai, 2026-10-26): which track this Daily
   * Prayer revisit came from. Absent on legacy entries — those were
   * always Foundations. Daily Prayer completion writes only this log;
   * it never advances track or Foundations progress.
   */
  trackId?: string;
}

/** One Daily Prayer revisit: a (track, day) pair, never just a day. */
export interface DailyPrayerSelection {
  trackId: string;
  day: number;
}

export interface PhaseLogEntry {
  date: string;
  phase: string;
  seconds: number;
}

export enum UserTier {
  FREE = 0,
  SUPPORT = 1,
  MISSIONS = 2,
  PARTNER = 3,
}

/** One cross-device delete, carried in AppState and in the sync_deletes
 * table (migration 20261025000015). Merge drops tombstoned ids from both
 * sides BEFORE any union, and sync uploads tombstones BEFORE upserts, so
 * a delete on one device can never be resurrected by another device's
 * stale copy. `list` is the synced list; `itemId` is the row id (for
 * reflections, `${journeyPass}:${week}`). */
export interface SyncTombstone {
  list: 'prayerRequests' | 'answeredPrayers' | 'favorites' | 'reflections';
  itemId: string;
  deletedAt: string;
}

export interface AppState {
  user: UserProfile | null;
  currentDay: number;
  progress: DayProgress[];
  streakCount: number;
  lastCompletedDate: string | null;
  journeyComplete: boolean;
  /** Kai-approved 2026-10-26: graduate status is sticky. Once a user has
   * completed Foundations, hasGraduated stays true across resetJourney /
   * startSecondPass, so Freedom and Daily Prayer do NOT re-lock for
   * graduates on a second pass (Foundations progress itself still
   * resets for re-praying, one day per day). It is cleared only by
   * sign-out / account deletion (defaultState), never by a reset.
   * Device-local for now: it is persisted in the local AppState blob
   * and survives cloud merge (the cloud load object carries no such
   * key), but no server column backs it yet — a second device that
   * syncs cleared progress will not inherit it until it graduates
   * itself or a migration adds a column. Do not clear it in reset
   * paths, and do not let completionClearedAt clear it. */
  hasGraduated?: boolean;
  ambientMuted: boolean;
  soundscape: Soundscape;
  darkMode: boolean;
  fontSize: FontSize;
  lastOpenedDate: string | null;
  openStreakCount: number;
  reflections: WeeklyReflection[];
  phaseTimings: Record<string, number>;
  phaseLog: PhaseLogEntry[];
  answeredPrayers: AnsweredPrayer[];
  prayerRequests: PrayerRequest[];
  dailyPrayerLog: DailyPrayerLogEntry[];
  journeyPass: number;
  isSubscriber: boolean;
  entitlements: string[];
  tierLevel: UserTier;
  voiceoverEnabled: boolean;
  playbackRate: number;
  monaticTheme: boolean;
  themePreference: ThemePreference;
  declarationFavorites: string[];
  firstStepsCompletedIds: string[];
  graceDaysUsed: string[];
  connectionCheckins?: ConnectionCheckin[];
  carriedPrayers?: CarriedPrayer[];
  /** Echo ids this user amen-ed that only live on this device (seed/fallback posts have no server row). */
  wallAmenedLocal?: string[];
  /** Recent prayer session start times (ISO) — drives adaptive reminders. */
  prayerStartTimes?: string[];
  /** Set once stored day-keys have been re-based from UTC calendar dates to prayer days (4 AM local, lib/prayerDay.ts). */
  prayerDayBoundaryMigrated?: boolean;
  /** Kai-approved 2026-10-26: set once the first-time grace explainer
   * line has been shown on Home, so it appears once, not every day a
   * grace window is open. */
  graceExplainerSeen?: boolean;
  /** When true, the reminder drifts toward actual prayer times (manual time still wins on change). */
  adaptiveReminderEnabled?: boolean;
  /** Audit round 4, SYNC-5: synced reset marker. resetJourney stamps
   * this; merge drops progress/flag/streak rows older than the marker
   * instead of unioning/OR-ing them back. Null = never reset. */
  journeyResetAt?: string | null;
  /** Audit round 4, SYNC-5: completion-clear marker (resetJourney and
   * continueDaily stamp this). Merge lets the newest clearer win over a
   * stale sticky journeyComplete flag instead of OR-ing it back. */
  completionClearedAt?: string | null;
  /** Audit round 4, SYNC-3: cross-device deletes pending/applied (see
   * SyncTombstone). Survives in local storage so a failed tap-time
   * tombstone write is retried by the next sync. */
  syncTombstones?: SyncTombstone[];
  /** Audit round 4, SYNC-6: wall-clock stamp of the last checklist
   * toggle on this device. Merge picks the newer side's checklist
   * wholesale (last-write-wins) instead of unioning, so an uncheck on
   * one device is not resurrected by another's stale list. Server
   * completed_at max plays the same role for the cloud side. */
  firstStepsUpdatedAt?: string | null;
  subscribedSinceMonthly: string | null;
  hasRatedPrompted?: boolean;
  lastActivityAt: string | null;
  activeSession: {
    day: number;
    phase: string | null;
    secondsElapsed: number;
    lastUpdated: string;
    /** Which track this session belongs to. Absent on sessions stored
        before the track-aware fix — those resume by day alone, once. */
    trackId?: string;
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

export interface CommunityEcho {
  id: string;
  userId: string | null;
  text: string;
  amens: number;
  createdAt: string;
  /** Set when moderators hid the post; authors still see their own. */
  hiddenAt?: string | null;
  /** Hold/block reason when hidden, e.g. 'hold:self_harm' (migration 00019). */
  hiddenReason?: string | null;
}

/** One row of the moderator review queue (hidden wall posts). */
export interface HiddenWallPost {
  kind: 'echo' | 'testimony';
  id: string;
  preview: string;
  authorId: string | null;
  firstName: string | null;
  createdAt: string;
  hiddenAt: string;
  hiddenReason: string | null;
  reportCount: number;
}

export interface Circle {
  id: string;
  name: string;
  joinCode: string;
  role: 'owner' | 'member';
  memberCount: number;
  createdAt: string;
}

export interface CirclePreview {
  id: string;
  name: string;
  memberCount: number;
  isMember: boolean;
}
