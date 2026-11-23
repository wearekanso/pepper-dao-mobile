/**
 * Reputation System
 *
 * Point values, rank thresholds, and reputation calculation logic.
 */

import {
  getStreakMilestonePoints,
  RANK_ORDER as SHARED_RANK_ORDER,
  RANK_REQUIREMENTS as SHARED_RANK_REQUIREMENTS,
  REPUTATION_POINTS as SHARED_REPUTATION_POINTS,
  STREAK_BONUS_AFTER_12,
  STREAK_MILESTONES,
  type RankRequirement,
} from '@/supabase/functions/_shared/reputation-rules';
import type { Activity, EventType, Profile, Rank, RankDisplay } from '@/types/user';

/**
 * Points awarded for each event type (shared with the server)
 */
export const REPUTATION_POINTS: Record<EventType, number> = SHARED_REPUTATION_POINTS;

/**
 * Streak bonuses (shared with the server, which pays them in sync-proposals)
 */
export { getStreakMilestonePoints, STREAK_BONUS_AFTER_12, STREAK_MILESTONES };

/**
 * Rank thresholds and requirements (shared with the server, which awards
 * ranks in link-wallet)
 */
export type { RankRequirement };

export const RANK_REQUIREMENTS: Record<Rank, RankRequirement> = SHARED_RANK_REQUIREMENTS;

/**
 * Rank labels for display
 */
export const RANK_LABELS: Record<Rank, string> = {
  OBSERVER: 'Observer',
  MEMBER: 'Member',
  PARTICIPANT: 'Participant',
  STEWARD: 'Steward',
  INITIATOR: 'Initiator',
  GOVERNOR: 'Governor',
};

/**
 * Rank order for comparison (shared with the server)
 */
export const RANK_ORDER: Array<Rank> = [...SHARED_RANK_ORDER];

/**
 * Get points for a specific event type
 */
export function getPointsForEvent(eventType: EventType): number {
  return REPUTATION_POINTS[eventType];
}

/**
 * Check if a week count is a milestone
 */
export function isStreakMilestone(weeks: number): boolean {
  return getStreakMilestonePoints(weeks) > 0;
}

/**
 * Get the next streak milestone
 */
export function getNextStreakMilestone(currentWeeks: number): { weeks: number; points: number } | null {
  const milestones = Object.keys(STREAK_MILESTONES).map(Number).sort((a, b) => a - b);

  for (const milestone of milestones) {
    if (milestone > currentWeeks) {
      return { weeks: milestone, points: STREAK_MILESTONES[milestone] };
    }
  }

  // After all defined milestones, next is at next 4-week interval after 12
  if (currentWeeks >= 12) {
    const nextMilestone = Math.ceil((currentWeeks + 1) / 4) * 4;
    if (nextMilestone > currentWeeks) {
      return { weeks: nextMilestone, points: STREAK_BONUS_AFTER_12 };
    }
  }

  return null;
}

/**
 * Get rank level (1-6)
 */
export function getRankLevel(rank: Rank): number {
  return RANK_ORDER.indexOf(rank) + 1;
}

/**
 * Get next rank
 */
export function getNextRank(currentRank: Rank): Rank | null {
  const currentIndex = RANK_ORDER.indexOf(currentRank);
  if (currentIndex < RANK_ORDER.length - 1) {
    return RANK_ORDER[currentIndex + 1];
  }
  return null;
}

/**
 * Calculate points needed for next rank
 */
export function getPointsToNextRank(profile: Profile): number | null {
  const nextRank = getNextRank(profile.rank);
  if (!nextRank) return null;

  const nextRequirement = RANK_REQUIREMENTS[nextRank];
  const pointsNeeded = nextRequirement.points - profile.reputation_points;

  return Math.max(0, pointsNeeded);
}

/**
 * Get rank display info
 */
export function getRankDisplay(profile: Profile): RankDisplay {
  const nextRank = getNextRank(profile.rank);
  const pointsToNext = getPointsToNextRank(profile);

  return {
    rank: profile.rank,
    label: RANK_LABELS[profile.rank],
    level: getRankLevel(profile.rank),
    maxLevel: RANK_ORDER.length,
    nextRank,
    pointsToNext,
  };
}

/**
 * Format points for display
 */
export function formatPoints(points: number): string {
  if (points === 0) return '--';
  return points > 0 ? `+${points}` : `${points}`;
}

/**
 * Get event display title
 */
export function getEventTitle(activity: Activity): string {
  switch (activity.event_type) {
    case 'WALLET_CONNECTED':
      return 'Wallet Connected!';
    case 'FIRST_VOTE':
      return 'First Vote!';
    case 'VOTE':
      return `Voted on Proposal #${activity.proposal_id}`;
    case 'PROPOSAL_SUBMITTED':
      return `Submitted Proposal #${activity.proposal_id}`;
    case 'PROPOSAL_ENGAGED':
      return `Proposal #${activity.proposal_id} reached its turnout`;
    case 'PROPOSAL_PASSED':
      return `Proposal #${activity.proposal_id} passed!`;
    case 'PROPOSAL_EXECUTED':
      return `Proposal #${activity.proposal_id} executed!`;
    case 'STREAK_MILESTONE': {
      const weeks = (activity.metadata as { weeks?: number })?.weeks || 0;
      return `${weeks}-week streak!`;
    }
    case 'STREAK_BROKEN':
      return 'Streak ended';
    case 'RANK_UP':
      return `Reached ${RANK_LABELS[activity.rank_after!]} rank!`;
    case 'DELEGATION_RECEIVED':
      return 'Received delegation';
    default:
      return 'Activity';
  }
}

/**
 * Get event icon
 */
export function getEventIcon(eventType: EventType): string {
  switch (eventType) {
    case 'WALLET_CONNECTED':
      return '👛';
    case 'FIRST_VOTE':
    case 'VOTE':
      return '🗳️';
    case 'PROPOSAL_SUBMITTED':
    case 'PROPOSAL_ENGAGED':
    case 'PROPOSAL_PASSED':
    case 'PROPOSAL_EXECUTED':
      return '📜';
    case 'STREAK_MILESTONE':
      return '🔥';
    case 'STREAK_BROKEN':
      return '💔';
    case 'RANK_UP':
      return '⭐';
    case 'DELEGATION_RECEIVED':
      return '🤝';
    default:
      return '📌';
  }
}
