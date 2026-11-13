import { Pressable, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import {
    basisPointsToPercentage,
    calculateCurrentSupport,
    calculateParticipation,
    getVoteDistribution,
} from '@/lib/voting-calculations';
import type { GovernanceProposal } from '@/types/governance';

import { ProposalStatusPill } from './proposal-status-pill';
import { VotingTrackBadge } from './voting-track-badge';

interface ProposalCardProps {
  proposal: GovernanceProposal;
  onPress?: () => void;
}

function shortenAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getSecondaryLabel(proposal: GovernanceProposal): string {
  if (proposal.timeLabel) {
    return proposal.timeLabel;
  }

  const date = new Date(proposal.createdAt);
  return date.toLocaleDateString();
}

interface VotingPreviewProps {
  proposal: GovernanceProposal;
}

function VotingPreview(props: VotingPreviewProps) {
  const { proposal } = props;

  // For PEP proposals, show stage-based progress
  if (proposal.type === 'PEP') {
    const currentStage = (proposal as any).currentStage ?? 0;
    const approvals = proposal.approvals || 0;
    const minApprovals = proposal.minApprovals ?? 0;
    // MainDao proposals have no ministers stage (minApprovals 0)
    const hasMinistersStage = minApprovals > 0;
    const approvalPercent = minApprovals > 0 ? (approvals / minApprovals) * 100 : 0;
    const stage1Passed = approvals >= minApprovals;
    const isRejected = proposal.status === 'REJECTED';
    const stage1NotReached = isRejected && !stage1Passed;

    // Check if we have Token Voting data (Stage 2)
    const hasVotes =
      proposal.tally &&
      (BigInt(proposal.tally.yes || '0') > 0n ||
        BigInt(proposal.tally.no || '0') > 0n ||
        BigInt(proposal.tally.abstain || '0') > 0n);

    if ((currentStage >= 1 || !hasMinistersStage) && hasVotes) {
      // Show Token Voting progress for Stage 2
      const distribution = getVoteDistribution(proposal.tally!);
      const supportPercent = basisPointsToPercentage(
        calculateCurrentSupport(proposal.tally!),
      );

      return (
        <View className="mt-2 border-t-2 border-white/20 pt-2">
          <Text className="mb-1 text-[9px] text-white/40">Stage 2: Community Vote</Text>
          <View className="mb-1 h-2 flex-row border-2 border-white/40">
            {distribution.yes > 0 && (
              <View style={{ width: `${distribution.yes}%`, backgroundColor: '#00FF80', height: '100%' }} />
            )}
            {distribution.abstain > 0 && (
              <View style={{ width: `${distribution.abstain}%`, backgroundColor: '#6B7280', height: '100%' }} />
            )}
            {distribution.no > 0 && (
              <View style={{ width: `${distribution.no}%`, backgroundColor: '#FF006E', height: '100%' }} />
            )}
          </View>
          <Text className="text-[9px] text-white/60">{supportPercent.toFixed(0)}% Support</Text>
        </View>
      );
    }

    if (!hasMinistersStage) {
      return null;
    }

    // Show Multisig approval progress for Stage 1
    return (
      <View className="mt-2 border-t-2 border-white/20 pt-2">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-[9px] text-white/40">Stage 1: Spicy Ministers</Text>
          {stage1NotReached && (
            <Text className="text-[9px] font-bold" style={{ color: '#FF006E' }}>NOT REACHED</Text>
          )}
        </View>
        <View className="mb-1 h-2 flex-row border-2 border-white/40">
          <View
            style={{
              width: `${Math.min(approvalPercent, 100)}%`,
              backgroundColor: stage1Passed ? '#00FF80' : stage1NotReached ? '#FF006E' : '#FFEA00',
              height: '100%',
            }}
          />
        </View>
        <Text className="text-[9px] text-white/60">
          {approvals} of {minApprovals} approvals
        </Text>
      </View>
    );
  }

  // For non-PEP proposals with voting data. The snapshot total can be
  // unknown; then the bar and support still show, only participation is left out.
  if (!proposal.tally || !proposal.votingSettings) {
    return null;
  }

  const hasVotes =
    BigInt(proposal.tally.yes || '0') > 0n ||
    BigInt(proposal.tally.no || '0') > 0n ||
    BigInt(proposal.tally.abstain || '0') > 0n;

  if (!hasVotes) {
    return null;
  }

  const distribution = getVoteDistribution(proposal.tally);
  const supportPercent = basisPointsToPercentage(
    calculateCurrentSupport(proposal.tally),
  );
  const participationPercent = proposal.totalVotingPower
    ? basisPointsToPercentage(calculateParticipation(proposal.tally, proposal.totalVotingPower))
    : null;

  return (
    <View className="mt-2 border-t-2 border-white/20 pt-2">
      <View className="mb-1 h-2 flex-row border-2 border-white/40">
        {distribution.yes > 0 && (
          <View style={{ width: `${distribution.yes}%`, backgroundColor: '#00FF80', height: '100%' }} />
        )}
        {distribution.abstain > 0 && (
          <View style={{ width: `${distribution.abstain}%`, backgroundColor: '#6B7280', height: '100%' }} />
        )}
        {distribution.no > 0 && (
          <View style={{ width: `${distribution.no}%`, backgroundColor: '#FF006E', height: '100%' }} />
        )}
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-[9px] text-white/60">{supportPercent.toFixed(0)}% Support</Text>
        {participationPercent !== null ? (
          <>
            <Text className="text-[9px] text-white/60">•</Text>
            <Text className="text-[9px] text-white/60">{participationPercent.toFixed(0)}% Participation</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

export function ProposalCard(props: ProposalCardProps) {
  const { proposal, onPress } = props;
  const router = useRouter();

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }

    router.push({
      pathname: '/governance/[proposalId]',
      params: { proposalId: proposal.id },
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      className="border-4 border-white bg-[#111827] p-3 shadow-[4px_4px_0px_#000000] active:translate-x-1 active:translate-y-1 active:shadow-none"
    >
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <ProposalStatusPill status={proposal.status} />
          <VotingTrackBadge
            startDate={proposal.startDate}
            endDate={proposal.endDate}
            track={proposal.track ?? undefined}
          />
          {proposal.type === 'ADMIN' ? (
            <Text className="text-[10px] text-white/80">Admin</Text>
          ) : proposal.type === 'PEP' ? (
            <Text className="text-[10px] text-white/80">Community</Text>
          ) : null}
        </View>

        <Text className="text-[10px] text-white/80">
          {getSecondaryLabel(proposal)}
        </Text>
      </View>

      <View className="mb-1 flex-row items-baseline gap-2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-[#FFEA00]">
          {proposal.key}
        </Text>
        <Text className="flex-1 text-[13px] font-bold text-white">
          {proposal.title}
        </Text>
      </View>

      <Text className="mb-2 text-[11px] text-white/80">
        {proposal.description}
      </Text>

      <Text className="text-[10px] text-white/60">
        by {shortenAddress(proposal.proposer)}
      </Text>

      {/* Voting Preview - only show for non-ADMIN proposals */}
      {proposal.type !== 'ADMIN' ? <VotingPreview proposal={proposal} /> : null}
    </Pressable>
  );
}


