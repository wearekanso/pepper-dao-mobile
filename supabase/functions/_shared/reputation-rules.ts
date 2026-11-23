/**
 * Reputation rules: the single source for points and ranks.
 *
 * Imported by the app (lib/reputation.ts, lib/streaks.ts) and by the server
 * (rewards.ts, which sync-proposals and link-wallet use to pay rewards), so
 * what the UI promises is what the server pays. Keep this file free of Deno
 * and React Native APIs.
 */

/** Points awarded for each event type */
export const REPUTATION_POINTS = {
  WALLET_CONNECTED: 10,
  FIRST_VOTE: 20,
  VOTE: 10,
  PROPOSAL_SUBMITTED: 0, // No points until engagement (anti-spam)
  PROPOSAL_ENGAGED: 25,
  PROPOSAL_PASSED: 75,
  PROPOSAL_EXECUTED: 100,
  STREAK_MILESTONE: 0, // Varies by milestone: STREAK_MILESTONES
  STREAK_BROKEN: 0,
  RANK_UP: 0,
  // Not awarded: vePEPPER votes only count after delegating (to yourself),
  // so every voter "receives" a delegation and it would mean nothing
  DELEGATION_RECEIVED: 0,
} as const;

/**
 * Voting streak.
 *
 * Time is cut into fixed two-week periods counted from STREAK_EPOCH_MS. A
 * vote starts a streak at 0 weeks; a vote in each following period adds
 * STREAK_PERIOD_WEEKS (two periods in a row = 2 weeks). A period in which no
 * proposal was open to vote is skipped: it neither extends nor breaks the
 * streak. A streak breaks only when a period with an open proposal ends
 * without a vote; the period in progress never breaks it.
 */
export const STREAK_EPOCH_MS = Date.UTC(2024, 0, 1); // Monday 1 Jan 2024, 00:00 UTC
export const STREAK_PERIOD_WEEKS = 2;
export const STREAK_PERIOD_MS = STREAK_PERIOD_WEEKS * 7 * 24 * 60 * 60 * 1000;

/** Streak bonuses: streak length in weeks -> points, paid once per streak */
export const STREAK_MILESTONES: Record<number, number> = {
  2: 30,
  4: 60,
  8: 120,
  12: 200,
};

/** After 12 weeks, every further 4 weeks of streak pays this */
export const STREAK_BONUS_AFTER_12 = 75;

/** Points for reaching a streak of `weeks`, or 0 when it is not a milestone */
export function getStreakMilestonePoints(weeks: number): number {
  if (STREAK_MILESTONES[weeks]) return STREAK_MILESTONES[weeks];
  if (weeks > 12 && weeks % 4 === 0) return STREAK_BONUS_AFTER_12;
  return 0;
}

/** Streak length of `periods` periods in a row with a vote: the first one is 0 weeks */
export function getStreakWeeks(periods: number): number {
  return Math.max(0, periods - 1) * STREAK_PERIOD_WEEKS;
}

/** Index of the streak period that contains `timeMs` */
export function getStreakPeriod(timeMs: number): number {
  return Math.floor((timeMs - STREAK_EPOCH_MS) / STREAK_PERIOD_MS);
}

/** Start of streak period `period`, in ms */
export function getStreakPeriodStart(period: number): number {
  return STREAK_EPOCH_MS + period * STREAK_PERIOD_MS;
}

/** End (exclusive) of streak period `period`, in ms */
export function getStreakPeriodEnd(period: number): number {
  return getStreakPeriodStart(period + 1);
}

/** Ranks from lowest to highest */
export const RANK_ORDER = ['OBSERVER', 'MEMBER', 'PARTICIPANT', 'STEWARD', 'INITIATOR', 'GOVERNOR'] as const;

export type RuleRank = (typeof RANK_ORDER)[number];

export interface RankRequirement {
  points: number;
  requiresWallet: boolean;
  requiresVote: boolean;
  /** Minimum streak weeks */
  requiresStreak: number;
  requiresEngagedProposal: boolean;
  requiresPassedProposal: boolean;
}

export const RANK_REQUIREMENTS: Record<RuleRank, RankRequirement> = {
  OBSERVER: { points: 0, requiresWallet: false, requiresVote: false, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  MEMBER: { points: 0, requiresWallet: true, requiresVote: false, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  PARTICIPANT: { points: 50, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  STEWARD: { points: 250, requiresWallet: false, requiresVote: true, requiresStreak: 4, requiresEngagedProposal: false, requiresPassedProposal: false },
  INITIATOR: { points: 500, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: true, requiresPassedProposal: false },
  GOVERNOR: { points: 1000, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: true },
};

export interface RankInput {
  reputation_points: number;
  wallet_address: string | null;
  current_streak_weeks: number | null;
  has_voted: boolean | null;
  has_engaged_proposal: boolean | null;
  has_passed_proposal: boolean | null;
}

/** Highest rank the profile meets every requirement for */
export function eligibleRank(profile: RankInput): RuleRank {
  for (const rank of [...RANK_ORDER].reverse()) {
    const req = RANK_REQUIREMENTS[rank];
    if (
      profile.reputation_points >= req.points &&
      (!req.requiresWallet || !!profile.wallet_address) &&
      (profile.current_streak_weeks ?? 0) >= req.requiresStreak &&
      (!req.requiresVote || !!profile.has_voted) &&
      (!req.requiresEngagedProposal || !!profile.has_engaged_proposal) &&
      (!req.requiresPassedProposal || !!profile.has_passed_proposal)
    ) {
      return rank;
    }
  }
  return 'OBSERVER';
}

/** True when `a` is a higher rank than `b` */
export function isHigherRank(a: RuleRank, b: RuleRank): boolean {
  return RANK_ORDER.indexOf(a) > RANK_ORDER.indexOf(b);
}
