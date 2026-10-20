import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useStaking } from '@/hooks/use-staking';

import { formatCompact, formatInteger } from '../lib/format';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { FilterChip, Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

interface StakeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (txHash: string, operation: Operation) => void;
}

/**
 * Stake / unstake PEPPER for vePEPPER voting power. Same flow as the legacy
 * StakeModal (approve → stake, or unstake) on top of useStaking.
 */
export function StakeSheet({ visible, onClose, onSuccess }: StakeSheetProps) {
  const [mode, setMode] = useState<Operation>('stake');
  const [amount, setAmount] = useState('');
  const {
    stakingData,
    isLoading,
    error: queryError,
    txStatus,
    txError,
    formattedWalletBalance,
    formattedStakedBalance,
    canStake,
    canUnstake,
    needsApproval,
    approve,
    stake,
    unstake,
    refetch,
  } = useStaking();

  const isPending = txStatus === 'pending';
  const walletBalance = parseFloat(formattedWalletBalance) || 0;
  const stakedBalance = parseFloat(formattedStakedBalance) || 0;
  const maxAmount = mode === 'stake' ? walletBalance : stakedBalance;
  const amountNum = parseFloat(amount) || 0;

  const isStake = mode === 'stake';
  const requiresApproval = isStake && amountNum > 0 && needsApproval(amount);
  const isValid = amountNum > 0 && (isStake ? canStake(amount) || requiresApproval : canUnstake(amount));
  const inputError =
    amountNum > 0 && !isValid ? (isStake ? 'NOT ENOUGH PEPPER IN WALLET' : 'NOT ENOUGH STAKED PEPPER') : null;

  function handleClose() {
    setAmount('');
    onClose();
  }

  function selectMode(next: Operation) {
    setMode(next);
    setAmount('');
  }

  function setPercent(percent: number) {
    void Haptics.selectionAsync();
    setAmount(maxAmount > 0 ? String(Math.floor((maxAmount * percent) / 100)) : '0');
  }

  async function handleSubmit() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isStake) {
      if (requiresApproval) {
        const approval = await approve(amount);
        if (!approval.success) return;
      }
      const result = await stake(amount);
      if (result.success && result.txHash) finish(result.txHash, 'stake');
      return;
    }

    const result = await unstake(amount);
    if (result.success && result.txHash) finish(result.txHash, 'unstake');
  }

  function finish(txHash: string, operation: Operation) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    onClose();
    onSuccess?.(txHash, operation);
  }

  const submitLabel = isPending
    ? 'SIGN IN YOUR WALLET…'
    : isStake
      ? requiresApproval
        ? 'APPROVE & STAKE >'
        : 'STAKE PEPPER >'
      : 'UNSTAKE PEPPER >';

  return (
    <ThermalSheet
      visible={visible}
      onClose={handleClose}
      locked={isPending}
      title={isStake ? 'STAKE PEPPER' : 'UNSTAKE PEPPER'}
      footer={
        <PixelButton
          label={submitLabel}
          variant="gold"
          disabled={!isValid || isPending}
          style={{ flex: 1 }}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <Text style={TYPE.body14}>Staked PEPPER becomes vePEPPER: your voting power, plus +5 REP every week.</Text>

      <View style={styles.row}>
        <FilterChip label="STAKE" isActive={isStake} onPress={() => selectMode('stake')} style={{ flex: 1 }} />
        <FilterChip label="UNSTAKE" isActive={!isStake} onPress={() => selectMode('unstake')} style={{ flex: 1 }} />
      </View>

      <View style={[styles.row, { gap: 12 }]}>
        <Balance label="IN WALLET" value={isLoading ? '…' : formatCompact(walletBalance)} highlight={isStake} />
        <Balance label="STAKED" value={isLoading ? '…' : formatCompact(stakedBalance)} highlight={!isStake} />
      </View>

      {queryError && !stakingData ? (
        <View style={styles.notice}>
          <Text style={[TYPE.body14, { color: INK.muted }]}>Unable to load staking data.</Text>
          <Touchable onPress={() => void refetch()}>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>RETRY</Text>
          </Touchable>
        </View>
      ) : null}

      <SheetSection label="AMOUNT" right={`MAX ${formatInteger(maxAmount)}`} />

      <View>
        <HardShadow />
        <View
          style={[
            styles.input,
            { borderColor: inputError ? STATUS_COLORS.negative.stroke : amountNum > 0 ? THERMAL_COLORS.white : THERMAL_COLORS.border },
          ]}
        >
          <TextInput
            value={amount ? formatInteger(amountNum) : ''}
            onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
            placeholder="0"
            placeholderTextColor={INK.faint}
            keyboardType="number-pad"
            editable={!isPending}
            style={[TYPE.display32, styles.inputText]}
          />
          <Text style={[TYPE.label12, { color: INK.muted }]}>PEPPER</Text>
        </View>
      </View>

      <View style={[styles.row, { gap: 8 }]}>
        {PERCENTS.map((percent) => (
          <FilterChip
            key={percent}
            label={percent === 100 ? 'MAX' : `${percent}%`}
            isActive={maxAmount > 0 && amountNum === Math.floor((maxAmount * percent) / 100)}
            onPress={() => setPercent(percent)}
            style={{ flex: 1 }}
          />
        ))}
      </View>

      {inputError ? <Text style={[TYPE.label12, { color: STATUS_COLORS.negative.text }]}>{inputError}</Text> : null}

      {amountNum > 0 && !inputError ? (
        <View>
          <HardShadow />
          <View style={styles.preview}>
            <PreviewRow label="YOU GET" value={`${formatInteger(amountNum)} ${isStake ? 'vePEPPER' : 'PEPPER'}`} />
            {isStake ? <PreviewRow label="WEEKLY REWARD" value="+5 REP / WEEK" color={THERMAL_COLORS.cream} /> : null}
            <PreviewRow
              label="IN YOUR WALLET"
              value={isStake ? (requiresApproval ? '1 APPROVE  ·  2 STAKE' : '1 STAKE') : '1 UNSTAKE'}
            />
          </View>
        </View>
      ) : null}

      {txError ? (
        <View style={styles.notice}>
          <Text style={[TYPE.label12, { color: STATUS_COLORS.negative.text }]}>TRANSACTION FAILED</Text>
          <Text style={[TYPE.body14, { color: INK.muted }]}>{txError}</Text>
        </View>
      ) : null}
    </ThermalSheet>
  );
}

/** Balance box; the one the current mode spends from gets a white stroke */
function Balance({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <HardShadow />
      <View style={[styles.balance, { borderColor: highlight ? THERMAL_COLORS.white : THERMAL_COLORS.border }]}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
        <Text style={TYPE.display24}>{value}</Text>
      </View>
    </View>
  );
}

function PreviewRow({ label, value, color = THERMAL_COLORS.white }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.between}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
      <Text style={[TYPE.meta18, { color }]}>{value}</Text>
    </View>
  );
}

type Operation = 'stake' | 'unstake';

const PERCENTS = [25, 50, 75, 100];

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balance: {
    gap: 4,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACE.panel,
    paddingVertical: 8,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
  },
  preview: {
    gap: 8,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  inputText: {
    flex: 1,
    paddingVertical: 4,
  },
  notice: {
    gap: 4,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    borderWidth: SIZE.stroke,
    borderColor: STATUS_COLORS.negative.stroke,
  },
});
