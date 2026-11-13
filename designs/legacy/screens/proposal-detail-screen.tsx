import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import {
    ProposalStatusPill,
    ThresholdIndicators,
    VoteModal,
    VotingBreakdown,
    VotingTrackBadge,
} from '@/components/governance';
import { ThemedView } from '@/components/themed-view';
import { FOREST_GREEN } from '@/constants/theme';
import { useGovernanceProposal } from '@/hooks/use-governance';
import { formatBasisPointsAsPercentage } from '@/lib/voting-calculations';
import type { GovernanceProposal, VoteOption } from '@/types/governance';

const CHILIZ_EXPLORER_URL = 'https://chiliscan.com';

function shortenAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function openAddressInExplorer(address: string): void {
  Linking.openURL(`${CHILIZ_EXPLORER_URL}/address/${address}`);
}

type TabType = 'details' | 'voting' | 'settings' | 'actions';

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton(props: TabButtonProps) {
  const { label, isActive, onPress } = props;

  return (
    <Pressable
      onPress={onPress}
      className="flex-1 border-b-4 py-3"
      style={{
        borderBottomColor: isActive ? '#FFEA00' : 'transparent',
      }}
    >
      <Text
        className="text-center text-[11px] font-bold uppercase tracking-wider"
        style={{
          color: isActive ? '#FFEA00' : 'rgba(255, 255, 255, 0.6)',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface DetailsTabProps {
  proposal: GovernanceProposal;
}

function DetailsTab(props: DetailsTabProps) {
  const { proposal } = props;

  const typeLabel = proposal.type === 'PEP' ? 'Community Proposal' : proposal.type === 'ADMIN' ? 'Admin Proposal' : 'Multisig Proposal';

  return (
    <View className="p-4">
      {/* Title */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Title
        </Text>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}>
          {proposal.title}
        </Text>
      </View>

      {/* Description */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Description
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 20 }}>
          {proposal.description}
        </Text>
      </View>

      {/* Type */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Type
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 20 }}>
          {typeLabel}
        </Text>
      </View>

      {/* Execution/Governance - different display based on type */}
      {proposal.type === 'ADMIN' ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
            Execution
          </Text>
          <Text style={{ fontSize: 14, color: '#FFFFFF', fontWeight: 'bold' }}>
            Automatic execution
          </Text>
          <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 }}>
            Proposals created by admins pass automatically without any governance.
          </Text>
        </View>
      ) : proposal.type === 'PEP' ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 8 }}>
            Governance Process
          </Text>

          {/* Stage 1: Spicy Ministers */}
          {(() => {
            const stage1Passed = (proposal.approvals || 0) >= (proposal.minApprovals || 0);
            const isRejected = proposal.status === 'REJECTED';
            const stage1NotReached = isRejected && !stage1Passed;

            return (
              <View style={{
                backgroundColor: stage1NotReached ? 'rgba(255, 0, 110, 0.1)' : 'rgba(255, 234, 0, 0.1)',
                padding: 12,
                marginBottom: 8,
                borderLeftWidth: 3,
                borderLeftColor: stage1Passed ? '#00FF80' : stage1NotReached ? '#FF006E' : '#FFEA00',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                    Stage 1: Spicy Ministers
                  </Text>
                  {stage1Passed ? (
                    <Text style={{ fontSize: 10, color: '#00FF80', fontWeight: 'bold' }}>PASSED</Text>
                  ) : stage1NotReached ? (
                    <Text style={{ fontSize: 10, color: '#FF006E', fontWeight: 'bold' }}>NOT REACHED</Text>
                  ) : (
                    <Text style={{ fontSize: 10, color: '#FFEA00', fontWeight: 'bold' }}>IN PROGRESS</Text>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 8 }}>
                  Multisig approval by designated ministers
                </Text>
                <View style={{ height: 6, backgroundColor: 'rgba(255, 255, 255, 0.2)', marginBottom: 4 }}>
                  <View style={{
                    height: '100%',
                    width: `${(proposal.minApprovals || 0) > 0 ? Math.min(((proposal.approvals || 0) / (proposal.minApprovals || 1)) * 100, 100) : 0}%`,
                    backgroundColor: stage1Passed ? '#00FF80' : stage1NotReached ? '#FF006E' : '#FFEA00',
                  }} />
                </View>
                <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                  {proposal.approvals || 0} of {proposal.minApprovals || 0} approvals
                </Text>
              </View>
            );
          })()}

          {/* Stage 2: Community Signoff */}
          {(() => {
            const stage1Passed = (proposal.approvals || 0) >= (proposal.minApprovals || 0);
            const isRejected = proposal.status === 'REJECTED';
            const stage2NotReached = isRejected && !stage1Passed;

            return (
              <View style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: 12,
                borderLeftWidth: 3,
                borderLeftColor: stage1Passed ? '#60A5FA' : 'rgba(255, 255, 255, 0.3)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' }}>
                    Stage 2: Community Signoff
                  </Text>
                  {stage1Passed ? (
                    <Text style={{ fontSize: 10, color: '#60A5FA', fontWeight: 'bold' }}>ACTIVE</Text>
                  ) : stage2NotReached ? (
                    <Text style={{ fontSize: 10, color: '#FF006E', fontWeight: 'bold' }}>NOT REACHED</Text>
                  ) : (
                    <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 'bold' }}>WAITING</Text>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)' }}>
                  Token voting by PEPPER holders
                </Text>
              </View>
            );
          })()}
        </View>
      ) : (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
            Approvals
          </Text>
          <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
            {proposal.approvals} / {proposal.minApprovals} required
          </Text>
        </View>
      )}

      {/* Time Label */}
      {proposal.timeLabel ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
            Timeline
          </Text>
          <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
            {proposal.timeLabel}
          </Text>
        </View>
      ) : null}

      {/* Proposer */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Proposed By
        </Text>
        <Pressable
          onPress={() => openAddressInExplorer(proposal.proposer)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 12, color: '#60A5FA' }}>
            {shortenAddress(proposal.proposer)}
          </Text>
          <Text style={{ fontSize: 10, color: '#60A5FA' }}>↗</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface VotingTabProps {
  proposal: GovernanceProposal;
}

function VotingTab(props: VotingTabProps) {
  const { proposal } = props;

  // ADMIN proposals have automatic execution - no voting
  if (proposal.type === 'ADMIN') {
    return (
      <View className="p-4">
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: 16,
            borderLeftWidth: 4,
            borderLeftColor: '#FFEA00',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 }}>
            Automatic execution
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', lineHeight: 20 }}>
            Proposals created by admins pass automatically without any governance.
          </Text>
        </View>
      </View>
    );
  }

  // PEP proposals have 2-stage voting
  if (proposal.type === 'PEP') {
    const stage1Passed = (proposal.approvals || 0) >= (proposal.minApprovals || 0);
    const isRejected = proposal.status === 'REJECTED';
    const stage1NotReached = isRejected && !stage1Passed;
    const hasVotingData = proposal.tally && proposal.votingSettings && proposal.totalVotingPower;

    return (
      <View>
        {/* Stage 1: Spicy Ministers */}
        <View style={{ padding: 16, borderBottomWidth: 2, borderBottomColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' }}>
              Stage 1: Spicy Ministers
            </Text>
            {stage1Passed ? (
              <View style={{ backgroundColor: '#00FF80', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000000' }}>PASSED</Text>
              </View>
            ) : stage1NotReached ? (
              <View style={{ backgroundColor: '#FF006E', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>NOT REACHED</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#FFEA00', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000000' }}>IN PROGRESS</Text>
              </View>
            )}
          </View>

          <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 12 }}>
            Multisig approval by designated ministers
          </Text>

          {/* Progress bar */}
          <View style={{ height: 8, backgroundColor: 'rgba(255, 255, 255, 0.2)', marginBottom: 8, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.4)' }}>
            <View style={{
              height: '100%',
              width: `${(proposal.minApprovals || 0) > 0 ? Math.min(((proposal.approvals || 0) / (proposal.minApprovals || 1)) * 100, 100) : 0}%`,
              backgroundColor: stage1Passed ? '#00FF80' : stage1NotReached ? '#FF006E' : '#FFEA00',
            }} />
          </View>

          <Text style={{ fontSize: 12, color: '#FFFFFF' }}>
            {proposal.approvals || 0} of {proposal.minApprovals || 0} approvals received
          </Text>
        </View>

        {/* Stage 2: Community Signoff */}
        <View style={{ padding: 16, borderBottomWidth: 2, borderBottomColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' }}>
              Stage 2: Community Signoff
            </Text>
            {stage1Passed ? (
              <View style={{ backgroundColor: '#60A5FA', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#000000' }}>ACTIVE</Text>
              </View>
            ) : stage1NotReached ? (
              <View style={{ backgroundColor: '#FF006E', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF' }}>NOT REACHED</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.6)' }}>WAITING</Text>
              </View>
            )}
          </View>

          <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 12 }}>
            Token voting by PEPPER holders
          </Text>

          {hasVotingData && stage1Passed ? (
            <View>
              <VotingBreakdown
                tally={proposal.tally!}
                totalVotingPower={proposal.totalVotingPower!}
              />
            </View>
          ) : stage1NotReached ? (
            <View style={{ backgroundColor: 'rgba(255, 0, 110, 0.1)', padding: 12 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center' }}>
                Stage not reached
              </Text>
            </View>
          ) : !stage1Passed ? (
            <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: 12 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center' }}>
                Stage 2 voting will begin after Stage 1 approval
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: 12 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center' }}>
                No votes cast yet
              </Text>
            </View>
          )}
        </View>

        {/* Threshold Indicators - show if voting data available */}
        {hasVotingData && stage1Passed ? (
          <ThresholdIndicators
            tally={proposal.tally!}
            votingSettings={proposal.votingSettings!}
            totalVotingPower={proposal.totalVotingPower!}
          />
        ) : null}
      </View>
    );
  }

  if (!proposal.tally || !proposal.votingSettings || !proposal.totalVotingPower) {
    return (
      <View className="p-4">
        <Text className="text-center text-[12px] text-white/60">
          No voting data available
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Voting Breakdown */}
      <VotingBreakdown
        tally={proposal.tally}
        totalVotingPower={proposal.totalVotingPower}
      />

      {/* Divider */}
      <View
        style={{
          height: 2,
          backgroundColor: '#FFFFFF',
        }}
      />

      {/* Threshold Indicators */}
      <ThresholdIndicators
        tally={proposal.tally}
        votingSettings={proposal.votingSettings}
        totalVotingPower={proposal.totalVotingPower}
      />
    </View>
  );
}

interface SettingsTabProps {
  proposal: GovernanceProposal;
}

function SettingsTab(props: SettingsTabProps) {
  const { proposal } = props;

  if (!proposal.votingSettings) {
    return (
      <View className="p-4">
        <Text className="text-center text-[12px] text-white/60">
          No settings available
        </Text>
      </View>
    );
  }

  const { votingSettings } = proposal;

  return (
    <View className="p-4">
      <Text className="mb-4 text-[12px] font-bold uppercase tracking-wider text-white">
        Voting Settings
      </Text>

      {/* Support Threshold */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Support Threshold
        </Text>
        <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
          {formatBasisPointsAsPercentage(votingSettings.supportThreshold)}
        </Text>
        <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
          Minimum support required to pass
        </Text>
      </View>

      {/* Min Participation */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Minimum Participation
        </Text>
        <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
          {formatBasisPointsAsPercentage(votingSettings.minParticipation)}
        </Text>
        <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
          Minimum voter turnout required
        </Text>
      </View>

      {/* Min Duration */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
          Minimum Duration
        </Text>
        <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
          {Math.floor(votingSettings.minDuration / 86400)} days
        </Text>
        <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
          Minimum voting period
        </Text>
      </View>

      {/* Total Voting Power */}
      {proposal.totalVotingPower ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
            Total Voting Power
          </Text>
          <Text style={{ fontSize: 14, color: '#FFFFFF' }}>
            {(Number(proposal.totalVotingPower) / 1e18).toFixed(0)} CTV
          </Text>
          <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
            At snapshot block
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface ActionsTabProps {
  proposal: GovernanceProposal;
}

function ActionsTab(props: ActionsTabProps) {
  const { proposal } = props;

  if (proposal.actions.length === 0) {
    return (
      <View className="p-4">
        <Text className="text-center text-[12px] text-white/60">
          No actions to execute
        </Text>
      </View>
    );
  }

  return (
    <View className="p-4">
      <Text className="mb-4 text-[12px] font-bold uppercase tracking-wider text-white">
        Actions ({proposal.actions.length})
      </Text>

      {proposal.actions.map((action, index) => (
        <View
          key={index}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: 12,
            marginBottom: 8,
            borderLeftWidth: 3,
            borderLeftColor: '#FFEA00',
          }}
        >
          <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>
            Action #{index + 1}
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 2 }}>
            To: <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{shortenAddress(action.to)}</Text>
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
            Value: <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{action.value}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LegacyProposalDetailScreen() {
  const params = useLocalSearchParams<{ proposalId?: string }>();
  const proposalId = params.proposalId;
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [isVoteModalVisible, setIsVoteModalVisible] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: proposal, isLoading, isError, error, refetch } = useGovernanceProposal({
    proposalId,
  });

  function handleBack() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }

  // Handle vote button press - opens the modal
  const handleVote = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVoteModalVisible(true);
  }, []);

  // Handle successful vote submission
  const handleVoteSuccess = useCallback((txHash: string, voteOption: VoteOption) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    console.log('[GovernanceProposal] Vote successful:', { txHash, voteOption });
  }, []);

  // Handle modal close
  const handleCloseVoteModal = useCallback(() => {
    setIsVoteModalVisible(false);
  }, []);

  function renderTabContent() {
    if (!proposal) {
      return null;
    }

    switch (activeTab) {
      case 'details':
        return <DetailsTab proposal={proposal} />;
      case 'voting':
        return <VotingTab proposal={proposal} />;
      case 'settings':
        return <SettingsTab proposal={proposal} />;
      case 'actions':
        return <ActionsTab proposal={proposal} />;
      default:
        return null;
    }
  }

  return (
    <ThemedView
      className="flex-1"
      style={{ backgroundColor: FOREST_GREEN, paddingTop: insets.top }}
    >
      {/* Custom Header */}
      <View className="flex-row items-center border-b-4 border-white/20 px-4 py-3">
        <Pressable
          onPress={handleBack}
          className="h-10 w-10 items-center justify-center border-2 border-white"
        >
          <Text className="font-['PPNeueBit-Bold'] text-lg text-white">←</Text>
        </Pressable>

        {proposal ? (
          <View className="ml-4 flex-1 flex-row items-center justify-between">
            <Text className="font-['PPNeueBit-Bold'] text-lg text-[#FFEA00]">
              {proposal.key}
            </Text>
            <View className="flex-row items-center gap-2">
              <VotingTrackBadge
                startDate={proposal.startDate}
                endDate={proposal.endDate}
                track={proposal.track ?? undefined}
              />
              <ProposalStatusPill status={proposal.status} />
            </View>
          </View>
        ) : (
          <Text className="ml-4 font-['PPNeueBit-Bold'] text-lg uppercase tracking-wider text-white">
            Proposal
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: proposal?.type === 'PEP' ? 100 : 40 }}>
        <View
          style={{
            backgroundColor: '#111827',
            borderWidth: 4,
            borderColor: '#FFFFFF',
            shadowColor: '#000000',
            shadowOffset: { width: 6, height: 6 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 6,
          }}
        >
          {/* Loading/Error States */}
          {isLoading && !proposal ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={{ marginTop: 12, fontSize: 12, color: '#FFFFFF' }}>
                Loading proposal...
              </Text>
            </View>
          ) : isError && !proposal ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Text className="font-['PPNeueBit-Bold'] text-lg uppercase text-[#FF006E]">
                Unable to load proposal
              </Text>
              <Text className="mt-2 text-center font-['PPNeueBit-Bold'] text-sm text-gray-400">
                {error?.message ?? 'Please try again.'}
              </Text>
              <Pressable
                onPress={() => { void refetch(); }}
                className="mt-4 border-4 border-white bg-[#FF006E] px-6 py-3 shadow-[4px_4px_0px_#000000] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-white">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : !proposal ? (
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: '#FFFFFF', textAlign: 'center' }}>
                Proposal not found
              </Text>
            </View>
          ) : null}

          {/* Tabs */}
          {proposal ? (
            <>
              <View className="flex-row border-b-2 border-white">
                <TabButton
                  label="Details"
                  isActive={activeTab === 'details'}
                  onPress={() => setActiveTab('details')}
                />
                {/* Only show Voting and Settings tabs for non-ADMIN proposals */}
                {proposal.type !== 'ADMIN' ? (
                  <>
                    <TabButton
                      label="Voting"
                      isActive={activeTab === 'voting'}
                      onPress={() => setActiveTab('voting')}
                    />
                    <TabButton
                      label="Settings"
                      isActive={activeTab === 'settings'}
                      onPress={() => setActiveTab('settings')}
                    />
                  </>
                ) : null}
                <TabButton
                  label="Actions"
                  isActive={activeTab === 'actions'}
                  onPress={() => setActiveTab('actions')}
                />
              </View>

              {/* Tab Content */}
              {renderTabContent()}
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Fixed Vote Button at Bottom - Only for PEP proposals */}
      {proposal && proposal.type === 'PEP' ? (
        <View
          className="border-t-2 border-white/20 px-4 py-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {(() => {
            // TODO: Re-enable this check after testing
            // const isVotingEnded = proposal.status === 'REJECTED' || proposal.status === 'EXECUTED';
            const isVotingEnded = false; // For testing - always enabled
            const hasAlreadyVoted = proposal.userVote?.voteOption && proposal.userVote.voteOption !== 'NONE';

            return (
              <Pressable
                onPress={handleVote}
                disabled={isVotingEnded}
                className={`py-4 ${
                  isVotingEnded
                    ? 'bg-white/20'
                    : 'bg-[#FFC043] active:opacity-80'
                }`}
                style={{
                  borderWidth: 4,
                  borderColor: isVotingEnded ? 'rgba(255, 255, 255, 0.3)' : '#FFC043',
                  shadowColor: '#000000',
                  shadowOffset: { width: 4, height: 4 },
                  shadowOpacity: isVotingEnded ? 0 : 1,
                  shadowRadius: 0,
                }}
              >
                <Text
                  className={`text-center font-['PPNeueBit-Bold'] text-lg uppercase tracking-wider ${
                    isVotingEnded ? 'text-white/40' : 'text-black'
                  }`}
                >
                  {isVotingEnded
                    ? 'Voting has ended'
                    : hasAlreadyVoted
                      ? 'Change Vote'
                      : 'Cast Your Vote'}
                </Text>
              </Pressable>
            );
          })()}
        </View>
      ) : null}

      {/* Vote Modal */}
      {proposal && proposal.type === 'PEP' ? (
        <VoteModal
          visible={isVoteModalVisible}
          onClose={handleCloseVoteModal}
          proposal={proposal}
          onSuccess={handleVoteSuccess}
        />
      ) : null}
    </ThemedView>
  );
}


