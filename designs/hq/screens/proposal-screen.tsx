import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWallet } from '@/contexts/wallet-context';
import { useGovernanceProposal } from '@/hooks/use-governance';
import { useVoting } from '@/hooks/use-voting';
import { basisPointsToPercentage, calculateParticipation } from '@/lib/voting-calculations';
import type { GovernanceProposal, VoteOption } from '@/types/governance';
import { formatAgo, formatCountdown, shortenAddress, shortenKey } from '@/designs/thermal/lib/format';
import { getProposalDescription, getProposalTitle, getTrackShort, getVoteSplit, isLiveProposal } from '@/designs/thermal/lib/proposal';

import { Card, Chip, Notice, ProgressBar, SectionLabel, Touchable } from '../components/atoms';
import { HqButton } from '../components/hq-button';
import { HqScreen } from '../components/hq-screen';
import { VoteSealed } from '../components/vote-sealed';
import { EXPLORER_URL } from '../lib/floors';
import { HQ_COLORS, SPACE, TYPE } from '../theme';

/**
 * Proposal detail: what it does, where the vote stands, and your ballot.
 * A successful vote swaps the screen for the "VOTE SEALED" receipt.
 */
export function ProposalScreen() {
  const router = useRouter();
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>();
  const { data: proposal, isLoading, isError, refetch, isRefetching } = useGovernanceProposal({ proposalId });
  const [sealed, setSealed] = useState<SealedVote | null>(null);

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/governance');
  }

  if (sealed && proposal) {
    return (
      <VoteSealed
        option={sealed.option}
        proposalKey={shortenKey(proposal.key)}
        txHash={sealed.txHash}
        onDone={handleBack}
      />
    );
  }

  const isCommunityVote = proposal?.type === 'PEP';
  const canVote = isCommunityVote && proposal !== undefined && proposal !== null && isLiveProposal(proposal);
  const recordedVote = normalizeVote(proposal?.userVote?.voteOption);

  return (
    <HqScreen
      hasTabBar={false}
      header={{ floor: '3F · MINISTERS HALL', title: proposal ? shortenKey(proposal.key) : 'PROPOSAL', fallback: '/governance' }}
      bottomSpace={canVote ? DOCK_HEIGHT : 0}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      overlay={proposal && canVote ? <VoteDock proposal={proposal} onSealed={setSealed} /> : null}
    >
      {isLoading && !proposal ? <ActivityIndicator color={HQ_COLORS.green} style={{ paddingVertical: 48 }} /> : null}
      {isError && !proposal ? <Notice title="COULD NOT LOAD PROPOSAL" message="Pull down to try again." /> : null}
      {!isLoading && !isError && !proposal ? <Notice title="PROPOSAL NOT FOUND" color={HQ_COLORS.muted} /> : null}

      {proposal ? (
        <Animated.View style={{ gap: SPACE.section }}>
          <View style={styles.between}>
            <Chip label={getTrackShort(proposal)} />
            <Text style={TYPE.meta}>{getTimingLabel(proposal)}</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={TYPE.title22}>{getProposalTitle(proposal)}</Text>
            <Touchable onPress={() => void Linking.openURL(`${EXPLORER_URL}/address/${proposal.proposer}`)}>
              <Text style={TYPE.body12}>{`by ${shortenAddress(proposal.proposer)}`}</Text>
            </Touchable>
            <Description text={getProposalDescription(proposal)} />
          </View>

          <Results proposal={proposal} />

          {isCommunityVote && !canVote ? (
            <Notice
              title={recordedVote ? `YOU VOTED ${recordedVote}` : 'VOTING CLOSED'}
              message={recordedVote ? 'Your ballot is framed on your office wall.' : 'This vote has ended.'}
              color={recordedVote ? HQ_COLORS.green : HQ_COLORS.muted}
            />
          ) : null}

          {!isCommunityVote ? (
            <Notice
              title="NO COMMUNITY VOTE"
              message="This proposal is approved by the Spicy Ministers and executes on-chain without a community vote."
              color={HQ_COLORS.muted}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </HqScreen>
  );
}

function Description({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!text) return null;

  const isLong = text.length > 220;

  return (
    <View style={{ gap: 4 }}>
      <Text style={TYPE.body14} numberOfLines={isExpanded || !isLong ? undefined : 4}>
        {text}
      </Text>
      {isLong ? (
        <Touchable onPress={() => setIsExpanded((value) => !value)} hitSlop={8}>
          <Text style={[TYPE.meta, { color: HQ_COLORS.green }]}>{isExpanded ? 'Show less' : 'Read more'}</Text>
        </Touchable>
      ) : null}
    </View>
  );
}

function Results({ proposal }: { proposal: GovernanceProposal }) {
  const split = getVoteSplit(proposal);
  const tally = proposal.tally;
  const settings = proposal.votingSettings;
  const participation =
    tally && proposal.totalVotingPower ? basisPointsToPercentage(calculateParticipation(tally, proposal.totalVotingPower)) : null;
  const quorum = settings ? basisPointsToPercentage(settings.minParticipation) : null;

  const rows = [
    { label: 'Yes', value: split.yes, color: HQ_COLORS.green },
    { label: 'No', value: split.no, color: HQ_COLORS.red },
    { label: 'Abstain', value: split.abstain, color: HQ_COLORS.dim },
  ];

  return (
    <View style={{ gap: 8 }}>
      <SectionLabel label="RESULTS" />
      <Card style={{ gap: 14 }}>
        {rows.map((row, index) => (
          <View key={row.label} style={{ gap: 8 }}>
            <View style={styles.between}>
              <Text style={TYPE.medium14}>{row.label}</Text>
              <Text style={TYPE.medium14}>{`${Math.round(row.value)}%`}</Text>
            </View>
            <ProgressBar progress={row.value / 100} color={row.color} delay={150 + index * 90} />
          </View>
        ))}
        {participation !== null ? <Text style={TYPE.body12}>{getTurnoutLabel(participation, quorum)}</Text> : null}
      </Card>
    </View>
  );
}

interface VoteDockProps {
  proposal: GovernanceProposal;
  onSealed: (vote: SealedVote) => void;
}

/** YES / NO / ABSTAIN + one CAST VOTE button, docked to the bottom */
function VoteDock({ proposal, onSealed }: VoteDockProps) {
  const insets = useSafeAreaInsets();
  const { isConnected, connect } = useWallet();
  const { formattedVotingPower, isLoading, txStatus, txError, vote } = useVoting(proposal.pluginProposalId, proposal.pluginAddress);
  const recorded = normalizeVote(proposal.userVote?.voteOption);
  const [selected, setSelected] = useState<CastOption | null>(recorded);
  const isOpen = proposal.status === 'ACTIVE';
  const isPending = txStatus === 'pending';

  async function handleCast() {
    if (!selected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await vote(proposal.pluginProposalId, selected);
    if (result.success && result.txHash) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSealed({ option: selected, txHash: result.txHash });
    }
  }

  const buttonLabel = !isConnected
    ? 'CONNECT TO VOTE'
    : isPending
      ? 'SIGN IN WALLET…'
      : !isOpen
        ? proposal.status === 'PENDING'
          ? 'VOTING OPENS SOON'
          : 'VOTING CLOSED'
        : recorded && selected === recorded
          ? `YOU VOTED ${recorded}`
          : selected
            ? `CAST ${selected}`
            : 'PICK AN OPTION';

  const canSubmit = isConnected ? isOpen && Boolean(selected) && selected !== recorded : true;

  return (
    <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.between}>
        <Text style={TYPE.label}>YOUR VOTE</Text>
        <Text style={TYPE.meta}>{isConnected ? `Power ${isLoading ? '…' : formattedVotingPower} vePEPPER` : 'Wallet not connected'}</Text>
      </View>
      <View style={styles.choices}>
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <Pressable
              key={option.value}
              disabled={!isOpen || isPending || !isConnected}
              onPress={() => {
                void Haptics.selectionAsync();
                setSelected(option.value);
              }}
              style={[
                styles.choice,
                isSelected && { borderColor: option.color, borderWidth: 2, backgroundColor: HQ_COLORS.surfaceHi },
                (!isOpen || !isConnected) && !isSelected && { opacity: 0.4 },
              ]}
            >
              <View pointerEvents="none">
                <Text style={[TYPE.display22, { color: isSelected ? option.color : HQ_COLORS.text }]}>{option.value}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {txError ? <Text style={[TYPE.body12, { color: HQ_COLORS.red }]} numberOfLines={2}>{txError}</Text> : null}
      <HqButton
        label={buttonLabel}
        loading={isPending}
        disabled={!canSubmit}
        onPress={() => (isConnected ? void handleCast() : void connect())}
      />
    </View>
  );
}

function getTurnoutLabel(participation: number, quorum: number | null): string {
  const turnout = `${Math.round(participation)}% turnout`;
  if (!quorum) return turnout;
  if (participation >= quorum) return `Quorum reached · ${turnout}`;
  return `${turnout} · quorum needs ${Math.round(quorum)}%`;
}

function getTimingLabel(proposal: GovernanceProposal): string {
  if (proposal.status === 'ACTIVE') return `Ends in ${formatCountdown(proposal.endDate).toLowerCase()}`;
  if (proposal.status === 'PENDING') return `Starts in ${formatCountdown(proposal.startDate).toLowerCase()}`;
  return `Ended ${formatAgo(proposal.endDate).toLowerCase()}`;
}

function normalizeVote(option: VoteOption | undefined): CastOption | null {
  if (!option || option === 'NONE') return null;
  return option;
}

type CastOption = Exclude<VoteOption, 'NONE'>;

interface SealedVote {
  option: CastOption;
  txHash: string;
}

const OPTIONS: Array<{ value: CastOption; color: string }> = [
  { value: 'YES', color: HQ_COLORS.green },
  { value: 'NO', color: HQ_COLORS.red },
  { value: 'ABSTAIN', color: HQ_COLORS.text },
];

const DOCK_HEIGHT = 170;

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: SPACE.margin,
    backgroundColor: HQ_COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: HQ_COLORS.line,
  },
  choices: {
    flexDirection: 'row',
    gap: 8,
  },
  choice: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: HQ_COLORS.line,
  },
});
