import { useQuery } from '@tanstack/react-query';

import type { GovernanceTrack } from '@/config/aragon-governance';
import { useWallet } from '@/contexts/wallet-context';
import { checkProposerEligibility, DEFAULT_PROPOSAL_TRACK } from '@/services/proposal-api';
import type { ProposerEligibility } from '@/types/proposal-form';

/**
 * Hook to check if the current user is eligible to create proposals on a track
 *
 * Queries the track's Token Voting plugin to:
 * 1. Get minProposerVotingPower threshold (differs per track)
 * 2. Get user's current voting power (vePEPPER)
 * 3. Compare to determine eligibility
 */
export function useProposerEligibility(track: GovernanceTrack = DEFAULT_PROPOSAL_TRACK) {
  const { address, isConnected } = useWallet();

  return useQuery<ProposerEligibility>({
    queryKey: ['proposer-eligibility', address, track],
    queryFn: async () => {
      if (!address) {
        return {
          minRequired: BigInt(0),
          userPower: BigInt(0),
          isEligible: false,
        };
      }
      return checkProposerEligibility(address, track);
    },
    enabled: isConnected && !!address,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}
