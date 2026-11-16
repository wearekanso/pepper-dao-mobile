import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ARAGON_DAO_URL } from '@/config/aragon-governance';
import { STAKING_DEPOSITS_ENABLED } from '@/config/features';
import { useStaking } from '@/hooks/use-staking';
import { formatCompact, formatInteger } from '@/designs/thermal/lib/format';

import { HQ_COLORS, TYPE } from '../theme';
import { Notice, SectionLabel, Segmented } from './atoms';
import { HqButton } from './hq-button';
import { HqSheet } from './hq-sheet';

interface StakeSheetProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: StakeMode;
}

/**
 * Stake or unstake PEPPER. Same contract flow as the other designs
 * (approve → stake, or unstake) on top of useStaking.
 *
 * While STAKING_DEPOSITS_ENABLED is off it is unstake-only and points to
 * Aragon for locking: the old staking contract gives no voting power.
 */
export function StakeSheet({ visible, onClose, initialMode: requestedMode = 'stake' }: StakeSheetProps) {
  const initialMode: StakeMode = STAKING_DEPOSITS_ENABLED ? requestedMode : 'unstake';
  const [mode, setMode] = useState<StakeMode>(initialMode);
  const [amount, setAmount] = useState('');
  const {
    isLoading,
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
  } = useStaking();

  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setAmount('');
  }, [visible, initialMode]);

  const isPending = txStatus === 'pending';
  const isStake = mode === 'stake';
  const walletBalance = parseFloat(formattedWalletBalance) || 0;
  const stakedBalance = parseFloat(formattedStakedBalance) || 0;
  const maxAmount = isStake ? walletBalance : stakedBalance;
  const amountNum = parseFloat(amount) || 0;
  const requiresApproval = isStake && amountNum > 0 && needsApproval(amount);
  const isValid = amountNum > 0 && (isStake ? canStake(amount) || requiresApproval : canUnstake(amount));
  const inputError = amountNum > 0 && !isValid ? (isStake ? 'Not enough PEPPER in your wallet' : 'Not enough staked PEPPER') : null;

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
      if (result.success) finish();
      return;
    }

    const result = await unstake(amount);
    if (result.success) finish();
  }

  function finish() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    onClose();
  }

  const submitLabel = isPending
    ? 'SIGN IN WALLET…'
    : isStake
      ? requiresApproval
        ? 'APPROVE & STAKE'
        : 'STAKE'
      : 'UNSTAKE';

  return (
    <HqSheet
      visible={visible}
      onClose={onClose}
      locked={isPending}
      eyebrow="1F · SEED VAULT"
      title={isStake ? 'STAKE PEPPER' : 'UNSTAKE PEPPER'}
      subtitle={
        STAKING_DEPOSITS_ENABLED
          ? 'Staked PEPPER is your voting power in the Ministers Hall.'
          : 'Take your PEPPER out of the old staking contract.'
      }
      footer={
        <>
          <HqButton label="CANCEL" variant="secondary" disabled={isPending} onPress={onClose} />
          <HqButton
            label={submitLabel}
            loading={isPending}
            disabled={!isValid}
            style={{ flex: 1 }}
            onPress={() => void handleSubmit()}
          />
        </>
      }
    >
      {STAKING_DEPOSITS_ENABLED ? (
        <Segmented
          options={[
            { value: 'stake', label: 'STAKE' },
            { value: 'unstake', label: 'UNSTAKE' },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setAmount('');
          }}
        />
      ) : (
        <>
          <Notice
            title="STAKING HAS MOVED"
            message="Voting power now comes from locking PEPPER as vePEPPER on Aragon. The old staking contract no longer counts for votes, so unstake your PEPPER here and lock it there."
            color={HQ_COLORS.yellow}
          />
          <HqButton label="LOCK ON ARAGON" variant="secondary" onPress={() => void Linking.openURL(ARAGON_DAO_URL)} />
        </>
      )}

      <View style={styles.balances}>
        <Balance label="IN WALLET" value={isLoading ? '…' : formatCompact(walletBalance)} />
        <Balance label="STAKED" value={isLoading ? '…' : formatCompact(stakedBalance)} />
      </View>

      <SectionLabel label={isStake ? 'AMOUNT TO STAKE' : 'AMOUNT TO UNSTAKE'} right={`MAX ${formatInteger(maxAmount)}`} />

      <View style={[styles.input, inputError ? { borderColor: HQ_COLORS.red } : null]}>
        <TextInput
          value={amount ? formatInteger(amountNum) : ''}
          onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
          placeholder="0"
          placeholderTextColor={HQ_COLORS.dim}
          keyboardType="number-pad"
          editable={!isPending}
          style={[TYPE.display44, styles.inputText]}
        />
        <Text style={TYPE.label}>PEPPER</Text>
      </View>

      <View style={styles.percents}>
        {PERCENTS.map((percent) => {
          const isActive = maxAmount > 0 && amountNum === Math.floor((maxAmount * percent) / 100);
          return (
            <Pressable key={percent} onPress={() => setPercent(percent)} style={[styles.percent, isActive && styles.percentActive]}>
              <View pointerEvents="none">
                <Text style={[TYPE.display20, { color: isActive ? HQ_COLORS.green : HQ_COLORS.text }]}>
                  {percent === 100 ? 'MAX' : `${percent}%`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {inputError ? <Text style={[TYPE.meta, { color: HQ_COLORS.red }]}>{inputError}</Text> : null}
      {txError ? <Notice title="TRANSACTION FAILED" message={txError} /> : null}
    </HqSheet>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.balance}>
      <Text style={TYPE.label}>{label}</Text>
      <Text style={TYPE.display30}>{value}</Text>
    </View>
  );
}

export type StakeMode = 'stake' | 'unstake';

const PERCENTS = [25, 50, 75, 100];

const styles = StyleSheet.create({
  balances: {
    flexDirection: 'row',
    gap: 12,
  },
  balance: {
    flex: 1,
    gap: 2,
    padding: 12,
    backgroundColor: HQ_COLORS.surface,
    borderWidth: 1,
    borderColor: HQ_COLORS.line,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: HQ_COLORS.surface,
    borderWidth: 1,
    borderColor: HQ_COLORS.line,
  },
  inputText: {
    flex: 1,
    paddingVertical: 4,
  },
  percents: {
    flexDirection: 'row',
    gap: 8,
  },
  percent: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: HQ_COLORS.line,
  },
  percentActive: {
    borderColor: HQ_COLORS.green,
    backgroundColor: HQ_COLORS.surfaceHi,
  },
});
