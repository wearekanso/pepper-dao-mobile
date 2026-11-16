/**
 * User Profile and Reputation Types
 *
 * Types for the reputation system including profiles, activities, streaks, and votes.
 */

/**
 * User ranks from lowest to highest
 */
export const RANKS = ['OBSERVER', 'MEMBER', 'PARTICIPANT', 'STEWARD', 'INITIATOR', 'GOVERNOR'] as const;
export type Rank = (typeof RANKS)[number];

/**
 * Vote types for proposals
 */
export const VOTE_TYPES = ['YES', 'NO', 'ABSTAIN'] as const;
export type VoteType = (typeof VOTE_TYPES)[number];

/**
 * Activity event types that can earn or track reputation
 */
export const EVENT_TYPES = [
  'WALLET_CONNECTED',
  'FIRST_VOTE',
  'VOTE',
  'PROPOSAL_SUBMITTED',
  'PROPOSAL_ENGAGED',
  'PROPOSAL_PASSED',
  'PROPOSAL_EXECUTED',
  'STREAK_MILESTONE',
  'STREAK_BROKEN',
  'RANK_UP',
  'STAKING_BONUS',
  'DELEGATION_RECEIVED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Streak types
 */
export const STREAK_TYPES = ['GOVERNANCE', 'VOTING', 'STAKING'] as const;
export type StreakType = (typeof STREAK_TYPES)[number];

/**
 * Reasons a streak can be broken
 */
export const BROKEN_REASONS = ['MISSED_PERIOD', 'MANUAL_RESET'] as const;
export type BrokenReason = (typeof BROKEN_REASONS)[number];

/**
 * User profile data
 */
export interface Profile {
  id: string;
  wallet_address: string | null;
  reputation_points: number;
  rank: Rank;
  current_streak_weeks: number;
  longest_streak_weeks: number;
  last_activity_at: string | null;
  has_voted: boolean;
  has_engaged_proposal: boolean;
  has_passed_proposal: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Vote record linking user to proposal
 */
export interface Vote {
  id: string;
  profile_id: string;
  /** 256-bit on-chain proposal id, stored as TEXT */
  proposal_id: string;
  vote_type: VoteType;
  transaction_hash: string | null;
  created_at: string;
}

/**
 * Activity/reputation history entry
 */
export interface Activity {
  id: string;
  profile_id: string;
  event_type: EventType;
  points: number;
  total_after: number;
  rank_before: Rank | null;
  rank_after: Rank | null;
  /** 256-bit on-chain proposal id, stored as TEXT */
  proposal_id: string | null;
  streak_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Streak record for tracking governance participation streaks
 */
export interface Streak {
  id: string;
  profile_id: string;
  streak_type: StreakType;
  start_date: string;
  end_date: string | null;
  length_weeks: number;
  is_active: boolean;
  broken_reason: BrokenReason | null;
  activities_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * User context state
 */
export interface UserState {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: Profile | null;
  error: Error | null;
}

/**
 * Activity display info for UI
 */
export interface ActivityDisplay {
  id: string;
  title: string;
  description: string;
  points: number;
  pointsDisplay: string;
  icon: string;
  timestamp: string;
  isRankUp: boolean;
}

/**
 * Streak display info for UI
 */
export interface StreakDisplay {
  currentWeeks: number;
  longestWeeks: number;
  isActive: boolean;
  nextMilestone: number | null;
  nextMilestonePoints: number | null;
  streakStartDate: string | null;
}

/**
 * Rank display info for UI
 */
export interface RankDisplay {
  rank: Rank;
  label: string;
  level: number;
  maxLevel: number;
  nextRank: Rank | null;
  pointsToNext: number | null;
}
