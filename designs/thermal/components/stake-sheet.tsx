import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useStaking } from '@/hooks/use-staking';

import { formatCompact, formatInteger } from '../lib/format';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';
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
      subtitle="Staked PEPPER becomes vePEPPER: your voting power, plus +5 REP every week."
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
      <View style={styles.row}>
        <FilterChip label="STAKE" isActive={isStake} onPress={() => selectMode('stake')} />
        <FilterChip label="UNSTAKE" isActive={!isStake} onPress={() => selectMode('unstake')} />
      </View>

      <View style={[styles.row, { gap: 12 }]}>
        <Balance label="IN WALLET" value={isLoading ? '…' : formatCompact(walletBalance)} highlight={isStake} />
        <Balance label="STAKED" value={isLoading ? '…' : formatCompact(stakedBalance)} highlight={!isStake} />
      </View>

      {queryError && !stakingData ? (
        <View style={[styles.notice, { borderLeftColor: THERMAL_COLORS.red }]}>
          <Text style={TYPE.body13}>Unable to load staking data.</Text>
          <Touchable onPress={() => void refetch()}>
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>RETRY</Text>
          </Touchable>
        </View>
      ) : null}

      <SheetSection
        label={isStake ? 'AMOUNT TO STAKE' : 'AMOUNT TO UNSTAKE'}
        right={`MAX ${formatInteger(maxAmount)}`}
      />

      <View>
        <HardShadow />
        <View style={[styles.input, inputError && { borderColor: THERMAL_COLORS.red }]}>
          <TextInput
            value={amount ? formatInteger(amountNum) : ''}
            onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="number-pad"
            editable={!isPending}
            style={[TYPE.display40, styles.inputText]}
          />
          <Text style={[TYPE.label12, { color: 'rgba(255,255,255,0.6)' }]}>PEPPER</Text>
        </View>
      </View>

      <View style={[styles.row, { gap: 8 }]}>
        {PERCENTS.map((percent) => (
          <View key={percent} style={{ flex: 1 }}>
            <FilterChip
              label={percent === 100 ? 'MAX' : `${percent}%`}
              isActive={maxAmount > 0 && amountNum === Math.floor((maxAmount * percent) / 100)}
              onPress={() => setPercent(percent)}
            />
          </View>
        ))}
      </View>

      {inputError ? <Text style={[TYPE.label10, { color: THERMAL_COLORS.red }]}>{inputError}</Text> : null}

      {txError ? (
        <View style={[styles.notice, { borderLeftColor: THERMAL_COLORS.red }]}>
          <Text style={[TYPE.label10, { color: THERMAL_COLORS.red }]}>TRANSACTION FAILED</Text>
          <Text style={TYPE.body13}>{txError}</Text>
        </View>
      ) : null}
    </ThermalSheet>
  );
}

function Balance({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <View style={[styles.balance, highlight && { borderLeftColor: THERMAL_COLORS.orange }]}>
      <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>{label}</Text>
      <Text style={TYPE.display32}>{value}</Text>
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
  balance: {
    flex: 1,
    gap: 4,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACE.panel,
    paddingVertical: 8,
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
  },
});
