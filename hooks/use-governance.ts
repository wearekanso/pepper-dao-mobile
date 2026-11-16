import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useWallet } from '@/contexts/wallet-context';
import {
    fetchGovernanceProposalById,
    fetchGovernanceProposals,
} from '@/services/governance-api';
import { applyUserVotes, readUserVotes } from '@/services/voting-api';
import type {
    GovernanceProposal,
    GovernanceProposalFilter,
    VoteOption,
} from '@/types/governance';

const GOVERNANCE_PROPOSALS_QUERY_KEY = ['governance', 'proposals'] as const;
/** Invalidate after a vote so the wallet's votes are read again */
export const USER_VOTES_QUERY_KEY = ['governance', 'user-votes'] as const;

interface UseGovernanceProposalsOptions extends GovernanceProposalFilter {
  enabled?: boolean;
  first?: number;
  skip?: number;
}

/**
 * Proposals from Supabase, with the connected wallet's vote read on-chain.
 * The votes are a separate query: the list shows as soon as Supabase
 * answers, and connecting or switching wallets only reads the votes again.
 */
export function useGovernanceProposals(
  options?: UseGovernanceProposalsOptions,
): UseQueryResult<Array<GovernanceProposal>> {
  const { status, enabled = true, first, skip } = options ?? {};

  const query = useQuery<Array<GovernanceProposal>>({
    queryKey: [...GOVERNANCE_PROPOSALS_QUERY_KEY, status ?? 'ALL', first, skip],
    queryFn: () => fetchGovernanceProposals({ status }, { first, skip }),
    enabled,
    staleTime: 30_000, // 30 seconds - per documentation
    gcTime: 300_000, // 5 minutes cache retention
  });

  return useWithUserVotes(query, query.data);
}

interface UseGovernanceProposalOptions {
  proposalId: string | undefined;
  enabled?: boolean;
}

export function useGovernanceProposal(
  options: UseGovernanceProposalOptions,
): UseQueryResult<GovernanceProposal | null> {
  const { proposalId, enabled = true } = options;

  const query = useQuery<GovernanceProposal | null>({
    queryKey: ['governance', 'proposal', proposalId],
    queryFn: () => (proposalId ? fetchGovernanceProposalById(proposalId) : Promise.resolve(null)),
    enabled: enabled && Boolean(proposalId),
    staleTime: 60_000, // 1 minute - per documentation
    gcTime: 300_000, // 5 minutes cache retention
  });

  const proposals = useMemo(() => (query.data ? [query.data] : undefined), [query.data]);
  const withVotes = useWithUserVotes(query, proposals);
  const data = query.data ? (withVotes.data?.[0] ?? query.data) : query.data;
  return { ...withVotes, data } as unknown as UseQueryResult<GovernanceProposal | null>;
}

/**
 * Adds the wallet's votes to a proposals query once they are read. Until
 * then (or if the RPC fails) the proposals show without them. Refetching
 * refreshes both the proposals and the votes.
 */
function useWithUserVotes<TData>(
  query: UseQueryResult<TData>,
  proposals: Array<GovernanceProposal> | undefined,
): UseQueryResult<Array<GovernanceProposal>> {
  const voter = useVoterAddress();
  const proposalIds = useMemo(() => proposals?.map((proposal) => proposal.id) ?? [], [proposals]);

  const votesQuery = useQuery<Record<string, VoteOption>>({
    queryKey: [...USER_VOTES_QUERY_KEY, voter, proposalIds],
    queryFn: () => readUserVotes(proposals ?? [], voter as string),
    enabled: Boolean(voter) && proposalIds.length > 0,
    staleTime: 30_000,
    gcTime: 300_000,
  });

  const data = useMemo(() => {
    if (!proposals || !voter || !votesQuery.data) return proposals;
    return applyUserVotes(proposals, votesQuery.data, voter);
  }, [proposals, voter, votesQuery.data]);

  const { refetch: refetchProposals } = query;
  const { refetch: refetchVotes } = votesQuery;
  const refetch = useCallback(
    async (...args: Parameters<typeof refetchProposals>) => {
      const [result] = await Promise.all([refetchProposals(...args), voter ? refetchVotes() : null]);
      return result;
    },
    [refetchProposals, refetchVotes, voter],
  );

  return { ...query, data, refetch } as unknown as UseQueryResult<Array<GovernanceProposal>>;
}

function useVoterAddress(): string | null {
  const { address, isConnected } = useWallet();
  return isConnected && address ? address.toLowerCase() : null;
}
