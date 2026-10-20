import * as Haptics from 'expo-haptics';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GovernanceProposal } from '@/types/governance';

import { formatAgo, formatCountdown, shortenKey } from '../lib/format';
import {
  formatVoteSummary,
  getEndedNote,
  getProposalKind,
  getProposalDescription,
  getProposalTitle,
  getProposalStages,
  getTrackShort,
  getUserVote,
  getVoteSplit,
  STAGE_COLORS,
  STATUS_STYLES,
} from '../lib/proposal';
import { INK, SPACE, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';
import { DashedDivider, Tag, Touchable } from './atoms';
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
  const timing = isActive
    ? `${formatCountdown(proposal.endDate)} LEFT`
    : `OPENS IN ${formatCountdown(proposal.startDate)}`;

  return (
    <Panel live index={index} onPress={onOpen}>
      <View style={{ gap: 4 }}>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK_KIND, flexShrink: 1 }]} numberOfLines={1}>
            {`${getProposalKind(proposal)} · ${shortenKey(proposal.key)}`}
          </Text>
          <Text style={[TYPE.meta18, { color: INK.body }]}>{timing}</Text>
        </View>
        <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
      </View>

      <PixelBar colors={getVoteBarColors(split)} height={10} shimmer={isActive} delay={250 + index * 70} />

      <Text style={[TYPE.meta18, { color: INK.muted }]}>{formatVoteSummary(split)}</Text>

      <DashedDivider />

      <View style={styles.between}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>
          {userVote ? `YOU VOTED ${userVote}` : "YOU HAVEN'T VOTED YET"}
        </Text>
        <View style={styles.row6}>
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>{userVote ? 'VIEW' : 'VOTE'}</Text>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
        </View>
      </View>
    </Panel>
  );
}

interface LiveProposalPanelProps {
  proposal: GovernanceProposal;
  variant: 'compact' | 'full';
  index?: number;
  onOpen: () => void;
}

/**
 * Live proposal readout. Compact on Pulse, full (with stages, legend and
 * CTA) on Decide. The orange frame pulses towards gold while voting is open.
 */
export function LiveProposalPanel({ proposal, variant, index = 0, onOpen }: LiveProposalPanelProps) {
  const status = STATUS_STYLES[proposal.status];
  const split = getVoteSplit(proposal);
  const isActive = proposal.status === 'ACTIVE';
  const isFull = variant === 'full';
  const timing = isActive
    ? `ENDS IN ${formatCountdown(proposal.endDate)}`
    : proposal.status === 'PENDING'
      ? `STARTS IN ${formatCountdown(proposal.startDate)}`
      : formatAgo(proposal.endDate);

  return (
    <Panel borderColor={THERMAL_COLORS.orange} glow={isActive} index={index} onPress={isFull ? undefined : onOpen}>
      <View style={styles.between}>
        <View style={styles.row6}>
          <Tag label={status.label} color={status.color} textColor={status.textColor} />
          {isFull ? <Tag label={getTrackShort(proposal)} color="rgba(255,255,255,0.6)" variant="outline" /> : null}
        </View>
        <Text style={[TYPE.meta16, { color: THERMAL_COLORS.orange }]}>{timing}</Text>
      </View>

      <View style={{ gap: isFull ? 3 : 2 }}>
        <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>{shortenKey(proposal.key)}</Text>
        <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
      </View>

      {isFull && getProposalDescription(proposal) ? (
        <Text style={TYPE.body13} numberOfLines={3}>
          {getProposalDescription(proposal)}
        </Text>
      ) : null}

      {isFull ? <StageStrip proposal={proposal} /> : null}

      <PixelBar colors={getVoteBarColors(split)} height={isFull ? 12 : 10} shimmer={isActive} delay={250 + index * 70} />

      {isFull ? (
        <View style={styles.between}>
          <Legend color={VOTE_COLORS.YES} label={`YES ${Math.round(split.yes)}%`} />
          <Legend color={VOTE_COLORS.NO} label={`NO ${Math.round(split.no)}%`} />
          <Legend color={THERMAL_COLORS.mist} label={`ABSTAIN ${Math.round(split.abstain)}%`} />
        </View>
      ) : (
        <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]}>{formatVoteSummary(split)}</Text>
      )}

      {isFull ? <PixelButton label={isActive ? 'CAST YOUR VOTE >' : 'VIEW PROPOSAL >'} onPress={onOpen} /> : null}
    </Panel>
  );
}

function StageStrip({ proposal }: { proposal: GovernanceProposal }) {
  const stages = getProposalStages(proposal);
  const short = ['STAGE 1', 'STAGE 2', 'EXECUTE'];

  return (
    <View style={[styles.row6, { gap: 8, flexWrap: 'wrap' }]}>
      {stages.map((stage, index) => {
        const color = STAGE_COLORS[stage.state];
        const label =
          stages.length === 3
            ? `${short[index]}${stage.state === 'live' ? ' · LIVE' : ''}`
            : index === stages.length - 1
              ? 'EXECUTE'
              : 'APPROVAL';
        const textColor = stage.state === 'waiting' ? 'rgba(255,255,255,0.4)' : color;

        return (
          <Fragment key={stage.label}>
            {index > 0 ? <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.4)' }]}>-</Text> : null}
            <View style={{ width: 8, height: 8, backgroundColor: color }} />
            <Text style={[TYPE.meta16, { color: textColor }]}>{label}</Text>
          </Fragment>
        );
      })}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row6}>
      <View style={{ width: 8, height: 8, backgroundColor: color }} />
      <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.85)' }]}>{label}</Text>
    </View>
  );
}

interface EndedListProps {
  proposals: Array<GovernanceProposal>;
  index?: number;
  onOpen: (proposal: GovernanceProposal) => void;
}

/** Ended proposals as one panel with dashed separators; rows cascade in */
export function EndedList({ proposals, index = 0, onOpen }: EndedListProps) {
  return (
    <Panel padding={0} gap={0} index={index}>
      {proposals.map((proposal, rowIndex) => {
        const status = STATUS_STYLES[proposal.status];
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
                  <Tag label={status.label} color={status.color} textColor={status.textColor} />
                  <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold, flexShrink: 1 }]} numberOfLines={1}>
                    {shortenKey(proposal.key, 20)}
                  </Text>
                </View>
                <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.4)' }]}>
                  {formatAgo(proposal.executedAt ?? proposal.endDate)}
                </Text>
              </View>
              <Text style={TYPE.bodyMedium14}>{getProposalTitle(proposal)}</Text>
              {note ? <Text style={[TYPE.meta16, { color: THERMAL_COLORS.blue }]}>{note}</Text> : null}
            </Touchable>
            {isLast ? null : <DashedDivider />}
          </View>
        );
      })}
    </Panel>
  );
}

/** Card kind label sits a step dimmer than other in-card labels (Figma: 50%) */
const INK_KIND = 'rgba(255,255,255,0.5)';

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
  endedRow: {
    paddingHorizontal: SPACE.rowX,
    paddingVertical: SPACE.rowY,
    gap: 4,
  },
});
