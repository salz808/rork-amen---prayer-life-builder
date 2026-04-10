import { ThemePreference, UserTier } from '@/types';

export type ThemeName = 'default' | 'monastic' | 'advent' | 'lent' | 'easter' | 'pentecost';

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getSeasonalTheme(date: Date = new Date()): 'advent' | 'lent' | 'easter' | 'pentecost' | 'default' {
  const year = date.getFullYear();
  const today = startOfDay(date);
  const easter = startOfDay(computeEaster(year));

  const advent1 = new Date(year, 11, 1);
  const advent2 = new Date(year, 11, 24);
  if (today >= advent1 && today <= advent2) return 'advent';

  const ashWednesday = startOfDay(addDays(easter, -46));
  const holySaturday = startOfDay(addDays(easter, -1));
  if (today >= ashWednesday && today <= holySaturday) return 'lent';

  const pentecost = startOfDay(addDays(easter, 49));
  if (isSameDay(today, pentecost)) return 'pentecost';

  const dayBeforePentecost = startOfDay(addDays(pentecost, -1));
  if (today >= easter && today <= dayBeforePentecost) return 'easter';

  return 'default';
}

export function getActiveThemeName(tierLevel: UserTier, themePreference: ThemePreference): ThemeName {
  if (themePreference === 'monastic' && tierLevel >= UserTier.PARTNER) {
    return 'monastic';
  }

  if (themePreference === 'fireside') {
    return 'default';
  }

  return getSeasonalTheme();
}

export type ThemeOverride = Partial<Record<string, string>>;

const MONASTIC: ThemeOverride = {
  bgGradient1: '#14120E',
  bgGradient2: '#1C180E',
  bgGradient3: '#26200C',
  background: '#14120E',
  surface: '#1C180E',
  surfaceAlt: '#201A0E',
  surfaceElevated: '#26200C',
  cardGradientEnd: '#1C180E',

  accent: '#BFB28C',
  accentDark: '#D4C9A8',
  accentLight: '#9A7F60',
  accentBg: 'rgba(191,178,140,0.07)',
  accentDeep: '#907A50',

  text: 'rgba(242,235,210,0.95)',
  textSecondary: 'rgba(220,210,185,0.75)',
  textMuted: 'rgba(200,190,165,0.52)',

  border: 'rgba(191,178,140,0.22)',
  borderLight: 'rgba(191,178,140,0.13)',
  phaseCardOpenBorder: 'rgba(191,178,140,0.22)',
  phaseCardBg: 'rgba(38,32,12,0.60)',
  phaseCardHoverBg: 'rgba(44,36,14,0.80)',

  pillBorder: 'rgba(191,178,140,0.20)',
  pillBg: 'rgba(191,178,140,0.06)',
  pillText: 'rgba(220,210,185,0.85)',

  chipBorder: 'rgba(191,178,140,0.14)',
  chipActiveBg: 'rgba(191,178,140,0.14)',
  chipActiveBorder: 'rgba(191,178,140,0.35)',

  chevronMuted: 'rgba(191,178,140,0.55)',
  settingsIcon: 'rgba(220,210,185,0.65)',
  iconMuted: 'rgba(220,210,185,0.55)',

  tabBarBg: 'rgba(20,18,14,0.95)',
  tabBarBorder: 'rgba(191,178,140,0.13)',

  quoteText: 'rgba(220,210,185,0.70)',
  supportRowBg: 'rgba(191,178,140,0.06)',
  supportRowHoverBg: 'rgba(191,178,140,0.10)',
  overlayLight: 'rgba(191,178,140,0.06)',

  dayChipBg: 'rgba(26,24,14,0.60)',
  dayChipLockedBg: 'rgba(191,178,140,0.04)',
  dayChipText: 'rgba(220,210,185,0.80)',
  dayChipTodayBg: 'rgba(191,178,140,0.10)',
  dayChipTodayBorder: 'rgba(191,178,140,0.45)',

  ambientVeil1: 'rgba(191,178,140,0.05)',
  ambientVeil2: 'rgba(140,130,100,0.02)',
  ambientVeil3: 'rgba(14,12,8,0.12)',
  ambientVeil4: 'rgba(4,3,2,0.72)',
};

const ADVENT: ThemeOverride = {
  bgGradient1: '#080E18',
  bgGradient2: '#0C1820',
  bgGradient3: '#0A2126',
  background: '#080E18',
  surface: '#0C1820',
  surfaceAlt: '#0E1C24',
  surfaceElevated: '#0A2126',
  cardGradientEnd: '#0C1820',

  accent: '#4A9BAF',
  accentDark: '#6BB8CC',
  accentLight: '#2E7A8E',
  accentBg: 'rgba(74,155,175,0.07)',
  accentDeep: '#1A6070',

  text: 'rgba(210,235,240,0.95)',
  textSecondary: 'rgba(190,220,228,0.75)',
  textMuted: 'rgba(160,200,210,0.52)',

  border: 'rgba(74,115,123,0.30)',
  borderLight: 'rgba(74,115,123,0.18)',
  phaseCardOpenBorder: 'rgba(74,115,123,0.30)',
  phaseCardBg: 'rgba(10,24,32,0.60)',
  phaseCardHoverBg: 'rgba(12,28,38,0.80)',

  pillBorder: 'rgba(74,155,175,0.20)',
  pillBg: 'rgba(74,155,175,0.06)',
  pillText: 'rgba(190,220,228,0.85)',

  chipBorder: 'rgba(74,115,123,0.14)',
  chipActiveBg: 'rgba(74,155,175,0.14)',
  chipActiveBorder: 'rgba(74,155,175,0.38)',

  chevronMuted: 'rgba(74,155,175,0.55)',
  settingsIcon: 'rgba(190,220,228,0.65)',
  iconMuted: 'rgba(190,220,228,0.55)',

  tabBarBg: 'rgba(8,14,24,0.95)',
  tabBarBorder: 'rgba(74,115,123,0.20)',

  quoteText: 'rgba(190,220,228,0.70)',
  supportRowBg: 'rgba(74,155,175,0.06)',
  supportRowHoverBg: 'rgba(74,155,175,0.10)',
  overlayLight: 'rgba(74,155,175,0.06)',

  dayChipBg: 'rgba(8,20,28,0.60)',
  dayChipLockedBg: 'rgba(74,155,175,0.04)',
  dayChipText: 'rgba(190,220,228,0.80)',
  dayChipTodayBg: 'rgba(74,155,175,0.10)',
  dayChipTodayBorder: 'rgba(74,155,175,0.45)',

  ambientVeil1: 'rgba(74,155,175,0.05)',
  ambientVeil2: 'rgba(40,100,120,0.02)',
  ambientVeil3: 'rgba(4,8,14,0.12)',
  ambientVeil4: 'rgba(2,3,4,0.72)',
};

const LENT: ThemeOverride = {
  bgGradient1: '#141008',
  bgGradient2: '#1A140A',
  bgGradient3: '#221A0C',
  background: '#141008',
  surface: '#1A140A',
  surfaceAlt: '#1E180C',
  surfaceElevated: '#221A0C',
  cardGradientEnd: '#1A140A',

  accent: '#A69180',
  accentDark: '#BFAB9A',
  accentLight: '#8A7260',
  accentBg: 'rgba(166,145,128,0.07)',
  accentDeep: '#705040',

  text: 'rgba(215,200,180,0.90)',
  textSecondary: 'rgba(195,180,160,0.72)',
  textMuted: 'rgba(175,160,140,0.50)',

  border: 'rgba(166,145,128,0.22)',
  borderLight: 'rgba(166,145,128,0.13)',
  phaseCardOpenBorder: 'rgba(166,145,128,0.22)',
  phaseCardBg: 'rgba(30,24,12,0.60)',
  phaseCardHoverBg: 'rgba(34,28,14,0.80)',

  pillBorder: 'rgba(166,145,128,0.20)',
  pillBg: 'rgba(166,145,128,0.06)',
  pillText: 'rgba(195,180,160,0.85)',

  chipBorder: 'rgba(166,145,128,0.14)',
  chipActiveBg: 'rgba(166,145,128,0.14)',
  chipActiveBorder: 'rgba(166,145,128,0.35)',

  chevronMuted: 'rgba(166,145,128,0.55)',
  settingsIcon: 'rgba(195,180,160,0.65)',
  iconMuted: 'rgba(195,180,160,0.55)',

  tabBarBg: 'rgba(20,16,8,0.95)',
  tabBarBorder: 'rgba(166,145,128,0.13)',

  quoteText: 'rgba(195,180,160,0.70)',
  supportRowBg: 'rgba(166,145,128,0.06)',
  supportRowHoverBg: 'rgba(166,145,128,0.10)',
  overlayLight: 'rgba(166,145,128,0.06)',

  dayChipBg: 'rgba(20,16,10,0.60)',
  dayChipLockedBg: 'rgba(166,145,128,0.04)',
  dayChipText: 'rgba(195,180,160,0.80)',
  dayChipTodayBg: 'rgba(166,145,128,0.10)',
  dayChipTodayBorder: 'rgba(166,145,128,0.45)',

  ambientVeil1: 'rgba(166,145,128,0.05)',
  ambientVeil2: 'rgba(120,100,80,0.02)',
  ambientVeil3: 'rgba(12,10,6,0.12)',
  ambientVeil4: 'rgba(4,3,2,0.72)',
};

const EASTER: ThemeOverride = {
  bgGradient1: '#1A1400',
  bgGradient2: '#221A04',
  bgGradient3: '#2C2008',
  background: '#1A1400',
  surface: '#221A04',
  surfaceAlt: '#261E04',
  surfaceElevated: '#2C2008',
  cardGradientEnd: '#221A04',

  accent: '#D9AB23',
  accentDark: '#ECCB50',
  accentLight: '#B08A10',
  accentBg: 'rgba(217,171,35,0.07)',
  accentDeep: '#8A6808',

  text: 'rgba(245,230,175,0.98)',
  textSecondary: 'rgba(235,210,155,0.80)',
  textMuted: 'rgba(215,190,130,0.56)',

  border: 'rgba(217,171,35,0.30)',
  borderLight: 'rgba(217,171,35,0.18)',
  phaseCardOpenBorder: 'rgba(217,171,35,0.30)',
  phaseCardBg: 'rgba(34,26,4,0.60)',
  phaseCardHoverBg: 'rgba(40,30,8,0.80)',

  pillBorder: 'rgba(217,171,35,0.20)',
  pillBg: 'rgba(217,171,35,0.06)',
  pillText: 'rgba(235,210,155,0.85)',

  chipBorder: 'rgba(217,171,35,0.14)',
  chipActiveBg: 'rgba(217,171,35,0.14)',
  chipActiveBorder: 'rgba(217,171,35,0.38)',

  chevronMuted: 'rgba(217,171,35,0.55)',
  settingsIcon: 'rgba(235,210,155,0.65)',
  iconMuted: 'rgba(235,210,155,0.55)',

  tabBarBg: 'rgba(26,20,0,0.95)',
  tabBarBorder: 'rgba(217,171,35,0.20)',

  quoteText: 'rgba(235,210,155,0.70)',
  supportRowBg: 'rgba(217,171,35,0.06)',
  supportRowHoverBg: 'rgba(217,171,35,0.10)',
  overlayLight: 'rgba(217,171,35,0.06)',

  dayChipBg: 'rgba(26,20,2,0.60)',
  dayChipLockedBg: 'rgba(217,171,35,0.04)',
  dayChipText: 'rgba(235,210,155,0.80)',
  dayChipTodayBg: 'rgba(217,171,35,0.10)',
  dayChipTodayBorder: 'rgba(217,171,35,0.50)',

  ambientVeil1: 'rgba(217,171,35,0.06)',
  ambientVeil2: 'rgba(180,140,20,0.02)',
  ambientVeil3: 'rgba(16,12,0,0.12)',
  ambientVeil4: 'rgba(4,3,0,0.72)',
};

const PENTECOST: ThemeOverride = {
  bgGradient1: '#1A0800',
  bgGradient2: '#220C02',
  bgGradient3: '#2C1004',
  background: '#1A0800',
  surface: '#220C02',
  surfaceAlt: '#260E02',
  surfaceElevated: '#2C1004',
  cardGradientEnd: '#220C02',

  accent: '#BF814B',
  accentDark: '#D9A068',
  accentLight: '#9A6030',
  accentBg: 'rgba(191,129,75,0.07)',
  accentDeep: '#784010',

  text: 'rgba(245,215,185,0.98)',
  textSecondary: 'rgba(230,195,155,0.78)',
  textMuted: 'rgba(210,175,130,0.54)',

  border: 'rgba(191,129,75,0.30)',
  borderLight: 'rgba(191,129,75,0.18)',
  phaseCardOpenBorder: 'rgba(191,129,75,0.30)',
  phaseCardBg: 'rgba(34,12,2,0.60)',
  phaseCardHoverBg: 'rgba(40,16,4,0.80)',

  pillBorder: 'rgba(191,129,75,0.20)',
  pillBg: 'rgba(191,129,75,0.06)',
  pillText: 'rgba(230,195,155,0.85)',

  chipBorder: 'rgba(191,129,75,0.14)',
  chipActiveBg: 'rgba(191,129,75,0.14)',
  chipActiveBorder: 'rgba(191,129,75,0.38)',

  chevronMuted: 'rgba(191,129,75,0.55)',
  settingsIcon: 'rgba(230,195,155,0.65)',
  iconMuted: 'rgba(230,195,155,0.55)',

  tabBarBg: 'rgba(26,8,0,0.95)',
  tabBarBorder: 'rgba(191,129,75,0.20)',

  quoteText: 'rgba(230,195,155,0.70)',
  supportRowBg: 'rgba(191,129,75,0.06)',
  supportRowHoverBg: 'rgba(191,129,75,0.10)',
  overlayLight: 'rgba(191,129,75,0.06)',

  dayChipBg: 'rgba(26,8,2,0.60)',
  dayChipLockedBg: 'rgba(191,129,75,0.04)',
  dayChipText: 'rgba(230,195,155,0.80)',
  dayChipTodayBg: 'rgba(191,129,75,0.10)',
  dayChipTodayBorder: 'rgba(191,129,75,0.50)',

  ambientVeil1: 'rgba(191,129,75,0.06)',
  ambientVeil2: 'rgba(140,80,30,0.02)',
  ambientVeil3: 'rgba(16,6,0,0.12)',
  ambientVeil4: 'rgba(4,2,0,0.72)',
};

const THEME_OVERRIDES: Record<ThemeName, ThemeOverride | null> = {
  default: null,
  monastic: MONASTIC,
  advent: ADVENT,
  lent: LENT,
  easter: EASTER,
  pentecost: PENTECOST,
};

export function getThemeOverride(themeName: ThemeName): ThemeOverride | null {
  return THEME_OVERRIDES[themeName] ?? null;
}

export function applyTheme<T extends Record<string, string>>(base: T, override: ThemeOverride | null): T {
  if (!override) return base;
  return { ...base, ...override } as T;
}
