import { useQuery } from '@tanstack/react-query';

import {
    fetchGovernanceProposalById,
    fetchGovernanceProposals,
} from '@/services/governance-api';
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

export function useGovernanceProposals(options?: UseGovernanceProposalsOptions) {
  const { status, enabled = true, first, skip } = options ?? {};

  return useQuery<Array<GovernanceProposal>>({
    queryKey: [...GOVERNANCE_PROPOSALS_QUERY_KEY, status ?? 'ALL', first, skip],
    queryFn: () => fetchGovernanceProposals({ status }, { first, skip }),
    enabled,
    staleTime: 30_000, // 30 seconds - per documentation
    gcTime: 300_000, // 5 minutes cache retention
  });
}

interface UseGovernanceProposalOptions {
  proposalId: string | undefined;
  enabled?: boolean;
  /**
   * Refetch every few seconds while the proposal isn't in Supabase yet
   * (just created, waiting for the indexer)
   */
  pollWhileMissing?: boolean;
}

export function useGovernanceProposal(options: UseGovernanceProposalOptions) {
  const { proposalId, enabled = true, pollWhileMissing = false } = options;

  return useQuery<GovernanceProposal | null>({
    queryKey: ['governance', 'proposal', proposalId],
    queryFn: () => {
      if (!proposalId) {
        return Promise.resolve(null);
      }
      return fetchGovernanceProposalById(proposalId);
    },
    enabled: enabled && Boolean(proposalId),
    staleTime: 60_000, // 1 minute - per documentation
    gcTime: 300_000, // 5 minutes cache retention
    refetchInterval: (query) => (pollWhileMissing && query.state.data === null ? MISSING_POLL_MS : false),
  });
}

const MISSING_POLL_MS = 5_000;


