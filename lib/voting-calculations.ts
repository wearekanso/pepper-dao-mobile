import type { ProposalTally, VotingSettings } from '@/types/governance';

/**
 * Basis points constant: 1% = 10000 basis points
 * Used for threshold calculations in Aragon
 */
const BASIS_POINTS_DIVISOR = 1000000;

/**
 * Calculate vote percentages from tally
 */
export interface VotePercentages {
  yes: number;
  no: number;
  abstain: number;
}

export function calculateVotePercentages(
  tally: ProposalTally,
  totalVotingPower: string,
): VotePercentages {
  const total = BigInt(totalVotingPower);
  
  if (total === BigInt(0)) {
    return { yes: 0, no: 0, abstain: 0 };
  }

  const yes = BigInt(tally.yes);
  const no = BigInt(tally.no);
  const abstain = BigInt(tally.abstain);

  // Calculate percentages
  const yesPercent = Number((yes * BigInt(100)) / total);
  const noPercent = Number((no * BigInt(100)) / total);
  const abstainPercent = Number((abstain * BigInt(100)) / total);

  return {
    yes: yesPercent,
    no: noPercent,
    abstain: abstainPercent,
  };
}

/**
 * Calculate current support (yes / (yes + no))
 * Returns value in basis points (e.g., 500000 = 50%)
 */
export function calculateCurrentSupport(tally: ProposalTally): number {
  const yes = BigInt(tally.yes);
  const no = BigInt(tally.no);
  
  const totalVotes = yes + no;
  
  if (totalVotes === BigInt(0)) {
    return 0;
  }

  // Calculate support in basis points
  const support = Number((yes * BigInt(BASIS_POINTS_DIVISOR)) / totalVotes);
  
  return support;
}

/**
 * Check if support threshold has been reached
 * Support = yes / (yes + no)
 */
export function isSupportThresholdReached(
  tally: ProposalTally,
  settings: VotingSettings,
): boolean {
  const currentSupport = calculateCurrentSupport(tally);
  return currentSupport >= settings.supportThreshold;
}

/**
 * Calculate participation rate
 * Participation = (yes + no + abstain) / totalVotingPower
 * Returns value in basis points
 */
export function calculateParticipation(
  tally: ProposalTally,
  totalVotingPower: string,
): number {
  const total = BigInt(totalVotingPower);
  
  if (total === BigInt(0)) {
    return 0;
  }

  const yes = BigInt(tally.yes);
  const no = BigInt(tally.no);
  const abstain = BigInt(tally.abstain);
  
  const totalVotes = yes + no + abstain;
  
  // Calculate participation in basis points
  const participation = Number((totalVotes * BigInt(BASIS_POINTS_DIVISOR)) / total);
  
  return participation;
}

/**
 * Check if minimum participation has been reached
 */
export function isMinParticipationReached(
  tally: ProposalTally,
  totalVotingPower: string,
  settings: VotingSettings,
): boolean {
  const participation = calculateParticipation(tally, totalVotingPower);
  return participation >= settings.minParticipation;
}

/**
 * Format voting power for display
 * Converts large numbers to readable format (e.g., "1.5K vePEPPER", "2.3M vePEPPER")
 */
export function formatVotingPower(power: string, unit = 'vePEPPER'): string {
  const value = BigInt(power);
  const decimals = BigInt('1000000000000000000'); // 18 decimals
  
  const whole = Number(value / decimals);
  
  if (whole === 0) {
    return `0 ${unit}`;
  }
  
  if (whole >= 1000000) {
    return `${(whole / 1000000).toFixed(1)}M ${unit}`;
  }
  
  if (whole >= 1000) {
    return `${(whole / 1000).toFixed(1)}K ${unit}`;
  }
  
  return `${whole} ${unit}`;
}

/**
 * Convert basis points to percentage
 * 500000 basis points = 50%
 */
export function basisPointsToPercentage(basisPoints: number): number {
  return (basisPoints / BASIS_POINTS_DIVISOR) * 100;
}

/**
 * Format basis points as percentage string
 * 500000 -> "50%"
 */
export function formatBasisPointsAsPercentage(basisPoints: number): string {
  const percentage = basisPointsToPercentage(basisPoints);
  return `${percentage.toFixed(0)}%`;
}

/**
 * Get vote distribution for progress bar display
 * Returns percentages that sum to 100
 */
export function getVoteDistribution(tally: ProposalTally): {
  yes: number;
  no: number;
  abstain: number;
} {
  const yes = BigInt(tally.yes);
  const no = BigInt(tally.no);
  const abstain = BigInt(tally.abstain);
  
  const total = yes + no + abstain;
  
  if (total === BigInt(0)) {
    return { yes: 0, no: 0, abstain: 0 };
  }
  
  // Calculate percentages that sum to 100
  const yesPercent = Number((yes * BigInt(10000)) / total) / 100;
  const noPercent = Number((no * BigInt(10000)) / total) / 100;
  const abstainPercent = Number((abstain * BigInt(10000)) / total) / 100;
  
  return {
    yes: yesPercent,
    no: noPercent,
    abstain: abstainPercent,
  };
}
