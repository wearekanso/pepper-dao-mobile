/**
 * Reputation rules: the single source for points and ranks.
 *
 * Imported by the app (lib/reputation.ts) and by Edge Functions
 * (link-wallet), so the rank the UI promises is the rank the server gives.
 * Keep this file free of Deno and React Native APIs.
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
  STREAK_MILESTONE: 0, // Varies by milestone
  STREAK_BROKEN: 0,
  RANK_UP: 0,
  STAKING_BONUS: 5, // Per week
  DELEGATION_RECEIVED: 15,
} as const;

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
