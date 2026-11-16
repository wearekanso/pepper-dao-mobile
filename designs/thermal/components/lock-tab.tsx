import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { parseUnits } from 'viem';

import { PEPPER_DECIMALS } from '@/config/staking';
import { exitFeeToPercent } from '@/config/vepepper';
import type { VePepperStep, useVePepper } from '@/hooks/use-vepepper';
import { previewVotingPower } from '@/services/vepepper-api';

import { formatAmount, formatCompact, formatInteger, tokenToNumber } from '../lib/format';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { FilterChip } from './atoms';
import { HardShadow } from './panel';
import { getHeatBarColors, PixelBar } from './pixel-bar';
import { PixelButton } from './pixel-button';
import { SheetSection } from './thermal-sheet';

interface UseLockTabOptions {
  vePepper: ReturnType<typeof useVePepper>;
  /** Dev-only demo: demo wallet balance; submitting just closes */
  demo: boolean;
  onDone: (txHash: string | null) => void;
}

/**
 * LOCK tab of the stake sheet: amount, minimum, voting power preview and
 * the wallet prompts it takes (delegate on the first lock, approve, lock).
 * Returns the body and the footer button, since the sheet owns the footer.
 */
export function useLockTab({ vePepper, demo, onDone }: UseLockTabOptions): {
  body: ReactNode;
  footer: ReactNode;
  reset: () => void;
} {
  const [amount, setAmount] = useState('');
  const { account, txStatus, txStep, lock, getLockSteps } = vePepper;

  // Unknown until the account loads: no balance errors or MAX until then
  const isAccountReady = demo || Boolean(account);
  const walletBalance = demo ? DEMO_BALANCE : account ? tokenToNumber(account.walletBalance, PEPPER_DECIMALS) : 0;
  const minDeposit = demo ? DEMO_MIN_DEPOSIT : account ? tokenToNumber(account.minDeposit, PEPPER_DECIMALS) : 0;
  const amountNum = parseFloat(amount) || 0;
  const value = amount ? parseUnits(amount, PEPPER_DECIMALS) : BigInt(0);
  const isPending = txStatus === 'pending';

  const inputError =
    amountNum <= 0 || !isAccountReady
      ? null
      : amountNum > walletBalance
        ? 'NOT ENOUGH PEPPER IN WALLET'
        : amountNum < minDeposit
          ? `MINIMUM LOCK IS ${formatInteger(minDeposit)} PEPPER`
          : null;
  const isValid = amountNum > 0 && !inputError && (demo || Boolean(account));
  const steps = demo ? DEMO_STEPS : getLockSteps(value);

  const preview = useQuery({
    // Own prefix: a finished transaction invalidates ['vepepper'], previews never change
    queryKey: ['vepepper-preview', amount],
    queryFn: () => previewVotingPower(value),
    enabled: isValid,
    staleTime: Infinity,
  });

  // Curve and exit queue settings come from the contracts, not constants
  const atStart = preview.data ? tokenToNumber(preview.data.atStart, PEPPER_DECIMALS) : 0;
  const atMax = preview.data ? tokenToNumber(preview.data.atMax, PEPPER_DECIMALS) : 0;
  const startShare = atMax > 0 ? atStart / atMax : 0;
  const maxMultiplier = atStart > 0 ? Number((atMax / atStart).toFixed(1)) : 3;
  const exitFeePercent = exitFeeToPercent(account?.exitFeeBasisPoints ?? DEMO_EXIT_FEE_BASIS_POINTS);
  const exitCooldown = account?.exitCooldown ?? DEMO_EXIT_COOLDOWN;

  function reset() {
    setAmount('');
  }

  async function handleLock() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (demo) {
      setAmount('');
      onDone(null);
      return;
    }
    const result = await lock(amount);
    if (!result.success) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    onDone(result.txHash ?? null);
  }

  function setMax() {
    void Haptics.selectionAsync();
    if (!isAccountReady) return;
    setAmount(walletBalance > 0 ? String(Math.floor(walletBalance)) : '');
  }

  const body = (
    <>
      <Text style={TYPE.body14}>
        Lock PEPPER to get vePEPPER: your voting power on the PEPPER DAO. It grows the longer the lock stays.
      </Text>

      <SheetSection label="AMOUNT" right={`IN WALLET ${isAccountReady ? formatAmount(walletBalance) : '…'}`} />

      <View>
        <HardShadow />
        <View
          style={[
            styles.input,
            {
              borderColor: inputError
                ? STATUS_COLORS.negative.stroke
                : isValid
                  ? THERMAL_COLORS.gold
                  : amountNum > 0
                    ? THERMAL_COLORS.white
                    : THERMAL_COLORS.border,
            },
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

      <View style={styles.row}>
        <FilterChip
          label={`MIN ${formatCompact(minDeposit)}`}
          isActive={amountNum > 0 && amountNum === Math.ceil(minDeposit)}
          onPress={() => setAmount(String(Math.ceil(minDeposit)))}
          style={{ flex: 1 }}
        />
        <FilterChip
          label="MAX"
          isActive={walletBalance > 0 && amountNum === Math.floor(walletBalance)}
          onPress={setMax}
          style={{ flex: 1 }}
        />
      </View>

      {inputError ? <Text style={[TYPE.label12, { color: STATUS_COLORS.negative.text }]}>{inputError}</Text> : null}

      {isAccountReady && !inputError && amountNum === 0 && walletBalance < minDeposit ? (
        <Text style={[TYPE.body13, { color: INK.muted }]}>
          {`You need at least ${formatInteger(minDeposit)} PEPPER to lock.`}
        </Text>
      ) : null}

      {isValid ? (
        <View>
          <HardShadow />
          <View style={styles.preview}>
            <Text style={[TYPE.label12, { color: INK.muted }]}>YOUR VOTING POWER</Text>
            <View style={styles.between}>
              <PowerValue label="NOW" value={previewValue(preview.data?.atStart)} color={THERMAL_COLORS.gold} />
              <PowerValue
                label={preview.data ? `AFTER ${formatWeeks(preview.data.maxTime)}` : 'AT MAX'}
                value={previewValue(preview.data?.atMax)}
                color={THERMAL_COLORS.cream}
                align="right"
              />
            </View>
            <PixelBar colors={getHeatBarColors(startShare)} height={8} delay={100} />
            <View style={styles.between}>
              <Text style={[TYPE.label10, { color: THERMAL_COLORS.magenta }]}>1X</Text>
              <Text style={[TYPE.label10, { color: THERMAL_COLORS.goldSoft }]}>{`${maxMultiplier}X`}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {isValid ? (
        <View style={{ gap: 8 }}>
          <SheetSection label="IN YOUR WALLET" right={`${steps.length} ${steps.length === 1 ? 'STEP' : 'STEPS'}`} />
          <View style={styles.row}>
            {steps.map((step, index) => (
              <StepChip key={step} number={index + 1} label={STEP_LABELS[step]} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.note}>
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.amber }]}>EXIT ANY TIME</Text>
        <Text style={[TYPE.body13, { color: INK.muted }]}>
          {`The exit fee starts at ${exitFeePercent}% and drops to 0% over ${formatDays(exitCooldown)}.`}
        </Text>
      </View>
    </>
  );

  const footer = (
    <PixelButton
      label={isPending ? waitingLabel(txStep) : 'LOCK PEPPER >'}
      variant="gold"
      disabled={!isValid || isPending}
      style={{ flex: 1 }}
      onPress={() => void handleLock()}
    />
  );

  return { body, footer, reset };
}

interface PowerValueProps {
  label: string;
  value: string;
  color: string;
  align?: 'left' | 'right';
}

function PowerValue({ label, value, color, align = 'left' }: PowerValueProps) {
  return (
    <View style={{ gap: 2, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text style={[TYPE.label10, { color: INK.faint }]}>{label}</Text>
      <Text style={[TYPE.display24, { color }]}>{value}</Text>
    </View>
  );
}

/** One wallet prompt: gold number box + label */
function StepChip({ number, label }: { number: number; label: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.void }]}>{number}</Text>
      </View>
      <Text style={[TYPE.label12, { color: THERMAL_COLORS.white }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function previewValue(raw: bigint | undefined): string {
  return raw === undefined ? '…' : formatAmount(tokenToNumber(raw, PEPPER_DECIMALS));
}

/** 364 days → "52W" */
function formatWeeks(seconds: number): string {
  return `${Math.round(seconds / WEEK_SECONDS)}W`;
}

/** 604800 → "7 days" */
export function formatDays(seconds: number): string {
  const days = Math.round(seconds / 86_400);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Footer label while a wallet prompt is open: which step it is */
export function waitingLabel(step: VePepperStep | null): string {
  return step ? `SIGN ${STEP_LABELS[step]} IN WALLET…` : 'SIGN IN YOUR WALLET…';
}

export const STEP_LABELS: Record<VePepperStep, string> = {
  DELEGATE: 'DELEGATE',
  APPROVE: 'APPROVE',
  LOCK: 'LOCK',
  APPROVE_LOCK: 'APPROVE',
  EXIT: 'EXIT',
  CANCEL: 'CANCEL',
  WITHDRAW: 'WITHDRAW',
};

const DEMO_BALANCE = 12_400_000_000;
const DEMO_MIN_DEPOSIT = 8_888_888_888;
const DEMO_STEPS: Array<VePepperStep> = ['DELEGATE', 'APPROVE', 'LOCK'];
const DEMO_EXIT_FEE_BASIS_POINTS = 500;
const DEMO_EXIT_COOLDOWN = 7 * 86_400;
const WEEK_SECONDS = 7 * 86_400;

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
    gap: 12,
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
  inputText: {
    flex: 1,
    paddingVertical: 4,
  },
  preview: {
    gap: 10,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.gold,
  },
  step: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  stepNumber: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THERMAL_COLORS.gold,
  },
  note: {
    gap: 4,
    paddingLeft: 10,
    borderLeftWidth: SIZE.stroke,
    borderLeftColor: THERMAL_COLORS.amber,
  },
});
