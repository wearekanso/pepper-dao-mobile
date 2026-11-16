import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/contexts/wallet-context';
import {
    fetchGovernanceProposalById,
    fetchGovernanceProposals,
} from '@/services/governance-api';
import { attachUserVotes } from '@/services/voting-api';
import type {
    GovernanceProposal,
    GovernanceProposalFilter,
} from '@/types/governance';

const GOVERNANCE_PROPOSALS_QUERY_KEY = ['governance', 'proposals'] as const;

interface UseGovernanceProposalsOptions extends GovernanceProposalFilter {
  enabled?: boolean;
  first?: number;
  skip?: number;
}

/**
 * Proposals from Supabase, with the connected wallet's vote read on-chain.
 * The address is part of the query key, so switching wallets refetches.
 */
export function useGovernanceProposals(options?: UseGovernanceProposalsOptions) {
  const { status, enabled = true, first, skip } = options ?? {};
  const voter = useVoterAddress();

  return useQuery<Array<GovernanceProposal>>({
    queryKey: [...GOVERNANCE_PROPOSALS_QUERY_KEY, status ?? 'ALL', first, skip, voter],
    queryFn: async () => {
      const proposals = await fetchGovernanceProposals({ status }, { first, skip });
      return voter ? attachUserVotes(proposals, voter) : proposals;
    },
    enabled,
    staleTime: 30_000, // 30 seconds - per documentation
    gcTime: 300_000, // 5 minutes cache retention
  });
}

interface UseGovernanceProposalOptions {
  proposalId: string | undefined;
  enabled?: boolean;
}

export function useGovernanceProposal(options: UseGovernanceProposalOptions) {
  const { proposalId, enabled = true } = options;
  const voter = useVoterAddress();

  return useQuery<GovernanceProposal | null>({
    queryKey: ['governance', 'proposal', proposalId, voter],
    queryFn: async () => {
      if (!proposalId) {
        return null;
      }
      const proposal = await fetchGovernanceProposalById(proposalId);
      if (!proposal || !voter) {
        return proposal;
      }
      const [withVote] = await attachUserVotes([proposal], voter);
      return withVote;
    },
    enabled: enabled && Boolean(proposalId),
    staleTime: 60_000, // 1 minute - per documentation
    gcTime: 300_000, // 5 minutes cache retention
  });
}

function useVoterAddress(): string | null {
  const { address, isConnected } = useWallet();
  return isConnected && address ? address.toLowerCase() : null;
}
