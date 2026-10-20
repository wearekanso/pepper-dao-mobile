import * as Haptics from 'expo-haptics';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWallet } from '@/contexts/wallet-context';
import type { GovernanceProposal } from '@/types/governance';

import { formatCountdown, formatShortDate } from '../lib/format';
import {
  formatVoteSummary,
  getEndedNote,
  getProposalDescription,
  getProposalLabel,
  getProposalStages,
  getProposalTitle,
  getTrackLabel,
  getUserVote,
  getVoteSplit,
  STAGE_COLORS,
  STATUS_TAGS,
} from '../lib/proposal';
import { INK, SPACE, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';
import { DashedDivider, StatusTag, Tag, Touchable } from './atoms';
import { Panel } from './panel';
import { getVoteBarColors, PixelBar } from './pixel-bar';
import { PixelButton } from './pixel-button';

interface LiveVoteCardProps {
  proposal: GovernanceProposal;
  index?: number;
  onOpen: () => void;
}

/**
 * V2 live vote card (Pulse): white 2pt stroke, kind + time left, title,
 * vote bar, split and the wallet's own vote status. The LIVE NOW marker
 * sits above it, outside the card.
 */
export function LiveVoteCard({ proposal, index = 0, onOpen }: LiveVoteCardProps) {
  const split = getVoteSplit(proposal);
  const isActive = proposal.status === 'ACTIVE';
  const userVote = getUserVote(proposal);
  const { isConnected, connect } = useWallet();

  return (
    <Panel live index={index} onPress={onOpen}>
      <View style={{ gap: 4 }}>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK_KIND, flexShrink: 1 }]} numberOfLines={1}>
            {getProposalLabel(proposal)}
          </Text>
          <Text style={[TYPE.meta18, { color: INK.body }]}>{getTiming(proposal)}</Text>
        </View>
        <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
      </View>

      <PixelBar colors={getVoteBarColors(split)} height={10} shimmer={isActive} delay={250 + index * 70} />

      <Text style={[TYPE.meta18, { color: INK.muted }]}>{formatVoteSummary(split)}</Text>

      <DashedDivider />

      {isConnected ? (
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>
            {userVote ? `YOU VOTED ${userVote}` : "YOU HAVEN'T VOTED YET"}
          </Text>
          <View style={styles.row6}>
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>{userVote ? 'VIEW' : 'VOTE'}</Text>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>CONNECT A WALLET TO VOTE</Text>
          <Touchable onPress={() => void connect()} hitSlop={8} style={styles.row6}>
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>CONNECT</Text>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
          </Touchable>
        </View>
      )}
    </Panel>
  );
}

interface LiveProposalPanelProps {
  proposal: GovernanceProposal;
  index?: number;
  onOpen: () => void;
}

/**
 * V2 live proposal card (Decide): track tag + time left, kind, title,
 * description, stage strip, vote bar with legend and the vote CTA.
 */
export function LiveProposalPanel({ proposal, index = 0, onOpen }: LiveProposalPanelProps) {
  const split = getVoteSplit(proposal);
  const isActive = proposal.status === 'ACTIVE';
  const description = getProposalDescription(proposal);
  const userVote = getUserVote(proposal);

  return (
    <Panel live index={index}>
      <View style={styles.between}>
        <Tag label={getTrackLabel(proposal)} color={INK.muted} variant="outline" />
        <Text style={[TYPE.meta18, { color: INK.body }]}>{getTiming(proposal)}</Text>
      </View>

      <View style={{ gap: 3 }}>
        <Text style={[TYPE.label12, { color: INK_KIND }]}>{getProposalLabel(proposal)}</Text>
        <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
      </View>

      {description ? (
        <Text style={[TYPE.body14, { color: INK.muted }]} numberOfLines={3}>
          {description}
        </Text>
      ) : null}

      <StageStrip proposal={proposal} />

      <PixelBar colors={getVoteBarColors(split)} height={12} shimmer={isActive} delay={250 + index * 70} />

      <View style={styles.between}>
        <Legend color={VOTE_COLORS.YES} label={`YES ${Math.round(split.yes)}%`} />
        <Legend color={VOTE_COLORS.NO} label={`NO ${Math.round(split.no)}%`} />
        <Legend color={THERMAL_COLORS.mist} label={`ABSTAIN ${Math.round(split.abstain)}%`} />
      </View>

      <PixelButton label={isActive && !userVote ? 'VOTE NOW >' : 'VIEW PROPOSAL >'} onPress={onOpen} />
    </Panel>
  );
}

function StageStrip({ proposal }: { proposal: GovernanceProposal }) {
  const stages = getProposalStages(proposal);

  return (
    <View style={[styles.row6, { flexWrap: 'wrap' }]}>
      {stages.map((stage, index) => {
        const color = STAGE_COLORS[stage.state];
        const textColor = stage.state === 'waiting' ? INK.faint : color;

        return (
          <Fragment key={stage.label}>
            {index > 0 ? <Text style={[TYPE.meta18, { color: INK.faint }]}>-</Text> : null}
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[TYPE.meta18, { color: textColor }]}>{stage.short}</Text>
          </Fragment>
        );
      })}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row6}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[TYPE.meta18, { color: INK.body }]}>{label}</Text>
    </View>
  );
}

interface EndedListProps {
  proposals: Array<GovernanceProposal>;
  index?: number;
  onOpen: (proposal: GovernanceProposal) => void;
}

/** Ended proposals as one card with dashed separators; rows cascade in */
export function EndedList({ proposals, index = 0, onOpen }: EndedListProps) {
  return (
    <Panel padding={0} gap={0} index={index}>
      {proposals.map((proposal, rowIndex) => {
        const status = STATUS_TAGS[proposal.status];
        const note = getEndedNote(proposal);
        const isLast = rowIndex === proposals.length - 1;

        return (
          <View key={proposal.id}>
            <Touchable
              pressedOpacity={0.55}
              onPress={() => {
                void Haptics.selectionAsync();
                onOpen(proposal);
              }}
              style={styles.endedRow}
            >
              <View style={styles.between}>
                <View style={[styles.row6, { gap: 8, flexShrink: 1 }]}>
                  <StatusTag label={status.label} status={status.kind} />
                  <Text style={[TYPE.label12, { color: INK_ENDED_KIND, flexShrink: 1 }]} numberOfLines={1}>
                    {getProposalLabel(proposal)}
                  </Text>
                </View>
                <View style={styles.row6}>
                  <Text style={[TYPE.meta18, { color: INK.faint }]}>
                    {formatShortDate(proposal.executedAt ?? proposal.endDate)}
                  </Text>
                  <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
                </View>
              </View>
              <Text style={TYPE.meta18}>{getProposalTitle(proposal)}</Text>
              {note ? <Text style={[TYPE.meta18, { color: INK_NOTE }]}>{note}</Text> : null}
            </Touchable>
            {isLast ? null : <DashedDivider />}
          </View>
        );
      })}
    </Panel>
  );
}

/** "2D 14H LEFT" while voting, "OPENS IN 1D 4H" before it starts */
function getTiming(proposal: GovernanceProposal): string {
  return proposal.status === 'ACTIVE'
    ? `${formatCountdown(proposal.endDate)} LEFT`
    : `OPENS IN ${formatCountdown(proposal.startDate)}`;
}

/** Figma uses a few in-between white levels for secondary card text */
const INK_KIND = 'rgba(255,255,255,0.5)';
const INK_ENDED_KIND = 'rgba(255,255,255,0.45)';
const INK_NOTE = 'rgba(255,255,255,0.5)';

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  row6: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
  },
  endedRow: {
    paddingHorizontal: SPACE.rowX,
    paddingVertical: SPACE.rowY,
    gap: 4,
  },
});
