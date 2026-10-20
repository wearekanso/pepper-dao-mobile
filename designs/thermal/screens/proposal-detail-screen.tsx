import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useWallet } from '@/contexts/wallet-context';
import { useGovernanceProposal } from '@/hooks/use-governance';
import {
  basisPointsToPercentage,
  calculateCurrentSupport,
  calculateParticipation,
} from '@/lib/voting-calculations';
import type { GovernanceProposal, VoteOption } from '@/types/governance';

import { ChevronLink, DashedDivider, LiveMarker, SectionLabel, StatusTag, Tag, Touchable } from '../components/atoms';
import { Panel } from '../components/panel';
import { getVoteBarColors, PixelBar } from '../components/pixel-bar';
import { PixelButton } from '../components/pixel-button';
import { ErrorCard } from '../components/state-cards';
import { ThermalScreen } from '../components/thermal-screen';
import { VoteSheet } from '../components/vote-sheet';
import { RepSticker, VoteStamp } from '../components/vote-stamp';
import { useCountUp } from '../hooks/use-count-up';
import { createDemoProposal, isDemoProposalId } from '../lib/demo-vote';
import { formatCompact, formatCountdown, formatShortDate, shortenAddress, tokenToNumber } from '../lib/format';
import {
  getActionSummary,
  getProposalDescription,
  getProposalLabel,
  getProposalStages,
  getProposalTitle,
  getTrackLong,
  getUserVote,
  getVoteSplit,
  STATUS_TAGS,
  type StageState,
} from '../lib/proposal';
import { INK, STATUS_COLORS, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';

/**
 * Proposal detail — thermal tally, the approval path and the vote dock.
 * Voting goes through the shared VoteModal (wallet + tx handling); a
 * successful vote slams the VOTED stamp onto the tally.
 */
export function ProposalDetailScreen() {
  const router = useRouter();
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>();
  const isDemo = isDemoProposalId(proposalId);
  const demoProposal = useMemo(() => (isDemo ? createDemoProposal() : null), [isDemo]);
  const query = useGovernanceProposal({ proposalId: isDemo ? undefined : proposalId });
  const proposal = demoProposal ?? query.data;
  const { refetch, isRefetching } = query;
  const isLoading = !isDemo && query.isLoading;
  const isError = !isDemo && query.isError;

  const [pendingOption, setPendingOption] = useState<Exclude<VoteOption, 'NONE'> | null>(null);
  const [freshVote, setFreshVote] = useState<FreshVote | null>(null);

  const isCouncil = proposal ? proposal.type !== 'PEP' : false;
  // The dock stays for open and upcoming community votes; ended ones have nothing to press
  const canVote = proposal?.type === 'PEP' && (proposal.status === 'ACTIVE' || proposal.status === 'PENDING');
  const dockHeight = canVote ? DOCK_HEIGHT : 0;

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/governance');
  }

  function handleSelect(option: Exclude<VoteOption, 'NONE'>) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingOption(option);
  }

  function handleVoteSuccess(txHash: string, option: VoteOption, points: number) {
    if (option === 'NONE') return;
    setFreshVote({ option, txHash, date: new Date(), points });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const recordedOption = freshVote?.option ?? (proposal ? getUserVote(proposal) : null);

  return (
    <ThermalScreen
      preset="detail"
      bottomSpace={dockHeight + 24}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      navBar={{
        title: proposal ? getProposalLabel(proposal) : 'PROPOSAL',
        onBack: handleBack,
      }}
      overlay={
        proposal && canVote ? (
          <VoteDock
            proposal={proposal}
            selected={recordedOption}
            freshTx={freshVote?.txHash ?? null}
            onSelect={handleSelect}
          />
        ) : null
      }
    >

      {isLoading && !proposal ? (
        <View style={styles.center}>
          <ActivityIndicator color={THERMAL_COLORS.gold} />
          <Text style={[TYPE.label12, { color: INK.muted }]}>READING HEAT SIGNATURE…</Text>
        </View>
      ) : null}

      {isError && !proposal ? (
        <ErrorCard
          message="We couldn't reach the Chiliz network to load this proposal. Your data is safe — try again in a moment."
          onRetry={() => void refetch()}
          explorerUrl={EXPLORER_URL}
        />
      ) : null}

      {!isLoading && !isError && !proposal ? (
        <Panel>
          <Text style={TYPE.display24}>Proposal not found</Text>
        </Panel>
      ) : null}

      {proposal ? (
        <>
          <View style={[styles.row, { gap: 10 }]}>
            {isCouncil ? (
              <Tag label="COUNCIL DECISION" color={INK.muted} variant="outline" />
            ) : proposal.status === 'ACTIVE' ? (
              <LiveMarker label="LIVE" />
            ) : (
              <StatusTag label={STATUS_TAGS[proposal.status].label} status={STATUS_TAGS[proposal.status].kind} />
            )}
            {isCouncil ? null : <Tag label={getTrackLong(proposal)} color={INK.muted} variant="outline" />}
          </View>

          <View style={{ gap: 12 }}>
            <Text style={TYPE.display32}>{getProposalTitle(proposal)}</Text>
            <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
              <Touchable onPress={() => void Linking.openURL(`${EXPLORER_URL}/address/${proposal.proposer}`)}>
                <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>
                  {isCouncil ? 'by Council multisig' : `by ${shortenAddress(proposal.proposer)}`}
                </Text>
              </Touchable>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>{`· ${getTimingLabel(proposal)}`}</Text>
            </View>
          </View>

          {proposal.status === 'EXECUTED' ? <ExecutedBanner proposal={proposal} /> : null}

          {isCouncil ? (
            <CouncilPanel proposal={proposal} />
          ) : proposal.status === 'PENDING' ? (
            <NotOpenPanel proposal={proposal} />
          ) : (
            <ResultsPanel proposal={proposal} recordedOption={recordedOption} freshVote={freshVote} />
          )}

          {isCouncil ? null : <StepsPanel proposal={proposal} />}

          {getProposalDescription(proposal) ? <Summary text={getProposalDescription(proposal)} /> : null}

          {proposal.actions.length > 0 ? (
            <View style={{ gap: 10 }}>
              <SectionLabel
                label={`WHAT THIS ${isCouncil ? 'DOES' : 'PROPOSAL DOES'} · ${proposal.actions.length} ${proposal.actions.length === 1 ? 'ACTION' : 'ACTIONS'}`}
              />
              {proposal.actions.map((action, index) => {
                const summary = getActionSummary(action);
                return (
                  <Panel
                    key={`${action.to}-${index}`}
                    index={5 + index}
                    gap={4}
                    onPress={() => void Linking.openURL(`${EXPLORER_URL}/address/${action.to}`)}
                  >
                    <View style={styles.between}>
                      <Text style={[TYPE.meta18, { flexShrink: 1 }]} numberOfLines={1}>
                        {summary.title}
                      </Text>
                      <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>{'VIEW >'}</Text>
                    </View>
                    <Text style={[TYPE.meta18, { color: INK.muted }]} numberOfLines={1}>
                      {summary.detail}
                    </Text>
                  </Panel>
                );
              })}
            </View>
          ) : null}

          {canVote ? (
            <VoteSheet
              visible={pendingOption !== null}
              onClose={() => setPendingOption(null)}
              proposal={proposal}
              initialOption={pendingOption ?? undefined}
              onSuccess={handleVoteSuccess}
            />
          ) : null}
        </>
      ) : null}
    </ThermalScreen>
  );
}

interface ResultsPanelProps {
  proposal: GovernanceProposal;
  recordedOption: Exclude<VoteOption, 'NONE'> | null;
  freshVote: FreshVote | null;
}

function ResultsPanel({ proposal, recordedOption, freshVote }: ResultsPanelProps) {
  const split = getVoteSplit(proposal);
  const animatedYes = useCountUp(split.yes, 1100);
  const tally = proposal.tally;
  const settings = proposal.votingSettings;
  const total = proposal.totalVotingPower;

  const isEnded = proposal.status !== 'ACTIVE' && proposal.status !== 'PENDING';

  const header = isEnded ? (
    <View style={styles.between}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>FINAL RESULT</Text>
      {recordedOption ? <Text style={TYPE.label12}>{`YOU VOTED ${recordedOption}`}</Text> : null}
    </View>
  ) : (
    <View style={styles.between}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>RESULTS</Text>
      <View style={[styles.row, { gap: 10 }]}>
        {freshVote ? <RepSticker points={freshVote.points} /> : null}
        {recordedOption ? (
          <VoteStamp
            key={freshVote?.txHash ?? 'recorded'}
            option={recordedOption}
            date={freshVote?.date}
            slam={false}
          />
        ) : null}
      </View>
    </View>
  );

  if (proposal.type === 'ADMIN' || !tally) {
    return (
      <Panel index={2}>
        {header}
        <Text style={[TYPE.display40, { color: THERMAL_COLORS.cream }]}>
          {proposal.type === 'ADMIN' ? 'AUTO' : 'NO VOTES'}
        </Text>
        <Text style={[TYPE.body14, { color: INK.muted }]}>
          {proposal.type === 'ADMIN'
            ? 'Admin proposals execute automatically without a community vote.'
            : 'No vePEPPER has been cast on this proposal yet.'}
        </Text>
      </Panel>
    );
  }

  if (isEnded && split.yes + split.no + split.abstain === 0) {
    const ministersBlocked = proposal.approvals < proposal.minApprovals;
    return (
      <Panel index={2}>
        {header}
        <Text style={[TYPE.display32, { color: INK_DIM }]}>NO VOTE HELD</Text>
        <Text style={[TYPE.body14, { color: INK.muted }]}>
          {ministersBlocked
            ? "Ministers didn't approve it, so the community vote never opened."
            : 'No vePEPPER was cast before voting closed.'}
        </Text>
      </Panel>
    );
  }

  const support = basisPointsToPercentage(calculateCurrentSupport(tally));
  const participation = total ? basisPointsToPercentage(calculateParticipation(tally, total)) : null;
  const rows: Array<{ label: string; color: string; percent: number; amount: string }> = [
    { label: 'YES', color: VOTE_COLORS.YES, percent: split.yes, amount: tally.yes },
    { label: 'NO', color: VOTE_COLORS.NO, percent: split.no, amount: tally.no },
    { label: 'ABSTAIN', color: THERMAL_COLORS.mist, percent: split.abstain, amount: tally.abstain },
  ];

  return (
    <Panel index={2}>
      {header}
      <View style={[styles.row, { alignItems: 'flex-end', gap: 8 }]}>
        <Text style={[TYPE.display58, { color: THERMAL_COLORS.cream }]}>{`${Math.round(animatedYes)}%`}</Text>
        <Text style={[TYPE.label14, { color: THERMAL_COLORS.cream, marginBottom: 6 }]}>YES</Text>
      </View>
      <PixelBar colors={getVoteBarColors(split)} height={14} delay={300} shimmer={proposal.status === 'ACTIVE'} />
      {isEnded ? null : rows.map((row) => (
        <View key={row.label} style={styles.between}>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={{ width: 8, height: 8, backgroundColor: row.color }} />
            <Text style={TYPE.label12}>{row.label}</Text>
          </View>
          <Text style={[TYPE.meta18, { color: INK.muted }]}>
            {`${Math.round(row.percent)}% · ${formatCompact(tokenToNumber(BigInt(row.amount), 18))} vePEPPER`}
          </Text>
        </View>
      ))}
      {settings && settings.supportThreshold > 0 ? (
        <>
          <DashedDivider />
          <ThresholdRow
            label="SUPPORT"
            value={support}
            needed={basisPointsToPercentage(settings.supportThreshold)}
          />
          {participation !== null ? (
            <ThresholdRow
              label="PARTICIPATION"
              value={participation}
              needed={basisPointsToPercentage(settings.minParticipation)}
            />
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function ThresholdRow({ label, value, needed }: { label: string; value: number; needed: number }) {
  const isMet = value >= needed;

  return (
    <View style={styles.between}>
      <View style={[styles.row, { gap: 8 }]}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
        <Text style={TYPE.meta18}>{`${Math.round(value)}% · needs ${Math.round(needed)}%`}</Text>
      </View>
      <StatusTag label={isMet ? 'MET' : 'NOT YET'} status={isMet ? 'positive' : 'waiting'} />
    </View>
  );
}

function StepsPanel({ proposal }: { proposal: GovernanceProposal }) {
  const stages = getProposalStages(proposal);

  return (
    <Panel index={4} gap={10}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>STEPS</Text>
      {stages.map((stage, index) => {
        const box = STEP_BOX[stage.state];
        return (
          <View key={stage.label} style={[styles.row, { gap: 10 }]}>
            <View style={[styles.stepBox, box.box]}>
              <Text style={[TYPE.label12, { color: box.number }]}>{index + 1}</Text>
            </View>
            <Text style={[TYPE.meta18, { color: stage.state === 'waiting' ? INK.faint : INK.strong, flexShrink: 1 }]}>
              {stage.sentence}
            </Text>
          </View>
        );
      })}
    </Panel>
  );
}

/** Long summaries collapse to four lines behind READ MORE */
function Summary({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > SUMMARY_PREVIEW_CHARS;

  return (
    <View style={{ gap: 10 }}>
      <SectionLabel label="SUMMARY" />
      <Text style={TYPE.body14} numberOfLines={isLong && !isExpanded ? 4 : undefined}>
        {text}
      </Text>
      {isLong ? (
        <ChevronLink label={isExpanded ? 'SHOW LESS' : 'READ MORE'} onPress={() => setIsExpanded((value) => !value)} />
      ) : null}
    </View>
  );
}

interface VoteDockProps {
  proposal: GovernanceProposal;
  selected: Exclude<VoteOption, 'NONE'> | null;
  freshTx: string | null;
  onSelect: (option: Exclude<VoteOption, 'NONE'>) => void;
}

function VoteDock({ proposal, selected, freshTx, onSelect }: VoteDockProps) {
  const router = useRouter();
  const { isConnected, connect } = useWallet();
  const isGuest = !isConnected && !isDemoProposalId(proposal.id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isOpen = proposal.status === 'ACTIVE';
  const height = DOCK_HEIGHT + insets.bottom;

  const footer = freshTx
    ? isDemoProposalId(proposal.id)
      ? `Test vote (not on-chain) · ${selected}`
      : `You voted ${selected} · recorded on Chiliz`
    : proposal.status === 'PENDING'
      ? `Voting opens in ${formatCountdown(proposal.startDate).toLowerCase()}`
      : !isOpen
        ? 'Voting is closed for this proposal'
        : selected
          ? `You voted ${selected} · tap to change`
          : 'Your vePEPPER sets the temperature';
  const showTx = Boolean(freshTx) && !isDemoProposalId(proposal.id);

  return (
    <Animated.View style={[styles.dock, { height }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="dock-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            {/* Fully opaque by the time the buttons start, so content never shows through them */}
            <Stop offset={DOCK_BUTTONS_TOP / height} stopColor={THERMAL_COLORS.void} stopOpacity={1} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#dock-fade)" />
      </Svg>
      {isGuest ? (
        <View style={styles.dockBody}>
          <PixelButton label="CONNECT WALLET TO VOTE >" variant="gold" onPress={() => void connect()} />
          <View style={styles.between}>
            <Text style={[TYPE.meta18, { color: INK.muted }]}>Votes need staked vePEPPER</Text>
            <ChevronLink label="HOW?" onPress={() => router.push('/rulebook')} />
          </View>
        </View>
      ) : (
      <View style={styles.dockBody}>
        <View style={[styles.row, { gap: 12 }]}>
          {VOTE_OPTIONS.map((option) => {
            const isSelected = selected === option;
            return (
              <PixelButton
                key={option}
                label={option}
                disabled={!isOpen}
                variant={isSelected ? 'cream' : selected ? 'muted' : 'outline'}
                style={{ flex: 1 }}
                onPress={() => onSelect(option)}
              />
            );
          })}
        </View>
        <View style={styles.between}>
          <Text style={[TYPE.meta18, { color: INK.muted, flexShrink: 1 }]} numberOfLines={1}>
            {footer}
          </Text>
          {showTx ? (
            <ChevronLink label="TX" onPress={() => void Linking.openURL(`${EXPLORER_URL}/tx/${freshTx}`)} />
          ) : null}
        </View>
      </View>
      )}
    </Animated.View>
  );
}

function getTimingLabel(proposal: GovernanceProposal): string {
  if (proposal.type === 'ADMIN') return 'admin action · auto-approved';
  if (proposal.type !== 'PEP') {
    return `${proposal.approvals} ${proposal.approvals === 1 ? 'approval' : 'approvals'} so far`;
  }
  if (proposal.status === 'ACTIVE') return `ends in ${formatCountdown(proposal.endDate).toLowerCase()}`;
  if (proposal.status === 'PENDING') return `voting opens in ${formatCountdown(proposal.startDate).toLowerCase()}`;
  return `ended ${toSentenceDate(formatShortDate(proposal.endDate))}`;
}

/** "2 SEP 2025" → "2 Sep 2025" */
function toSentenceDate(value: string): string {
  return value.replace(/[A-Z]{3}/, (month) => month[0] + month.slice(1).toLowerCase());
}

/** Executed proposals lead with what actually happened */
function ExecutedBanner({ proposal }: { proposal: GovernanceProposal }) {
  const firstAction = proposal.actions[0] ? getActionSummary(proposal.actions[0]) : null;
  const date = toSentenceDate(formatShortDate(proposal.executedAt ?? proposal.endDate));

  return (
    <Panel live index={1} gap={6}>
      <Text style={TYPE.label12}>{proposal.type === 'PEP' ? 'PASSED · EXECUTED ON-CHAIN' : 'EXECUTED ON-CHAIN'}</Text>
      <Text style={[TYPE.meta18, { color: INK.muted }]}>{firstAction ? `${date} · ${firstAction.title}` : date}</Text>
    </Panel>
  );
}

/** Upcoming community vote: ministers still reviewing */
function NotOpenPanel({ proposal }: { proposal: GovernanceProposal }) {
  return (
    <Panel index={2}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>RESULTS</Text>
      <Text style={[TYPE.display32, { color: INK_DIM }]}>NOT OPEN YET</Text>
      <Text style={[TYPE.body14, { color: INK.muted }]}>
        {`Ministers are reviewing this proposal. Community voting opens once ${proposal.minApprovals} approve.`}
      </Text>
      <View style={styles.between}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>MINISTERS</Text>
        <Text style={TYPE.meta18}>{`${proposal.approvals} / ${proposal.minApprovals} APPROVED`}</Text>
      </View>
    </Panel>
  );
}

/** Council (multisig / admin) proposals: nothing to vote on, only approvals */
function CouncilPanel({ proposal }: { proposal: GovernanceProposal }) {
  const isDone = proposal.status === 'EXECUTED' || proposal.approvals >= proposal.minApprovals;

  if (proposal.type === 'ADMIN') {
    return (
      <Panel index={2}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>NO COMMUNITY VOTE</Text>
        <Text style={TYPE.body14}>Admin actions run on-chain automatically. There is nothing to vote on.</Text>
      </Panel>
    );
  }

  return (
    <>
      <Panel index={2}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>NO COMMUNITY VOTE</Text>
        <Text style={TYPE.body14}>
          {`Council decisions run on-chain once ${proposal.minApprovals} council members approve. You can follow along, but there is nothing to vote on.`}
        </Text>
      </Panel>
      <Panel index={3}>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>APPROVALS</Text>
          <Text style={TYPE.meta18}>{`${proposal.approvals} / ${proposal.minApprovals}`}</Text>
        </View>
        <View style={styles.between}>
          <Text style={[TYPE.meta18, { color: INK.muted }]}>
            {isDone ? 'Threshold reached' : `${proposal.minApprovals - proposal.approvals} more needed`}
          </Text>
          <StatusTag label={isDone ? 'APPROVED' : 'WAITING'} status={isDone ? 'positive' : 'waiting'} />
        </View>
      </Panel>
    </>
  );
}

interface FreshVote {
  option: Exclude<VoteOption, 'NONE'>;
  txHash: string;
  date: Date;
  /** REP the vote earned (first vote pays more) */
  points: number;
}

const VOTE_OPTIONS: Array<Exclude<VoteOption, 'NONE'>> = ['YES', 'NO', 'ABSTAIN'];
/** Step number box per stage state (V2 status colors) */
const STEP_BOX: Record<StageState, { box: object; number: string }> = {
  done: { box: { borderWidth: 2, borderColor: STATUS_COLORS.positive.stroke }, number: STATUS_COLORS.positive.text },
  live: { box: { backgroundColor: THERMAL_COLORS.white }, number: THERMAL_COLORS.void },
  waiting: { box: { borderWidth: 2, borderColor: STATUS_COLORS.waiting.stroke }, number: STATUS_COLORS.waiting.text },
  failed: { box: { borderWidth: 2, borderColor: STATUS_COLORS.negative.stroke }, number: STATUS_COLORS.negative.text },
};

/** "NOT OPEN YET" sits faded (Figma: 50%) */
const INK_DIM = 'rgba(255,255,255,0.5)';

const SUMMARY_PREVIEW_CHARS = 220;
const DOCK_HEIGHT = 128;
/** Dock buttons start 36pt down; the fade above them is the only see-through part */
const DOCK_BUTTONS_TOP = 36;
const EXPLORER_URL = 'https://chiliscan.com';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  center: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  stepBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  dockBody: {
    position: 'absolute',
    top: DOCK_BUTTONS_TOP,
    left: 16,
    right: 16,
    gap: 10,
  },
});
