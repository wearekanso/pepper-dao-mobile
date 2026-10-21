import { getVoteDistribution } from '@/lib/voting-calculations';
import { deriveVotingTrack, VOTING_TRACK_DURATION_LABELS, type VotingTrack } from '@/lib/voting-tracks';
import { PEPPER_TOKEN_ADDRESS } from '@/config/pepper-token';
import type { GovernanceProposal, GovernanceStatus, ProposalAction, VoteOption } from '@/types/governance';

import { THERMAL_COLORS } from '../theme';
import { formatCompact, parseDateMs, shortenAddress, tokenToNumber } from './format';
import type { StatusKind } from '../components/atoms';
import type { VoteSplit } from '../components/pixel-bar';

export interface StatusStyle {
  label: string;
  color: string;
  textColor: string;
}

export const STATUS_STYLES: Record<GovernanceStatus, StatusStyle> = {
  ACTIVE: { label: 'ACTIVE', color: THERMAL_COLORS.orange, textColor: THERMAL_COLORS.void },
  PENDING: { label: 'PENDING', color: THERMAL_COLORS.violet, textColor: THERMAL_COLORS.white },
  SUCCEEDED: { label: 'PASSED', color: THERMAL_COLORS.gold, textColor: THERMAL_COLORS.void },
  EXECUTED: { label: 'EXECUTED', color: THERMAL_COLORS.cream, textColor: THERMAL_COLORS.void },
  REJECTED: { label: 'REJECTED', color: THERMAL_COLORS.blue, textColor: THERMAL_COLORS.white },
};

/**
 * Some on-chain proposals carry raw bytes as metadata; show a readable
 * fallback instead of mojibake.
 */
export function getProposalTitle(proposal: GovernanceProposal): string {
  const title = proposal.title?.trim() ?? '';
  if (title && !/[\uFFFD\u0000-\u0008\u000E-\u001F]/.test(title)) return title;

  const kind = proposal.type === 'MULTISIG' ? 'Multisig' : proposal.type === 'ADMIN' ? 'Admin' : 'Community';
  const actions = proposal.actions.length;
  return `${kind} proposal with ${actions} action${actions === 1 ? '' : 's'}`;
}

export function getProposalDescription(proposal: GovernanceProposal): string {
  const description = proposal.description?.trim() ?? '';
  return /[\uFFFD\u0000-\u0008\u000E-\u001F]/.test(description) ? '' : description;
}

export function isLiveProposal(proposal: GovernanceProposal): boolean {
  return proposal.status === 'ACTIVE' || proposal.status === 'PENDING';
}

/**
 * V2 status tag per proposal status (stroke + text, see STATUS_COLORS).
 * Live proposals show the LIVE marker instead of a tag.
 */
export const STATUS_TAGS: Record<GovernanceStatus, { label: string; kind: StatusKind }> = {
  ACTIVE: { label: 'LIVE', kind: 'live' },
  PENDING: { label: 'UPCOMING', kind: 'upcoming' },
  SUCCEEDED: { label: 'PASSED', kind: 'positive' },
  EXECUTED: { label: 'EXECUTED', kind: 'positive' },
  REJECTED: { label: 'REJECTED', kind: 'negative' },
};

/** Who votes + its number: "COMMUNITY VOTE · #1", "COUNCIL · #2", "COUNCIL · MULTISIG" */
export function getProposalLabel(proposal: GovernanceProposal): string {
  const index = /^[A-Z]+-(\d{1,6})$/.exec(proposal.key)?.[1];
  return `${PROPOSAL_KIND[proposal.type]} · ${index !== undefined ? `#${index}` : proposal.type}`;
}

/** The connected wallet's recorded vote, if any */
export function getUserVote(proposal: GovernanceProposal): Exclude<VoteOption, 'NONE'> | null {
  const option = proposal.userVote?.voteOption;
  if (!option || option === 'NONE') return null;
  return option;
}

export function getVoteSplit(proposal: GovernanceProposal): VoteSplit {
  if (!proposal.tally) return { yes: 0, no: 0, abstain: 0 };
  return getVoteDistribution(proposal.tally);
}

export function formatVoteSummary(split: VoteSplit): string {
  if (split.yes + split.no + split.abstain === 0) return 'NO VOTES YET';
  return `${Math.round(split.yes)}% YES · ${Math.round(split.no)}% NO · ${Math.round(split.abstain)}% ABSTAIN`;
}

const PROPOSAL_KIND: Record<GovernanceProposal['type'], string> = {
  PEP: 'COMMUNITY VOTE',
  MULTISIG: 'COUNCIL',
  ADMIN: 'COUNCIL',
  OTHER: 'PROPOSAL',
};

const TRACK_SHORT: Record<VotingTrack, string> = {
  STANDARD: 'STANDARD · 7D',
  AGILE: 'AGILE · 3D',
  FAST: 'FAST · 48H',
  CUSTOM: 'CUSTOM',
};

function getTrack(proposal: GovernanceProposal): VotingTrack {
  const toSeconds = (value: string) => String(Math.floor(parseDateMs(value) / 1000));
  return deriveVotingTrack(toSeconds(proposal.startDate), toSeconds(proposal.endDate));
}

export function getTrackShort(proposal: GovernanceProposal): string {
  return TRACK_SHORT[getTrack(proposal)];
}

/** "AGILE · 3 DAYS" */
export function getTrackLabel(proposal: GovernanceProposal): string {
  const track = getTrack(proposal);
  if (track === 'CUSTOM') return 'CUSTOM';
  return `${track} · ${VOTING_TRACK_DURATION_LABELS[track].toUpperCase()}`;
}

export function getTrackLong(proposal: GovernanceProposal): string {
  const track = getTrack(proposal);
  if (track === 'CUSTOM') return 'CUSTOM TRACK';
  return `${track} TRACK · ${VOTING_TRACK_DURATION_LABELS[track].toUpperCase()}`;
}

export type StageState = 'done' | 'live' | 'waiting' | 'failed';

export interface ProposalStage {
  label: string;
  /** Compact form for one-line stage strips: "MINISTERS 3/3", "VOTE · LIVE", "EXECUTE" */
  short: string;
  /** Sentence form for the STEPS card: "Ministers approved · 3/3" */
  sentence: string;
  detail: string;
  state: StageState;
}

/**
 * PEP proposals run: 1) Spicy Ministers multisig → 2) Community vote → 3) Execution.
 * Admin / multisig proposals collapse into approval → execution.
 */
export function getProposalStages(proposal: GovernanceProposal): Array<ProposalStage> {
  const approvals = proposal.approvals ?? 0;
  const minApprovals = proposal.minApprovals ?? 0;
  const ministersPassed = approvals >= minApprovals;
  const isExecuted = proposal.status === 'EXECUTED';
  const isRejected = proposal.status === 'REJECTED';

  if (proposal.type === 'ADMIN') {
    return [
      { label: 'ADMIN ACTION', short: 'ADMIN', sentence: 'Admin action · auto-approved', detail: 'AUTO-APPROVED', state: 'done' },
      {
        label: 'EXECUTION ON-CHAIN',
        short: 'EXECUTE',
        sentence: isExecuted ? 'Executed on-chain' : 'Execution on-chain · queued',
        detail: isExecuted ? 'DONE' : 'QUEUED',
        state: isExecuted ? 'done' : 'live',
      },
    ];
  }

  const ministersState: StageState = ministersPassed ? 'done' : isRejected ? 'failed' : 'live';
  const ministers: ProposalStage = {
    label: 'SPICY MINISTERS',
    short: `MINISTERS ${approvals}/${minApprovals}`,
    sentence: `${proposal.type === 'PEP' ? 'Ministers' : 'Council'} ${MINISTER_VERB[ministersState]} · ${approvals}/${minApprovals}`,
    detail: `${approvals}/${minApprovals} APPROVED`,
    state: ministersState,
  };

  if (proposal.type !== 'PEP') {
    return [
      ministers,
      { label: 'EXECUTION ON-CHAIN', short: 'EXECUTE', sentence: EXECUTION_SENTENCE[String(isExecuted)], detail: isExecuted ? 'DONE' : '', state: isExecuted ? 'done' : 'waiting' },
    ];
  }

  let communityState: StageState = 'waiting';
  if (ministersPassed) {
    if (isExecuted || proposal.status === 'SUCCEEDED') communityState = 'done';
    else if (isRejected) communityState = 'failed';
    else if (proposal.status === 'ACTIVE') communityState = 'live';
  }

  return [
    ministers,
    {
      label: 'COMMUNITY VOTE',
      short: communityState === 'live' ? 'VOTE · LIVE' : 'VOTE',
      sentence: COMMUNITY_SENTENCE[communityState],
      detail: communityState === 'live' ? 'LIVE' : communityState === 'done' ? 'PASSED' : communityState === 'failed' ? 'FAILED' : '',
      state: communityState,
    },
    { label: 'EXECUTION ON-CHAIN', short: 'EXECUTE', sentence: EXECUTION_SENTENCE[String(isExecuted)], detail: isExecuted ? 'DONE' : '', state: isExecuted ? 'done' : 'waiting' },
  ];
}

const MINISTER_VERB: Record<StageState, string> = {
  done: 'approved',
  live: 'reviewing',
  waiting: 'reviewing',
  failed: 'rejected',
};

const COMMUNITY_SENTENCE: Record<StageState, string> = {
  done: 'Community vote · passed',
  live: 'Community vote · live',
  waiting: 'Community vote',
  failed: 'Community vote · failed',
};

const EXECUTION_SENTENCE: Record<string, string> = {
  true: 'Executed on-chain',
  false: 'Execution on-chain',
};

export interface ActionSummary {
  title: string;
  detail: string;
}

/**
 * Human line for an on-chain action. Decodes plain ERC-20 transfers of
 * PEPPER; anything else falls back to "Send N CHZ" / "Contract call".
 */
export function getActionSummary(action: ProposalAction): ActionSummary {
  const data = action.data?.toLowerCase() ?? '';
  if (action.to.toLowerCase() === PEPPER_TOKEN_ADDRESS.toLowerCase() && data.startsWith(ERC20_TRANSFER) && data.length >= 138) {
    const recipient = `0x${data.slice(34, 74)}`;
    const amount = BigInt(`0x${data.slice(74, 138)}`);
    // Proposal actions run from the DAO, so the tokens leave the treasury (Figma: "from Treasury → 0xab12…cd34")
    return { title: `Transfer ${formatCompact(tokenToNumber(amount, 18))} PEPPER`, detail: `from Treasury → ${shortenAddress(recipient)}` };
  }

  const value = BigInt(action.value || '0');
  if (value > BigInt(0)) {
    return { title: `Send ${formatCompact(tokenToNumber(value, 18))} CHZ`, detail: `from Treasury → ${shortenAddress(action.to)}` };
  }
  return { title: 'Contract call', detail: `on ${shortenAddress(action.to)}` };
}

/** ERC-20 transfer(address,uint256) selector */
const ERC20_TRANSFER = '0xa9059cbb';

/** One-line reason under ended proposals, e.g. "Not enough minister approvals · 1/3" */
export function getEndedNote(proposal: GovernanceProposal): string | null {
  if (proposal.status !== 'REJECTED') return null;

  const approvals = proposal.approvals ?? 0;
  const minApprovals = proposal.minApprovals ?? 0;
  if (approvals < minApprovals) {
    const approvers = proposal.type === 'PEP' ? 'minister' : 'council';
    return `Not enough ${approvers} approvals · ${approvals}/${minApprovals}`;
  }
  return 'Community vote did not pass';
}

export const STAGE_COLORS: Record<StageState, string> = {
  done: THERMAL_COLORS.cream,
  live: THERMAL_COLORS.white,
  waiting: 'rgba(255,255,255,0.25)',
  failed: THERMAL_COLORS.red,
};
