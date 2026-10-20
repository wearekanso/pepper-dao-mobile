import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useUser } from '@/contexts/user-context';
import { useVoting } from '@/hooks/use-voting';
import { REPUTATION_POINTS } from '@/lib/reputation';
import type { GovernanceProposal, VoteOption } from '@/types/governance';

import { castDemoVote, DEMO_VOTING_POWER, isDemoProposalId } from '../lib/demo-vote';
import { getProposalLabel, getProposalTitle } from '../lib/proposal';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';
import { DashedDivider, Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

type CastOption = Exclude<VoteOption, 'NONE'>;

interface VoteSheetProps {
  visible: boolean;
  onClose: () => void;
  proposal: GovernanceProposal;
  initialOption?: CastOption;
  onSuccess?: (txHash: string, option: CastOption) => void;
}

/**
 * Confirm a vote: shows the proposal, your vePEPPER weight and the three
 * options. Signing happens in the wallet via useVoting; on success the sheet
 * closes and the caller stamps the tally.
 */
export function VoteSheet({ visible, onClose, proposal, initialOption, onSuccess }: VoteSheetProps) {
  const [selected, setSelected] = useState<CastOption | null>(initialOption ?? null);
  const isDemo = isDemoProposalId(proposal.id);
  const { profile } = useUser();
  const isFirstVote = !profile?.has_voted;
  const voting = useVoting(isDemo ? undefined : proposal.pluginProposalId);
  const { txError, resetTxState } = voting;
  const [isDemoPending, setIsDemoPending] = useState(false);
  const isPending = isDemo ? isDemoPending : voting.txStatus === 'pending';
  const isLoading = isDemo ? false : voting.isLoading;
  const formattedVotingPower = isDemo ? DEMO_VOTING_POWER : voting.formattedVotingPower;

  useEffect(() => {
    if (!visible) return;
    setSelected(initialOption ?? null);
    resetTxState();
  }, [visible, initialOption, resetTxState]);

  async function handleSubmit() {
    if (!selected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isDemo) setIsDemoPending(true);
    const result = isDemo ? await castDemoVote() : await voting.vote(proposal.pluginProposalId, selected);
    if (isDemo) setIsDemoPending(false);
    if (result.success && result.txHash) {
      onClose();
      onSuccess?.(result.txHash, selected);
    }
  }

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      locked={isPending}
      title={isDemo ? 'TEST VOTE' : 'CAST YOUR VOTE'}
      footer={
        <PixelButton
          label={isPending ? 'SIGN IN YOUR WALLET…' : selected ? `VOTE ${selected} >` : 'PICK AN OPTION'}
          variant="gold"
          disabled={!selected || isPending}
          style={{ flex: 1 }}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={[TYPE.label12, { color: INK_KIND }]}>{getProposalLabel(proposal)}</Text>
        <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
      </View>

      <View>
        <HardShadow />
        <View style={styles.power}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>YOUR VOTING POWER</Text>
          <Text style={TYPE.meta18}>{isLoading ? 'READING…' : `${formattedVotingPower} vePEPPER`}</Text>
        </View>
      </View>

      <SheetSection label="YOUR VOTE" />

      <View>
        <HardShadow />
        <View style={styles.list}>
          {OPTIONS.map((option, index) => {
            const isSelected = selected === option.value;
            return (
              <View key={option.value}>
                <Touchable
                  disabled={isPending}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelected(option.value);
                  }}
                  style={[styles.option, isSelected && styles.optionSelected]}
                >
                  <View style={[styles.swatch, { backgroundColor: option.color }]} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={TYPE.label12}>{option.value}</Text>
                    <Text style={[TYPE.meta18, { color: INK.muted }]}>{option.hint}</Text>
                  </View>
                  {isSelected ? (
                    <View style={styles.selectedTag}>
                      <Text style={[TYPE.label12, { color: THERMAL_COLORS.void }]}>PICKED</Text>
                    </View>
                  ) : null}
                </Touchable>
                {index < OPTIONS.length - 1 && !isSelected && selected !== OPTIONS[index + 1]?.value ? <DashedDivider /> : null}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.between}>
        <Text style={[TYPE.meta18, { color: INK.muted }]}>{isFirstVote ? 'First vote bonus' : 'Vote reward'}</Text>
        <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>
          {`+${isFirstVote ? REPUTATION_POINTS.FIRST_VOTE : REPUTATION_POINTS.VOTE} REP`}
        </Text>
      </View>

      {txError ? (
        <View style={styles.error}>
          <Text style={[TYPE.label12, { color: STATUS_COLORS.negative.text }]}>VOTE FAILED</Text>
          <Text style={[TYPE.body14, { color: INK.muted }]}>{txError}</Text>
        </View>
      ) : null}
    </ThermalSheet>
  );
}

/** Kind label sits a step dimmer than other labels (Figma: 50%) */
const INK_KIND = 'rgba(255,255,255,0.5)';

const OPTIONS: Array<{ value: CastOption; hint: string; color: string }> = [
  { value: 'YES', hint: 'Approve this proposal', color: VOTE_COLORS.YES },
  { value: 'NO', hint: 'Reject this proposal', color: VOTE_COLORS.NO },
  { value: 'ABSTAIN', hint: 'Count toward quorum, no side', color: THERMAL_COLORS.mist },
];

const styles = StyleSheet.create({
  power: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: THERMAL_COLORS.white,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  swatch: {
    width: 14,
    height: 14,
  },
  selectedTag: {
    backgroundColor: THERMAL_COLORS.white,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  error: {
    gap: 4,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    borderWidth: SIZE.stroke,
    borderColor: STATUS_COLORS.negative.stroke,
  },
});
