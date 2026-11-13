/**
 * Voting API Service
 *
 * Contract interactions for voting on PEPPER MainDao proposals.
 * Each voting track is its own TokenVoting plugin, so every call
 * needs the plugin address the proposal lives on.
 *
 * Uses ethers.js for signing (via the Reown AppKit provider) and viem
 * for reads.
 */

import { BrowserProvider, Contract } from 'ethers';
import { createPublicClient, http, type Address } from 'viem';

import { TOKEN_VOTING_ABI, VOTING_TOKEN_ABI } from '@/config/aragon-abis';
import { PEPPER_DAO_GOVERNANCE_CONFIG } from '@/config/aragon-governance';
import { chiliz } from '@/config/chains';
import type { VoteOption } from '@/types/governance';

/**
 * EIP-1193 compatible provider interface
 */
interface Eip1193Provider {
  request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

/**
 * Voting transaction result
 */
export interface VotingTransactionResult {
  status: 'success' | 'error';
  txHash?: string;
  error?: string;
}

/**
 * Proposal on a specific track plugin.
 * proposalId is the 256-bit on-chain id; keep it as bigint (never Number).
 */
export interface VotingTarget {
  pluginAddress: Address;
  proposalId: bigint;
}

/**
 * Vote option mapping to IMajorityVoting.VoteOption
 */
const VOTE_OPTION_MAP: Record<VoteOption, number> = {
  NONE: 0,
  ABSTAIN: 1,
  YES: 2,
  NO: 3,
};

const VOTE_OPTION_BY_VALUE: Record<number, VoteOption> = {
  0: 'NONE',
  1: 'ABSTAIN',
  2: 'YES',
  3: 'NO',
};

/**
 * Public client for read-only operations
 */
const publicClient = createPublicClient({
  chain: chiliz,
  transport: http(),
});

/**
 * Get a user's voting power for a proposal: their vePEPPER at the
 * proposal's snapshot timestamp (the amount a vote would carry).
 */
export async function getVotingPower(
  userAddress: string,
  target: VotingTarget,
): Promise<bigint> {
  try {
    const proposal = await publicClient.readContract({
      address: target.pluginAddress,
      abi: TOKEN_VOTING_ABI,
      functionName: 'getProposal',
      args: [target.proposalId],
    });

    const snapshotTimepoint = proposal[2].snapshotTimepoint;

    return await publicClient.readContract({
      address: PEPPER_DAO_GOVERNANCE_CONFIG.votingToken,
      abi: VOTING_TOKEN_ABI,
      functionName: 'getPastVotes',
      args: [userAddress as Address, snapshotTimepoint],
    });
  } catch (error) {
    console.error('[VotingAPI] Failed to get voting power:', error);
    throw new Error('Unable to check voting power. Please try again.');
  }
}

/**
 * Get the option a user already voted (NONE if they have not voted)
 */
export async function getUserVoteOption(
  userAddress: string,
  target: VotingTarget,
): Promise<VoteOption> {
  try {
    const option = await publicClient.readContract({
      address: target.pluginAddress,
      abi: TOKEN_VOTING_ABI,
      functionName: 'getVoteOption',
      args: [target.proposalId, userAddress as Address],
    });

    return VOTE_OPTION_BY_VALUE[Number(option)] ?? 'NONE';
  } catch (error) {
    console.error('[VotingAPI] Failed to get vote option:', error);
    throw new Error('Unable to check your vote. Please try again.');
  }
}

/**
 * Check if a user can vote on a proposal with the given option
 */
export async function canVote(
  userAddress: string,
  target: VotingTarget,
  voteOption: VoteOption,
): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: target.pluginAddress,
      abi: TOKEN_VOTING_ABI,
      functionName: 'canVote',
      args: [target.proposalId, userAddress as Address, VOTE_OPTION_MAP[voteOption]],
    });
  } catch (error) {
    console.warn('[VotingAPI] Failed to check if can vote:', error);
    throw new Error('Unable to verify voting eligibility. Please try again.');
  }
}

/**
 * Submit a vote on a governance proposal
 * @param walletProvider - EIP-1193 provider from Reown AppKit
 * @param target - Track plugin and on-chain proposal ID
 * @param voteOption - Vote option (YES, NO, ABSTAIN)
 */
export async function submitVote(
  walletProvider: Eip1193Provider,
  target: VotingTarget,
  voteOption: VoteOption,
): Promise<VotingTransactionResult> {
  try {
    const provider = new BrowserProvider(walletProvider);
    const signer = await provider.getSigner();

    const tokenVotingContract = new Contract(target.pluginAddress, TOKEN_VOTING_ABI, signer);

    const voteOptionValue = VOTE_OPTION_MAP[voteOption];

    console.log('[VotingAPI] Submitting vote:', {
      pluginAddress: target.pluginAddress,
      proposalId: target.proposalId.toString(),
      voteOption,
    });

    // vote(uint256 _proposalId, uint8 _voteOption, bool _tryEarlyExecution)
    // Early execution stays off: execution is a separate, deliberate step
    // and keeps the vote's gas predictable.
    const tx = await tokenVotingContract.vote(target.proposalId, voteOptionValue, false);

    console.log('[VotingAPI] Vote tx submitted:', tx.hash);

    const receipt = await tx.wait();
    const txHash = receipt?.hash ?? tx.hash;

    console.log('[VotingAPI] Vote confirmed:', txHash);

    return {
      status: 'success',
      txHash,
    };
  } catch (error) {
    console.error('[VotingAPI] Vote failed:', error);
    return {
      status: 'error',
      error: parseVotingError(error),
    };
  }
}

/**
 * Parse voting errors to user-friendly messages
 */
export function parseVotingError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // User rejected transaction
  if (
    errorMessage.includes('user rejected') ||
    errorMessage.includes('User rejected') ||
    errorMessage.includes('ACTION_REJECTED')
  ) {
    return 'Transaction was cancelled';
  }

  // Proposal not active
  if (
    errorMessage.includes('ProposalExecutionForbidden') ||
    errorMessage.includes('NonexistentProposal') ||
    errorMessage.includes('not active')
  ) {
    return 'This proposal is no longer accepting votes';
  }

  // Vote rejected by the plugin (already voted without vote replacement, closed, or no power)
  if (errorMessage.includes('VoteCastForbidden')) {
    return 'You cannot vote on this proposal: you may have already voted or have no vePEPPER at its snapshot';
  }

  // No voting power
  if (
    errorMessage.includes('NoVotingPower') ||
    errorMessage.includes('insufficient voting power') ||
    errorMessage.includes('no voting power')
  ) {
    return 'You do not have voting power for this proposal';
  }

  // Insufficient funds for gas
  if (
    errorMessage.includes('insufficient funds') ||
    errorMessage.includes('INSUFFICIENT_FUNDS')
  ) {
    return 'Insufficient CHZ for transaction fee';
  }

  // Network error
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('NETWORK_ERROR')
  ) {
    return 'Network error. Please check your connection';
  }

  // Generic error
  return 'Vote failed. Please try again';
}
