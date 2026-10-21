import { PEPPER_TOKEN_ADDRESS } from '@/config/pepper-token';
import type { GovernanceProposal } from '@/types/governance';

/**
 * Demo vote — dev-only sandbox for walking through the voting flow without
 * a wallet or PEPPER. Opens a fake ACTIVE proposal and fakes the signature,
 * so the vote sheet, VOTED stamp and rep sticker can be seen end to end.
 */
export const DEMO_VOTE_ENABLED = __DEV__;

export const DEMO_PROPOSAL_ID = 'demo';

export const DEMO_VOTING_POWER = '12,500';

const DEMO_SIGN_DELAY_MS = 1400;

export function isDemoProposalId(proposalId: string | undefined): boolean {
  return DEMO_VOTE_ENABLED && proposalId === DEMO_PROPOSAL_ID;
}

export function createDemoProposal(): GovernanceProposal {
  const now = Date.now();
  return {
    id: DEMO_PROPOSAL_ID,
    pluginProposalId: DEMO_PROPOSAL_ID,
    key: 'PEP-DEMO',
    title: 'Test vote: fund a PEPPER meme contest',
    description:
      'Demo proposal for testing the voting flow. Nothing here touches the chain — picking an option fakes the wallet signature and shows the confirmation screen.',
    status: 'ACTIVE',
    type: 'PEP',
    proposer: '0x000000000000000000000000000000000000dEaD',
    createdAt: new Date(now - 2 * DAY_MS).toISOString(),
    startDate: new Date(now - 2 * DAY_MS).toISOString(),
    endDate: new Date(now + 3 * DAY_MS).toISOString(),
    approvals: 0,
    minApprovals: 0,
    approvalReached: false,
    // Same transfer as the Figma Detail frame: 175T PEPPER to a rewards address
    actions: [
      {
        to: PEPPER_TOKEN_ADDRESS,
        value: '0',
        data: `0xa9059cbb${DEMO_RECIPIENT.slice(2).padStart(64, '0')}${(BigInt(175_000_000_000_000) * WEI).toString(16).padStart(64, '0')}`,
      },
    ],
    tally: {
      yes: (BigInt(4_200_000) * WEI).toString(),
      no: (BigInt(1_300_000) * WEI).toString(),
      abstain: (BigInt(500_000) * WEI).toString(),
    },
    votingSettings: {
      supportThreshold: 500_000,
      minParticipation: 150_000,
      minDuration: 5 * DAY_MS / 1000,
      minProposerVotingPower: '0',
    },
    totalVotingPower: (BigInt(20_000_000) * WEI).toString(),
  };
}

/**
 * `pepperdao://governance/demo?fail=gas` (or `cancel`) makes the test vote fail
 * with that wallet error, to see the NOT RECORDED state.
 */
export const DEMO_FAILURES: Record<string, string> = {
  gas: 'insufficient funds for gas * price + value',
  cancel: 'User rejected the request.',
};

/** CHZ the demo wallet holds when it fails for gas */
export const DEMO_LOW_CHZ = 0.02;

export async function castDemoVote(
  failure?: string,
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  await new Promise((resolve) => setTimeout(resolve, DEMO_SIGN_DELAY_MS));
  if (failure) return { success: false, error: failure };
  const hex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return { success: true, txHash: `0x${hex}` };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_RECIPIENT = '0xab1200000000000000000000000000000000cd34';
const WEI = BigInt(10) ** BigInt(18);
