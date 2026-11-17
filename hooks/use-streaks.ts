/**
 * useStreaks Hook
 *
 * Fetches and manages streak data for a user profile.
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/config/supabase';
import {
  formatStreakWeeks,
  getStreakDisplay,
  getStreakProgress,
  getStreakStatusMessage,
} from '@/lib/streaks';
import type { Profile, Streak, StreakDisplay } from '@/types/user';

interface UseStreaksOptions {
  profile: Profile | null;
}

interface UseStreaksReturn {
  activeStreak: Streak | null;
  streakHistory: Array<Streak>;
  streakDisplay: StreakDisplay | null;
  progress: number;
  statusMessage: string;
  formattedCurrent: string;
  formattedLongest: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch active streak from Supabase
 */
async function fetchActiveStreak(profileId: string): Promise<Streak | null> {
  const { data, error } = await supabase
    .from('streaks')
    .select('*')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    // Merged profiles keep one active streak per type; the longest wins here
    .order('length_weeks', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      // No active streak found
      return null;
    }
    console.error('[useStreaks] Error fetching active streak:', error);
    throw error;
  }

  return (data as Streak | null) ?? null;
}

/**
 * Fetch streak history from Supabase
 */
async function fetchStreakHistory(profileId: string, limit: number): Promise<Array<Streak>> {
  const { data, error } = await supabase
    .from('streaks')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[useStreaks] Error fetching streak history:', error);
    throw error;
  }

  return (data || []) as Array<Streak>;
}

/**
 * Hook to fetch user streaks
 */
export function useStreaks({ profile }: UseStreaksOptions): UseStreaksReturn {
  const profileId = profile?.id;

  // Fetch active streak
  const {
    data: activeStreak,
    isLoading: isLoadingActive,
    error: activeError,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ['streaks', 'active', profileId],
    queryFn: () => fetchActiveStreak(profileId!),
    enabled: !!profileId,
    staleTime: 60000, // 1 minute
  });

  // Fetch streak history
  const {
    data: streakHistory,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['streaks', 'history', profileId],
    queryFn: () => fetchStreakHistory(profileId!, 10),
    enabled: !!profileId,
    staleTime: 60000, // 1 minute
  });

  const isLoading = isLoadingActive || isLoadingHistory;
  const error = activeError || historyError;

  // Calculate display values
  const streakDisplay = profile ? getStreakDisplay(profile, activeStreak || null) : null;
  const progress = profile ? getStreakProgress(profile.current_streak_weeks) : 0;
  const statusMessage = profile ? getStreakStatusMessage(profile) : '';
  const formattedCurrent = profile ? formatStreakWeeks(profile.current_streak_weeks) : 'No streak';
  const formattedLongest = profile ? formatStreakWeeks(profile.longest_streak_weeks) : 'No streak';

  function refetch() {
    refetchActive();
    refetchHistory();
  }

  return {
    activeStreak: activeStreak || null,
    streakHistory: streakHistory || [],
    streakDisplay,
    progress,
    statusMessage,
    formattedCurrent,
    formattedLongest,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
