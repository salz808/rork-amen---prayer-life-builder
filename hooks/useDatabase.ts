import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DatabaseService } from '@/lib/database';
import { UserProfile, DayProgress, WeeklyReflection, PrayerRequest, AnsweredPrayer } from '@/types';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => DatabaseService.getProfile(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: UserProfile) => DatabaseService.upsertProfile(profile),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useJourneyStats(journeyPass: number = 1) {
  return useQuery({
    queryKey: ['journeyStats', journeyPass],
    queryFn: () => DatabaseService.getJourneyStats(journeyPass),
    staleTime: 1000 * 60,
  });
}

export function useDayProgress(journeyPass: number = 1) {
  return useQuery({
    queryKey: ['dayProgress', journeyPass],
    queryFn: () => DatabaseService.getDayProgress(journeyPass),
    staleTime: 1000 * 30,
  });
}

export function useUpdateDayProgress(journeyPass: number = 1) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ day, progress }: { day: number; progress: DayProgress }) =>
      DatabaseService.upsertDayProgress(day, progress, journeyPass),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dayProgress', journeyPass] });
      void queryClient.invalidateQueries({ queryKey: ['journeyStats', journeyPass] });
    },
  });
}

export function useWeeklyReflections(journeyPass: number = 1) {
  return useQuery({
    queryKey: ['weeklyReflections', journeyPass],
    queryFn: () => DatabaseService.getWeeklyReflections(journeyPass),
    staleTime: 1000 * 60 * 10,
  });
}

export function useSaveReflection(journeyPass: number = 1) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reflection: WeeklyReflection) =>
      DatabaseService.saveWeeklyReflection(reflection, journeyPass),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['weeklyReflections', journeyPass] });
    },
  });
}

export function usePrayerRequests() {
  return useQuery({
    queryKey: ['prayerRequests'],
    queryFn: () => DatabaseService.getPrayerRequests(),
    staleTime: 1000 * 30,
  });
}

export function useSavePrayerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: Omit<PrayerRequest, 'id'>) =>
      DatabaseService.savePrayerRequest(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prayerRequests'] });
    },
  });
}

export function useUpdatePrayerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PrayerRequest> }) =>
      DatabaseService.updatePrayerRequest(id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prayerRequests'] });
    },
  });
}

export function useDeletePrayerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => DatabaseService.deletePrayerRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prayerRequests'] });
    },
  });
}

export function useAnsweredPrayers() {
  return useQuery({
    queryKey: ['answeredPrayers'],
    queryFn: () => DatabaseService.getAnsweredPrayers(),
    staleTime: 1000 * 60,
  });
}

export function useSaveAnsweredPrayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prayer: Omit<AnsweredPrayer, 'id'>) =>
      DatabaseService.saveAnsweredPrayer(prayer),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['answeredPrayers'] });
    },
  });
}

export function usePhaseTimings() {
  return useQuery({
    queryKey: ['phaseTimings'],
    queryFn: () => DatabaseService.getPhaseTimings(),
    staleTime: 1000 * 60,
  });
}

export function useUpdatePhaseTimings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ phaseName, seconds }: { phaseName: string; seconds: number }) =>
      DatabaseService.updatePhaseTimings(phaseName, seconds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['phaseTimings'] });
    },
  });
}
