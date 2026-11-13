import type { GovernanceTrack } from '@/config/aragon-governance';

/**
 * Governance status derived from Aragon Multisig proposal state
 * - PENDING: Before startDate
 * - ACTIVE: Between startDate and endDate, not executed
 * - EXECUTED: Proposal has been executed
 * - REJECTED: Past endDate without reaching approval threshold
 * - SUCCEEDED: Approval reached but not yet executed
 */
export type GovernanceStatus =
  | 'ACTIVE'
  | 'EXECUTED'
  | 'PENDING'
  | 'REJECTED'
  | 'SUCCEEDED';

/**
 * Proposal type based on the plugin that created it
 * - ADMIN: Admin plugin proposals (executed by admins only)
 * - MULTISIG: Multisig plugin proposals (require multiple approvals)
 * - PEP: Pepper Evolution Proposals (staged community voting)
 * - OTHER: Unknown or other plugin types
 */
export type GovernanceProposalType = 'ADMIN' | 'MULTISIG' | 'PEP' | 'OTHER';

/**
 * Action to be executed by the proposal
 */
export interface ProposalAction {
  to: string;
  value: string;
  data: string;
}

/**
 * Vote option enum matching Aragon's IMajorityVoting.VoteOption
 * - NONE: User has not voted
 * - ABSTAIN: Vote option 1
 * - YES: Vote option 2 (to approve)
 * - NO: Vote option 3 (to reject)
 */
export type VoteOption = 'NONE' | 'ABSTAIN' | 'YES' | 'NO';

/**
 * Voting tally structure from Aragon Token Voting
 * Stores voting power for each option as string to handle large numbers
 */
export interface ProposalTally {
  /** Voting power for "yes" votes */
  yes: string;
  /** Voting power for "no" votes */
  no: string;
  /** Voting power for "abstain" votes */
  abstain: string;
}

/**
 * Voting settings from Aragon's VotingSettings
 * Basis points: 1% = 10000, so 50% = 500000
 */
export interface VotingSettings {
  /** Support threshold in basis points (e.g., 50% = 500000) */
  supportThreshold: number;
  /** Minimum participation in basis points (e.g., 15% = 150000) */
  minParticipation: number;
  /** Minimum duration in seconds */
  minDuration: number;
  /** Minimum proposer voting power required */
  minProposerVotingPower: string;
}

/**
 * User's vote on a specific proposal
 */
export interface UserVote {
  proposalId: string;
  voter: string;
  voteOption: VoteOption;
  votingPower: string;
}

export interface GovernanceProposal {
  /** Subgraph ID (format: plugin_proposalId) */
  id: string;
  /** On-chain proposal ID (256-bit, keep as string) */
  pluginProposalId: string;
  /** Plugin contract the proposal lives on: votes go to this address */
  pluginAddress: string;
  /** Voting track, resolved from the plugin; null for non-track plugins */
  track: GovernanceTrack | null;
  /**
   * Human readable key like PROP-0, PROP-1, etc.
   */
  key: string;
  title: string;
  description: string;
  status: GovernanceStatus;
  type: GovernanceProposalType;
  /** Address of the proposal creator */
  proposer: string;
  /** ISO timestamp when proposal was created */
  createdAt: string;
  /** ISO timestamp when proposal starts (voting opens) */
  startDate: string;
  /** ISO timestamp when proposal ends (voting closes) */
  endDate: string;
  /** ISO timestamp when proposal was executed, if applicable */
  executedAt?: string | null;
  /** Number of approvals received */
  approvals: number;
  /** Minimum approvals required for execution */
  minApprovals: number;
  /** Whether approval threshold has been reached */
  approvalReached: boolean;
  /** Actions to be executed if proposal passes */
  actions: Array<ProposalAction>;
  /**
   * Optional human friendly time label (e.g. \"7 days left\", \"5 hours ago\").
   * Computed from dates for UI display.
   */
  timeLabel?: string | null;
  /** Voting tally (yes/no/abstain counts) */
  tally?: ProposalTally;
  /** Voting configuration and thresholds */
  votingSettings?: VotingSettings;
  /** Total voting power at proposal snapshot */
  totalVotingPower?: string;
  /** Current user's vote (if any) */
  userVote?: UserVote;
}

export interface GovernanceProposalFilter {
  status?: GovernanceStatus | 'ALL';
}

export const GOVERNANCE_STATUS_LABELS: Record<GovernanceStatus, string> = {
  ACTIVE: 'Active',
  EXECUTED: 'Executed',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
  SUCCEEDED: 'Succeeded',
};

/**
 * Derive governance status from Aragon Multisig proposal data
 */
export function deriveProposalStatus(proposal: {
  executed: boolean;
  approvalReached: boolean;
  startDate: string;
  endDate: string;
}): GovernanceStatus {
  const now = Date.now();
  const startTime = parseInt(proposal.startDate, 10) * 1000;
  const endTime = parseInt(proposal.endDate, 10) * 1000;

  if (proposal.executed) {
    return 'EXECUTED';
  }

  if (now < startTime) {
    return 'PENDING';
  }

  if (now > endTime) {
    return proposal.approvalReached ? 'SUCCEEDED' : 'REJECTED';
  }

  return 'ACTIVE';
}

/**
 * Generate human-friendly time label for proposal
 */
export function generateTimeLabel(proposal: {
  status: GovernanceStatus;
  startDate: string;
  endDate: string;
  executedAt?: string | null;
}): string {
  const now = Date.now();
  const startTime = parseInt(proposal.startDate, 10) * 1000;
  const endTime = parseInt(proposal.endDate, 10) * 1000;

  if (proposal.status === 'EXECUTED' && proposal.executedAt) {
    return formatRelativeTime(parseInt(proposal.executedAt, 10) * 1000);
  }

  if (proposal.status === 'PENDING') {
    return `Starts ${formatRelativeTime(startTime)}`;
  }

  if (proposal.status === 'ACTIVE') {
    return `${formatTimeRemaining(endTime - now)} left`;
  }

  if (proposal.status === 'REJECTED' || proposal.status === 'SUCCEEDED') {
    return `Ended ${formatRelativeTime(endTime)}`;
  }

  return '';
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const absDiff = Math.abs(diff);
  const isPast = diff > 0;

  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    const label = days === 1 ? 'day' : 'days';
    return isPast ? `${days} ${label} ago` : `in ${days} ${label}`;
  }

  if (hours > 0) {
    const label = hours === 1 ? 'hour' : 'hours';
    return isPast ? `${hours} ${label} ago` : `in ${hours} ${label}`;
  }

  if (minutes > 0) {
    const label = minutes === 1 ? 'minute' : 'minutes';
    return isPast ? `${minutes} ${label} ago` : `in ${minutes} ${label}`;
  }

  return isPast ? 'just now' : 'soon';
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) {
    return '0 minutes';
  }

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}


