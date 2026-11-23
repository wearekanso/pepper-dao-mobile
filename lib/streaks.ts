/**
 * Streak Calculation Library
 *
 * Logic for calculating and managing governance streaks.
 */

import {
  getStreakPeriod,
  getStreakPeriodEnd,
  getStreakPeriodStart,
  STREAK_PERIOD_MS,
} from '@/supabase/functions/_shared/reputation-rules';
import type { Profile, Streak, StreakDisplay } from '@/types/user';

import { getNextStreakMilestone, getStreakMilestonePoints } from './reputation';

/**
 * Bi-weekly streak period in milliseconds (14 days; shared with the server)
 */
export const BI_WEEKLY_PERIOD_MS = STREAK_PERIOD_MS;

/**
 * Get current bi-weekly period start date
 */
export function getCurrentPeriodStart(): Date {
  return new Date(getStreakPeriodStart(getStreakPeriod(Date.now())));
}

/**
 * Get current bi-weekly period end date
 */
export function getCurrentPeriodEnd(): Date {
  return new Date(getStreakPeriodEnd(getStreakPeriod(Date.now())));
}

/**
 * Check if a date is in the current bi-weekly period
 */
export function isInCurrentPeriod(date: Date): boolean {
  const periodStart = getCurrentPeriodStart();
  const periodEnd = getCurrentPeriodEnd();
  return date >= periodStart && date < periodEnd;
}

/**
 * Get days remaining in current period
 */
export function getDaysRemainingInPeriod(): number {
  const now = new Date();
  const periodEnd = getCurrentPeriodEnd();
  const msRemaining = periodEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

/**
 * Format streak weeks for display
 */
export function formatStreakWeeks(weeks: number): string {
  if (weeks === 0) return 'No active streak';
  if (weeks === 1) return '1 week';
  if (weeks < 4) return `${weeks} weeks`;
  
  const months = Math.floor(weeks / 4);
  const remainingWeeks = weeks % 4;
  
  if (remainingWeeks === 0) {
    return months === 1 ? '1 month' : `${months} months`;
  }
  
  return `${months}mo ${remainingWeeks}w`;
}

/**
 * Get streak display info
 */
export function getStreakDisplay(profile: Profile, activeStreak: Streak | null): StreakDisplay {
  const nextMilestone = getNextStreakMilestone(profile.current_streak_weeks);
  
  return {
    currentWeeks: profile.current_streak_weeks,
    longestWeeks: profile.longest_streak_weeks,
    isActive: activeStreak?.is_active ?? false,
    nextMilestone: nextMilestone?.weeks ?? null,
    nextMilestonePoints: nextMilestone?.points ?? null,
    streakStartDate: activeStreak?.start_date ?? null,
  };
}

/**
 * Calculate streak progress percentage to next milestone
 */
export function getStreakProgress(currentWeeks: number): number {
  const nextMilestone = getNextStreakMilestone(currentWeeks);
  if (!nextMilestone) return 100;
  
  // Find the previous milestone
  const milestones = [0, 2, 4, 8, 12];
  let prevMilestone = 0;
  for (const m of milestones) {
    if (m < nextMilestone.weeks && m <= currentWeeks) {
      prevMilestone = m;
    }
  }
  
  const range = nextMilestone.weeks - prevMilestone;
  const progress = currentWeeks - prevMilestone;
  
  return Math.min(100, Math.round((progress / range) * 100));
}

/**
 * Get streak status message
 */
export function getStreakStatusMessage(profile: Profile): string {
  const daysRemaining = getDaysRemainingInPeriod();
  
  if (profile.current_streak_weeks === 0) {
    return 'Start your streak by participating in governance!';
  }
  
  if (daysRemaining <= 3) {
    return `${daysRemaining} days left to maintain streak!`;
  }
  
  const nextMilestone = getNextStreakMilestone(profile.current_streak_weeks);
  if (nextMilestone) {
    const weeksToGo = nextMilestone.weeks - profile.current_streak_weeks;
    return `${weeksToGo} week${weeksToGo > 1 ? 's' : ''} to next milestone (+${nextMilestone.points} pts)`;
  }
  
  return 'Keep up the great work!';
}

/**
 * Check if user has participated in current period
 */
export function hasParticipatedInCurrentPeriod(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  
  const activityDate = new Date(lastActivityAt);
  return isInCurrentPeriod(activityDate);
}

/**
 * Get all earned milestones for a streak length
 */
export function getEarnedMilestones(weeks: number): Array<{ weeks: number; points: number }> {
  const milestones: Array<{ weeks: number; points: number }> = [];
  
  const defined = [2, 4, 8, 12];
  for (const m of defined) {
    if (m <= weeks) {
      milestones.push({ weeks: m, points: getStreakMilestonePoints(m) });
    }
  }
  
  // Add milestones beyond 12 weeks
  if (weeks > 12) {
    for (let m = 16; m <= weeks; m += 4) {
      milestones.push({ weeks: m, points: getStreakMilestonePoints(m) });
    }
  }
  
  return milestones;
}
