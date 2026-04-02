import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useTypography } from '@/hooks/useTypography';
import { Fonts } from '@/constants/fonts';
import FeatureLockSheet from '@/components/FeatureLockSheet';
import { getFeatureRequirement } from '@/services/entitlements';
import { getSafeSession, supabase } from '@/lib/supabase';
import { SyncService } from '@/lib/syncService';
import { DayProgress } from '@/types';

type HeatMapCellState = 'completed' | 'missed' | 'future' | 'today';

interface PrayerDayRecord {
  date: string;
}

interface HeatMapMetrics {
  currentStreak: number;
  longestStreak: number;
  totalDaysPrayed: number;
}

interface HeatMapQueryResult {
  records: PrayerDayRecord[];
  source: 'supabase' | 'local';
}

const GRID_COLUMNS = 7;
const GRID_ROWS = 10;
const GRID_CELL_SIZE = 28;
const GRID_GAP = 4;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GOLD = '#C89A5A';

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateValue: string | null | undefined): string | null {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getDateKey(parsed);
}

function getStartOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function shiftDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildCompletionSet(records: PrayerDayRecord[]): Set<string> {
  return new Set(records.map((record) => record.date));
}

function calculateMetrics(records: PrayerDayRecord[]): HeatMapMetrics {
  const uniqueDates = Array.from(new Set(records.map((record) => record.date))).sort();

  if (uniqueDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalDaysPrayed: 0,
    };
  }

  let longestStreak = 1;
  let runningLongest = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`).getTime();
    const current = new Date(`${uniqueDates[index]}T00:00:00`).getTime();
    const diffDays = Math.round((current - previous) / 86400000);

    if (diffDays === 1) {
      runningLongest += 1;
      longestStreak = Math.max(longestStreak, runningLongest);
    } else {
      runningLongest = 1;
    }
  }

  const todayKey = getDateKey(new Date());
  const yesterdayKey = getDateKey(shiftDays(new Date(), -1));
  let currentStreak = 0;

  const latestDate = uniqueDates[uniqueDates.length - 1] ?? null;
  if (latestDate === todayKey || latestDate === yesterdayKey) {
    currentStreak = 1;
    for (let index = uniqueDates.length - 2; index >= 0; index -= 1) {
      const current = new Date(`${uniqueDates[index + 1]}T00:00:00`).getTime();
      const previous = new Date(`${uniqueDates[index]}T00:00:00`).getTime();
      const diffDays = Math.round((current - previous) / 86400000);
      if (diffDays !== 1) {
        break;
      }
      currentStreak += 1;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalDaysPrayed: uniqueDates.length,
  };
}

async function loadHeatMapRecords(fallbackProgress: DayProgress[]): Promise<HeatMapQueryResult> {
  try {
    const session = await getSafeSession();
    const userId = session?.user?.id;

    if (userId) {
      const { data, error } = await supabase
        .from('day_progress')
        .select('completed_at')
        .eq('user_id', userId)
        .eq('completed', true)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: true });

      if (error) {
        throw error;
      }

      const records = (data ?? [])
        .map((item) => parseDateKey(item.completed_at as string | null | undefined))
        .filter((value): value is string => Boolean(value))
        .map((date) => ({ date }));

      if (__DEV__) {
        console.log('[StreakHeatMap] Loaded Supabase day_progress records', {
          count: records.length,
          userId,
        });
      }

      return {
        records,
        source: 'supabase',
      };
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[StreakHeatMap] Supabase load failed, falling back to local state', error);
    }
  }

  const localState = await SyncService.loadLocalState();
  const storedProgress = localState?.progress ?? fallbackProgress;
  const records = storedProgress
    .filter((progress) => progress.completed)
    .map((progress) => parseDateKey(progress.completedAt))
    .filter((value): value is string => Boolean(value))
    .map((date) => ({ date }));

  if (__DEV__) {
    console.log('[StreakHeatMap] Loaded local fallback records', {
      count: records.length,
      hasLocalState: Boolean(localState),
    });
  }

  return {
    records,
    source: 'local',
  };
}

export default function StreakHeatMapCard() {
  const C = useColors();
  const T = useTypography();
  const { state, hasFeature } = useApp();
  const [lockVisible, setLockVisible] = useState<boolean>(false);
  const styles = useMemo(() => createStyles(C, T), [C, T]);

  const heatMapQuery = useQuery({
    queryKey: ['streak-heatmap', state.user?.id ?? 'guest', state.progress],
    queryFn: async () => loadHeatMapRecords(state.progress),
    staleTime: 60000,
  });

  const records = useMemo<PrayerDayRecord[]>(() => heatMapQuery.data?.records ?? [], [heatMapQuery.data?.records]);
  const unlocked = Boolean(hasFeature('STREAK_HEATMAP'));
  const completionSet = useMemo(() => buildCompletionSet(records), [records]);
  const metrics = useMemo(() => calculateMetrics(records), [records]);

  const today = useMemo(() => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);

  const gridDates = useMemo(() => {
    const currentWeekStart = getStartOfWeek(today);
    const firstGridDate = shiftDays(currentWeekStart, -((GRID_ROWS - 1) * GRID_COLUMNS));

    return Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => shiftDays(firstGridDate, index));
  }, [today]);

  const cells = useMemo(() => {
    const todayKey = getDateKey(today);

    return gridDates.map((date) => {
      const dateKey = getDateKey(date);
      const isFuture = date.getTime() > today.getTime();
      const isToday = dateKey === todayKey;
      const isCompleted = completionSet.has(dateKey);
      let stateValue: HeatMapCellState = 'missed';

      if (isFuture) {
        stateValue = 'future';
      } else if (isCompleted) {
        stateValue = 'completed';
      } else if (isToday) {
        stateValue = 'today';
      }

      return {
        key: dateKey,
        state: stateValue,
      };
    });
  }, [completionSet, gridDates, today]);

  const renderOverlay = !unlocked;

  return (
    <>
      <View style={styles.card} testID="streak-heatmap-card">
        <View style={styles.headerRow}>
          <Text style={[styles.label, { fontFamily: Fonts.titleSemiBold }]}>STREAK HEAT MAP</Text>
          <Text style={[styles.sourceText, { fontFamily: Fonts.italic }]}>10-week rolling view</Text>
        </View>

        <View style={styles.labelsRow} testID="streak-heatmap-labels">
          {DAY_LABELS.map((label, index) => (
            <Text
              key={`${label}-${index}`}
              style={[styles.dayLabel, { fontFamily: Fonts.titleSemiBold }]}
            >
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.gridWrap}>
          <View style={styles.grid} testID="streak-heatmap-grid">
            {cells.map((cell) => {
              const stateStyle: ViewStyle | undefined = cell.state === 'completed'
                ? styles.cellCompleted
                : cell.state === 'missed'
                  ? styles.cellMissed
                  : cell.state === 'future'
                    ? styles.cellFuture
                    : styles.cellToday;

              return <View key={cell.key} style={[styles.cell, stateStyle]} testID={`streak-heatmap-cell-${cell.key}`} />;
            })}
          </View>

          {renderOverlay ? (
            <View style={styles.lockLayer} pointerEvents="box-none">
              <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Pressable
                onPress={() => setLockVisible(true)}
                style={styles.lockOverlay}
                testID="streak-heatmap-overlay"
              >
                <View style={styles.lockBadge}>
                  <Lock size={16} color={GOLD} />
                </View>
                <Text style={[styles.lockTitle, { fontFamily: Fonts.serifMedium }]}>Missions feature</Text>
                <Text style={[styles.lockBody, { fontFamily: Fonts.italic }]}>See your full prayer consistency over time.</Text>
                <View style={styles.lockCta}>
                  <Text style={[styles.lockCtaText, { fontFamily: Fonts.titleBold }]}>SEE SUPPORT OPTIONS</Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.metricsRow} testID="streak-heatmap-metrics">
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { fontFamily: Fonts.titleLight }]}>{metrics.currentStreak}</Text>
            <Text style={[styles.metricLabel, { fontFamily: Fonts.titleSemiBold }]}>CURRENT STREAK</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { fontFamily: Fonts.titleLight }]}>{metrics.longestStreak}</Text>
            <Text style={[styles.metricLabel, { fontFamily: Fonts.titleSemiBold }]}>LONGEST</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, { fontFamily: Fonts.titleLight }]}>{metrics.totalDaysPrayed}</Text>
            <Text style={[styles.metricLabel, { fontFamily: Fonts.titleSemiBold }]}>TOTAL DAYS</Text>
          </View>
        </View>

        {heatMapQuery.isLoading ? (
          <Text style={[styles.statusText, { fontFamily: Fonts.italic }]}>Loading prayer history…</Text>
        ) : null}
        {heatMapQuery.data?.source ? (
          <Text style={[styles.statusText, { fontFamily: Fonts.italic }]}>
            Source: {heatMapQuery.data.source === 'supabase' ? 'Supabase day_progress' : 'local fallback'}
          </Text>
        ) : null}
      </View>

      <FeatureLockSheet
        visible={lockVisible}
        onClose={() => setLockVisible(false)}
        featureName="Streak Heat Map"
        requirement={getFeatureRequirement('STREAK_HEATMAP')}
      />
    </>
  );
}

const createStyles = (C: any, T: any) => StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    backgroundColor: C.surface,
    overflow: 'hidden',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: T.scale(8),
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
    color: C.accent,
  },
  sourceText: {
    fontSize: T.scale(12),
    color: C.textSecondary,
  },
  labelsRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  dayLabel: {
    width: GRID_CELL_SIZE,
    fontSize: T.scale(10),
    textAlign: 'center' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: C.textMuted,
  },
  gridWrap: {
    position: 'relative',
    minHeight: (GRID_CELL_SIZE * GRID_ROWS) + (GRID_GAP * (GRID_ROWS - 1)),
  },
  grid: {
    width: (GRID_CELL_SIZE * GRID_COLUMNS) + (GRID_GAP * (GRID_COLUMNS - 1)),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'transparent',
  },
  cellCompleted: {
    backgroundColor: GOLD,
    borderColor: GOLD,
    opacity: 1,
  },
  cellMissed: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.border,
    opacity: 0.3,
  },
  cellFuture: {
    borderColor: 'transparent',
    opacity: 0,
  },
  cellToday: {
    backgroundColor: 'transparent',
    borderColor: GOLD,
    opacity: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: T.scale(24),
    color: C.text,
  },
  metricLabel: {
    fontSize: T.scale(8),
    color: C.textMuted,
    letterSpacing: 1.6,
    textAlign: 'center' as const,
  },
  statusText: {
    fontSize: T.scale(12),
    color: C.textMuted,
  },
  lockLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockOverlay: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(12,8,4,0.36)',
    gap: 10,
  },
  lockBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200,154,90,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.35)',
  },
  lockTitle: {
    fontSize: T.scale(22),
    color: C.text,
  },
  lockBody: {
    fontSize: T.scale(14),
    lineHeight: 22,
    color: C.textSecondary,
    textAlign: 'center' as const,
    maxWidth: 220,
  },
  lockCta: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.38)',
    backgroundColor: 'rgba(200,154,90,0.14)',
  },
  lockCtaText: {
    fontSize: T.scale(11),
    letterSpacing: 1.4,
    color: C.text,
  },
});
