/**
 * Proposal API Service
 *
 * Creates proposals on the PEPPER MainDao. Each voting track is its own
 * TokenVoting plugin, so the track decides which contract is called and
 * which minimum proposer power applies.
 * Uses ethers.js for contract calls and integrates with Reown AppKit
 * for wallet provider access.
 */

import { BrowserProvider, Contract, hexlify, toUtf8Bytes, Interface } from 'ethers';
import { createPublicClient, http } from 'viem';

import { TOKEN_VOTING_ABI, VOTING_TOKEN_ABI } from '@/config/aragon-abis';
import { PEPPER_DAO_GOVERNANCE_CONFIG, type GovernanceTrack } from '@/config/aragon-governance';
import { ACTIVE_CHAIN } from '@/config/chains';
import type { CreateProposalParams, CreateProposalResult, ProposerEligibility } from '@/types/proposal-form';

/** Track used when the caller does not pick one */
export const DEFAULT_PROPOSAL_TRACK: GovernanceTrack = 'STANDARD';

/**
 * createProposal is overloaded on TokenVoting 1.4, so ethers needs the full
 * signature. This one takes the vote option + early-execution flags.
 */
const CREATE_PROPOSAL_SIGNATURE =
  'createProposal(bytes,(address,uint256,bytes)[],uint256,uint64,uint64,uint8,bool)';

/**
 * EIP-1193 compatible provider interface
 * Works with both ethers Eip1193Provider and AppKit's Provider
 */
interface Eip1193Provider {
  request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

/**
 * Public client for read-only operations
 */
const publicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: http(),
});

/**
 * Create ethers provider and signer from Reown wallet provider
 */
async function getProviderAndSigner(walletProvider: Eip1193Provider) {
  const provider = new BrowserProvider(walletProvider);
  const signer = await provider.getSigner();
  return { provider, signer };
}

/**
 * Parse proposal creation errors into user-friendly messages
 */
function parseProposalError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('user rejected') || message.includes('user denied')) {
      return 'Transaction was rejected by user';
    }

    if (message.includes('insufficient funds')) {
      return 'Insufficient CHZ for gas fees';
    }

    // TokenVoting 1.4 gates CREATE_PROPOSAL_PERMISSION behind a voting-power
    // condition, so a proposer below minProposerVotingPower gets DaoUnauthorized
    if (message.includes('proposer voting power') || message.includes('daounauthorized')) {
      return 'Insufficient vePEPPER to create proposals on this track';
    }

    return error.message;
  }

  return 'Failed to create proposal';
}

/**
 * Build metadata JSON for on-chain storage
 */
function buildProposalMetadata(params: CreateProposalParams): string {
  const description = [params.summary, params.body].filter(Boolean).join('\n\n');

  const metadata: Record<string, unknown> = {
    title: params.title,
  };

  if (description) {
    metadata.description = description;
  }

  if (params.resources && params.resources.length > 0) {
    metadata.resources = params.resources;
  }

  return JSON.stringify(metadata);
}

/**
 * Fetch minimum proposer voting power for a track's plugin
 */
export async function getMinProposerVotingPower(
  track: GovernanceTrack = DEFAULT_PROPOSAL_TRACK,
): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: PEPPER_DAO_GOVERNANCE_CONFIG.trackPlugins[track],
      abi: TOKEN_VOTING_ABI,
      functionName: 'minProposerVotingPower',
    });
  } catch (error) {
    console.error('[ProposalAPI] Failed to fetch minProposerVotingPower:', error);
    throw new Error('Unable to check proposer requirements. Please try again.');
  }
}

/**
 * Fetch user's current vePEPPER voting power.
 * TokenVoting lets someone propose when either their votes or their
 * balance on the voting token clears the threshold, so take the larger.
 */
export async function getUserVotingPower(userAddress: string): Promise<bigint> {
  try {
    const account = userAddress as `0x${string}`;
    const [votes, balance] = await Promise.all([
      publicClient.readContract({
        address: PEPPER_DAO_GOVERNANCE_CONFIG.votingToken,
        abi: VOTING_TOKEN_ABI,
        functionName: 'getVotes',
        args: [account],
      }),
      publicClient.readContract({
        address: PEPPER_DAO_GOVERNANCE_CONFIG.votingToken,
        abi: VOTING_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [account],
      }),
    ]);

    return votes > balance ? votes : balance;
  } catch (error) {
    console.error('[ProposalAPI] Failed to fetch user voting power:', error);
    throw new Error('Unable to fetch your voting power. Please try again.');
  }
}

/**
 * Check if user is eligible to create proposals on a track
 */
export async function checkProposerEligibility(
  userAddress: string,
  track: GovernanceTrack = DEFAULT_PROPOSAL_TRACK,
): Promise<ProposerEligibility> {
  const [minRequired, userPower] = await Promise.all([
    getMinProposerVotingPower(track),
    getUserVotingPower(userAddress),
  ]);

  return {
    minRequired,
    userPower,
    isEligible: userPower >= minRequired,
  };
}

/**
 * Create a proposal on-chain on the chosen track's TokenVoting plugin
 *
 * @param walletProvider - EIP-1193 provider from Reown AppKit
 * @param params - Proposal content (title, summary, body, resources) and track
 */
export async function createProposal(
  walletProvider: Eip1193Provider,
  params: CreateProposalParams
): Promise<CreateProposalResult> {
  try {
    const { signer } = await getProviderAndSigner(walletProvider);

    // Build metadata
    const metadataJson = buildProposalMetadata(params);
    const metadataBytes = hexlify(toUtf8Bytes(metadataJson));

    console.log('[ProposalAPI] Creating proposal:', {
      title: params.title,
      metadataLength: metadataJson.length,
    });

    const track = params.track ?? DEFAULT_PROPOSAL_TRACK;
    const pluginAddress = PEPPER_DAO_GOVERNANCE_CONFIG.trackPlugins[track];
    const contract = new Contract(pluginAddress, TOKEN_VOTING_ABI, signer);

    const tx = await contract[CREATE_PROPOSAL_SIGNATURE](
      metadataBytes, // _metadata
      [], // _actions (empty for text-only)
      0, // _allowFailureMap
      0, // _startDate (0 = now)
      0, // _endDate (0 = start + track's minDuration)
      0, // _voteOption (0 = None: creating does not cast a vote)
      false // _tryEarlyExecution
    );

    console.log('[ProposalAPI] Proposal tx submitted:', tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    const txHash = receipt?.hash ?? tx.hash;

    console.log('[ProposalAPI] Proposal confirmed:', txHash);

    // Extract proposalId from event logs
    let proposalId: string | undefined;
    try {
      const iface = new Interface(TOKEN_VOTING_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as Array<string>,
            data: log.data,
          });
          if (parsed?.name === 'ProposalCreated') {
            proposalId = parsed.args.proposalId?.toString();
            console.log('[ProposalAPI] Extracted proposalId:', proposalId);
            break;
          }
        } catch {
          // Not our event, continue
        }
      }
    } catch (error) {
      console.warn('[ProposalAPI] Failed to extract proposalId from logs:', error);
    }

    return {
      status: 'success',
      proposalId,
      pluginAddress,
      txHash,
    };
  } catch (error) {
    console.error('[ProposalAPI] Create proposal failed:', error);
    return {
      status: 'error',
      error: parseProposalError(error),
    };
  }
}
