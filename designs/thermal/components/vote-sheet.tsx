import * as Haptics from 'expo-haptics';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useWalletInfo } from '@reown/appkit-react-native';
import { useQuery } from '@tanstack/react-query';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { useVoting } from '@/hooks/use-voting';
import { REPUTATION_POINTS } from '@/lib/reputation';
import { fetchNativeBalance } from '@/services/chiliz-api';
import type { GovernanceProposal, VoteOption } from '@/types/governance';

import { castDemoVote, DEMO_LOW_CHZ, DEMO_VOTING_POWER, isDemoProposalId } from '../lib/demo-vote';
import { formatDayMonth, tokenToNumber } from '../lib/format';
import { getProposalLabel, getProposalTitle } from '../lib/proposal';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';
import { ChevronLink, DashedDivider, StatusTag, Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';
import { VoteStamp } from './vote-stamp';

type CastOption = Exclude<VoteOption, 'NONE'>;

interface VoteSheetProps {
  visible: boolean;
  onClose: () => void;
  proposal: GovernanceProposal;
  initialOption?: CastOption;
  /** Dev-only test vote: fail with this wallet error instead of succeeding */
  demoFailure?: string;
  /** Called when the sheet closes after a recorded vote, with the REP it earned */
  onSuccess?: (txHash: string, option: CastOption, points: number) => void;
}

/**
 * Cast a vote in one sheet: pick an option, confirm in the wallet, then
 * either the VOTED stamp with what you earned, or why it wasn't recorded.
 * The caller learns about a successful vote when the sheet closes.
 */
export function VoteSheet({ visible, onClose, proposal, initialOption, onSuccess, demoFailure }: VoteSheetProps) {
  const [selected, setSelected] = useState<CastOption | null>(initialOption ?? null);
  const [result, setResult] = useState<CastResult | null>(null);
  const isDemo = isDemoProposalId(proposal.id);
  const { profile } = useUser();
  const [isFirstVote, setIsFirstVote] = useState(!profile?.has_voted);
  const voting = useVoting(isDemo ? undefined : proposal.pluginProposalId);
  const [demoError, setDemoError] = useState<string | null>(null);
  const txError = isDemo ? demoError : voting.txError;
  const resetTxState = voting.resetTxState;
  const [isDemoPending, setIsDemoPending] = useState(false);
  const isPending = isDemo ? isDemoPending : voting.txStatus === 'pending';
  const isLoading = isDemo ? false : voting.isLoading;
  const formattedVotingPower = isDemo ? DEMO_VOTING_POWER : voting.formattedVotingPower;
  const phase: Phase = result ? 'success' : isPending ? 'confirm' : txError ? 'failed' : 'pick';

  useEffect(() => {
    if (!visible) return;
    setSelected(initialOption ?? null);
    setResult(null);
    resetTxState();
    // Freeze the reward line for this attempt: the profile flips after the vote lands
    setIsFirstVote(!profile?.has_voted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialOption, resetTxState]);

  async function handleSubmit() {
    if (!selected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isDemo) setIsDemoPending(true);
    const outcome = isDemo ? await castDemoVote(demoFailure) : await voting.vote(proposal.pluginProposalId, selected);
    if (isDemo) {
      setIsDemoPending(false);
      if (!outcome.success) setDemoError(outcome.error ?? 'Vote failed');
    }
    if (outcome.success && outcome.txHash) {
      setResult({ txHash: outcome.txHash, option: selected, date: new Date() });
    }
  }

  function handleClose() {
    onClose();
    if (result) onSuccess?.(result.txHash, result.option, points);
  }

  function handleRetry() {
    resetTxState();
    setDemoError(null);
  }

  async function handleGetChz() {
    await openBrowserAsync(FANX_SWAP_URL, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
  }

  const powerLine = isLoading ? 'READING…' : `${formattedVotingPower} vePEPPER`;
  const points = isFirstVote ? REPUTATION_POINTS.FIRST_VOTE : REPUTATION_POINTS.VOTE;

  return (
    <ThermalSheet
      visible={visible}
      onClose={handleClose}
      locked={isPending}
      title={phase === 'success' ? 'VOTE RECORDED' : isDemo ? 'TEST VOTE' : 'CAST YOUR VOTE'}
      footer={
        phase === 'success' ? (
          <PixelButton label="DONE" variant="gold" style={{ flex: 1 }} onPress={handleClose} />
        ) : phase === 'confirm' ? (
          <PixelButton label="WAITING FOR WALLET…" variant="gold" disabled style={{ flex: 1 }} />
        ) : phase === 'failed' ? (
          <>
            {txError && isGasError(txError) ? (
              <PixelButton label="GET CHZ" variant="outline" style={{ alignSelf: 'auto' }} onPress={() => void handleGetChz()} />
            ) : null}
            <PixelButton label="TRY AGAIN" variant="gold" style={{ flex: 1 }} onPress={handleRetry} />
          </>
        ) : (
          <PixelButton
            label={selected ? `VOTE ${selected} >` : 'PICK AN OPTION'}
            variant="gold"
            disabled={!selected}
            style={{ flex: 1 }}
            onPress={() => void handleSubmit()}
          />
        )
      }
    >
      {phase === 'pick' ? (
        <PickBody
          proposal={proposal}
          selected={selected}
          powerLine={powerLine}
          points={points}
          isFirstVote={isFirstVote}
          onSelect={setSelected}
        />
      ) : null}
      {phase === 'confirm' && selected ? (
        <ConfirmBody proposal={proposal} option={selected} powerLine={powerLine} />
      ) : null}
      {phase === 'success' && result ? (
        <SuccessBody
          result={result}
          points={points}
          isFirstVote={isFirstVote}
          streakWeeks={profile?.current_streak_weeks ?? 0}
          showTx={!isDemo}
        />
      ) : null}
      {phase === 'failed' && txError ? <FailedBody error={txError} isDemo={isDemo} /> : null}
    </ThermalSheet>
  );
}

interface PickBodyProps {
  proposal: GovernanceProposal;
  selected: CastOption | null;
  powerLine: string;
  points: number;
  isFirstVote: boolean;
  onSelect: (option: CastOption) => void;
}

function PickBody({ proposal, selected, powerLine, points, isFirstVote, onSelect }: PickBodyProps) {
  return (
    <>
      <ProposalHeading proposal={proposal} />

      <View>
        <HardShadow />
        <View style={styles.power}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>YOUR VOTING POWER</Text>
          <Text style={TYPE.meta18}>{powerLine}</Text>
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
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onSelect(option.value);
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
        <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>{`+${points} REP`}</Text>
      </View>
    </>
  );
}

function ConfirmBody({ proposal, option, powerLine }: { proposal: GovernanceProposal; option: CastOption; powerLine: string }) {
  const { walletInfo } = useWalletInfo();
  const walletName = walletInfo?.name;
  // Signing happens in the wallet app; if it didn't come up, open it by hand
  const walletLink = walletInfo?.redirect?.native ?? walletInfo?.redirect?.universal;

  return (
    <>
      <Text style={TYPE.display24}>CONFIRM IN YOUR WALLET</Text>

      <View>
        <HardShadow />
        <View style={styles.summary}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.label12, { color: INK.muted }]}>{`VOTE ${option}`}</Text>
            <Text style={TYPE.meta18} numberOfLines={1}>
              {getProposalTitle(proposal)}
            </Text>
          </View>
          <Text style={TYPE.meta18}>{powerLine}</Text>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {CONFIRM_STEPS.map((step, index) => (
          <ConfirmStep
            key={step.title}
            index={index}
            title={step.title}
            hint={index === 0 && walletName ? walletName : step.hint}
            isLive={index === 0}
          />
        ))}
      </View>

      {walletName && walletLink ? (
        <View style={styles.between}>
          <Text style={TYPE.meta18}>Wallet didn&apos;t open?</Text>
          <ChevronLink label={`OPEN ${walletName.toUpperCase()}`} onPress={() => void Linking.openURL(walletLink)} />
        </View>
      ) : null}
    </>
  );
}

function ConfirmStep({ index, title, hint, isLive }: { index: number; title: string; hint: string; isLive: boolean }) {
  return (
    <View style={[styles.between, { justifyContent: 'flex-start', alignItems: 'flex-start', gap: 10 }]}>
      <View style={[styles.stepBox, isLive ? styles.stepBoxLive : styles.stepBoxWaiting]}>
        <Text style={[TYPE.label12, { color: isLive ? THERMAL_COLORS.void : INK.faint }]}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.meta18, { color: isLive ? THERMAL_COLORS.white : INK.faint }]}>{title}</Text>
        <Text style={[TYPE.meta18, { color: isLive ? INK.muted : INK.faint }]}>{hint}</Text>
      </View>
    </View>
  );
}

interface SuccessBodyProps {
  result: CastResult;
  points: number;
  isFirstVote: boolean;
  streakWeeks: number;
  showTx: boolean;
}

function SuccessBody({ result, points, isFirstVote, streakWeeks, showTx }: SuccessBodyProps) {
  return (
    <>
      <View style={styles.stampSlot}>
        <VoteStamp option={result.option} date={result.date} slam size="large" />
      </View>

      <View style={[styles.between, { gap: 12 }]}>
        <ResultBox label="EARNED" value={`+${points} REP`} hint={isFirstVote ? 'first vote' : 'per vote'} />
        <ResultBox
          label="STREAK"
          value={streakWeeks === 1 ? '1 WEEK' : `${streakWeeks} WEEKS`}
          hint={`next by ${formatDayMonth(new Date(result.date.getTime() + STREAK_WINDOW_MS).toISOString())}`}
        />
      </View>

      <View style={styles.between}>
        <Text style={[TYPE.meta18, { color: INK.muted, flexShrink: 1 }]}>You can change your vote until it ends.</Text>
        {showTx ? (
          <ChevronLink
            label="TX"
            onPress={() =>
              void openBrowserAsync(`${EXPLORER_URL}/tx/${result.txHash}`, {
                presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
              })
            }
          />
        ) : null}
      </View>
    </>
  );
}

function ResultBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1 }}>
      <HardShadow />
      <View style={styles.box}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
        <Text style={TYPE.display24}>{value}</Text>
        <Text style={[TYPE.meta18, { color: INK.muted }]} numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

function FailedBody({ error, isDemo }: { error: string; isDemo: boolean }) {
  const reason = getFailureReason(error);
  const isGas = isGasError(error);
  const { address } = useWallet();
  const { data: native } = useQuery({
    queryKey: ['thermal', 'nativeBalance', address],
    queryFn: () => fetchNativeBalance(address!),
    enabled: isGas && !isDemo && Boolean(address),
  });
  const chz = isDemo ? DEMO_LOW_CHZ : native ? tokenToNumber(native.balance, 18) : null;

  return (
    <>
      <StatusTag label="NOT RECORDED" status="negative" />
      <Text style={TYPE.display24}>{reason.title}</Text>
      <Text style={[TYPE.body14, { color: INK.body }]}>{reason.body}</Text>
      {isGas && chz !== null ? (
        <View style={styles.chzBox}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>YOUR CHZ</Text>
          <Text style={TYPE.meta18}>{`${formatChz(chz)} / ~${GAS_CHZ_NEEDED} needed`}</Text>
        </View>
      ) : null}
    </>
  );
}

function isGasError(error: string): boolean {
  return /insufficient funds|gas/i.test(error);
}

/** Small CHZ amounts keep two decimals ("0.02") */
function formatChz(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function ProposalHeading({ proposal }: { proposal: GovernanceProposal }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={[TYPE.label12, { color: INK_KIND }]}>{getProposalLabel(proposal)}</Text>
      <Text style={TYPE.display24}>{getProposalTitle(proposal)}</Text>
    </View>
  );
}

/** Map wallet / RPC errors to a plain reason (Figma "Tx 4 · Failed") */
function getFailureReason(error: string): { title: string; body: string } {
  if (/reject|denied|cancel/i.test(error)) {
    return { title: 'YOU CANCELLED IT', body: 'You cancelled the request in your wallet. Nothing was sent — try again when ready.' };
  }
  if (isGasError(error)) {
    return {
      title: 'NOT ENOUGH CHZ FOR GAS',
      body: `Voting is free, but Chiliz needs a tiny fee to record it. Add about ${GAS_CHZ_NEEDED} CHZ to your wallet and try again.`,
    };
  }
  if (/network|chain/i.test(error)) {
    return { title: 'WRONG NETWORK', body: 'Switch your wallet to Chiliz Chain and try again.' };
  }
  if (/ended|closed|not open/i.test(error)) {
    return { title: 'VOTING HAS ENDED', body: 'This proposal no longer accepts votes.' };
  }
  return { title: 'VOTE NOT RECORDED', body: error };
}

interface CastResult {
  txHash: string;
  option: CastOption;
  date: Date;
}

type Phase = 'pick' | 'confirm' | 'success' | 'failed';

const CONFIRM_STEPS = [
  { title: 'Open your wallet', hint: 'Approve in your connected wallet app' },
  { title: 'Approve the request', hint: 'No CHZ leaves your wallet except gas' },
  { title: 'Recorded on Chiliz', hint: 'Usually ~5 seconds' },
];

/** Kind label sits a step dimmer than other labels (Figma: 50%) */
const INK_KIND = 'rgba(255,255,255,0.5)';

const EXPLORER_URL = 'https://chiliscan.com';

/** A weekly streak survives if the next vote lands within 7 days */
const STREAK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const OPTIONS: Array<{ value: CastOption; hint: string; color: string }> = [
  { value: 'YES', hint: 'Approve this proposal', color: VOTE_COLORS.YES },
  { value: 'NO', hint: 'Reject this proposal', color: VOTE_COLORS.NO },
  { value: 'ABSTAIN', hint: 'Count toward quorum, no side', color: THERMAL_COLORS.mist },
];

/** Rough CHZ a vote's gas needs, shown when a vote fails for gas */
const GAS_CHZ_NEEDED = 0.5;
const FANX_SWAP_URL = 'https://app.fanx.xyz/trade/swap';

const styles = StyleSheet.create({
  chzBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.rowX,
    paddingVertical: 12,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  stepBox: {
    width: 20,
    height: 20,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBoxLive: {
    backgroundColor: THERMAL_COLORS.white,
  },
  stepBoxWaiting: {
    borderWidth: SIZE.stroke,
    borderColor: STATUS_COLORS.waiting.stroke,
  },
  stampSlot: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  box: {
    gap: 4,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
});
