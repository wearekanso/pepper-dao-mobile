import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EXIT_FEE_BASIS_POINTS } from '@/config/vepepper';
import { PEPPER_DECIMALS } from '@/config/staking';
import type { useVePepper } from '@/hooks/use-vepepper';
import type { VePepperExit, VePepperLock } from '@/services/vepepper-api';

import { formatAmount, formatShortDate, tokenToNumber } from '../lib/format';
import { INK, SIZE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { formatDays, waitingLabel } from './lock-tab';
import { HardShadow } from './panel';
import { getHeatBarColors, PixelBar } from './pixel-bar';
import { PixelButton } from './pixel-button';
import { SheetSection } from './thermal-sheet';

interface LocksTabProps {
  vePepper: ReturnType<typeof useVePepper>;
  onDone: (txHash: string | null) => void;
}

/**
 * MY LOCKS tab of the stake sheet: each lock with its voting power and an
 * EXIT button, and each queued exit with its current fee, the time until
 * the fee is 0, WITHDRAW and CANCEL.
 */
export function LocksTab({ vePepper, onDone }: LocksTabProps) {
  const { account, txStatus, txStep, activateVotes, beginExit, cancelExit, withdraw } = vePepper;
  const now = useNowSeconds();
  // Exiting stops a lock's votes and starts the fee, so it asks once more
  const [confirmingExit, setConfirmingExit] = useState<bigint | null>(null);
  const [activeTokenId, setActiveTokenId] = useState<bigint | null>(null);
  const isPending = txStatus === 'pending';

  if (!account) return null;

  async function act(tokenId: bigint | null, action: () => ReturnType<typeof withdraw>) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveTokenId(tokenId);
    const result = await action();
    setActiveTokenId(null);
    setConfirmingExit(null);
    if (!result.success) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone(result.txHash ?? null);
  }

  const busyLabel = (tokenId: bigint | null) => (isPending && activeTokenId === tokenId ? waitingLabel(txStep) : null);
  const feePercent = account.exitFeeBasisPoints / (EXIT_FEE_BASIS_POINTS / 100);
  const hasNoVotes = account.delegatee === null && account.locks.length > 0;

  return (
    <>
      <View style={styles.row}>
        <Total
          label="VOTING POWER"
          value={formatAmount(tokenToNumber(account.votes, PEPPER_DECIMALS))}
          color={THERMAL_COLORS.gold}
          highlight
        />
        <Total label="LOCKS" value={String(account.locks.length)} color={THERMAL_COLORS.white} />
      </View>

      {hasNoVotes ? (
        <View style={[styles.box, { borderColor: THERMAL_COLORS.gold }]}>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>YOUR LOCKS DON&apos;T VOTE YET</Text>
          <Text style={TYPE.body14}>
            Locks only count for votes once your wallet delegates to itself. It takes one transaction.
          </Text>
          <PixelButton
            label={busyLabel(null) ?? 'ACTIVATE VOTING POWER >'}
            variant="outlineGold"
            disabled={isPending}
            onPress={() => void act(null, activateVotes)}
          />
        </View>
      ) : null}

      {account.exits.length > 0 ? <SheetSection label="EXITING" rightColor={THERMAL_COLORS.orange} right={`${account.exits.length}`} /> : null}
      {account.exits.map((exit) => (
        <ExitRow
          key={String(exit.tokenId)}
          exit={exit}
          now={now}
          disabled={isPending}
          busyLabel={busyLabel(exit.tokenId)}
          onWithdraw={() => void act(exit.tokenId, () => withdraw(exit.tokenId))}
          onCancel={() => void act(exit.tokenId, () => cancelExit(exit.tokenId))}
        />
      ))}

      <SheetSection label="YOUR LOCKS" />
      {account.locks.length === 0 ? (
        <Text style={[TYPE.body14, { color: INK.muted }]}>No locks yet. Lock PEPPER to get voting power.</Text>
      ) : null}
      {account.locks.map((lock) => (
        <LockRow
          key={String(lock.tokenId)}
          lock={lock}
          now={now}
          maxLockAge={account.maxLockAge}
          feePercent={feePercent}
          exitCooldown={account.exitCooldown}
          isConfirming={confirmingExit === lock.tokenId}
          disabled={isPending}
          busyLabel={busyLabel(lock.tokenId)}
          onExit={() => setConfirmingExit(lock.tokenId)}
          onConfirmExit={() => void act(lock.tokenId, () => beginExit(lock))}
          onKeep={() => setConfirmingExit(null)}
        />
      ))}
    </>
  );
}

interface LockRowProps {
  lock: VePepperLock;
  now: number;
  maxLockAge: number;
  exitCooldown: number;
  feePercent: number;
  isConfirming: boolean;
  disabled: boolean;
  busyLabel: string | null;
  onExit: () => void;
  onConfirmExit: () => void;
  onKeep: () => void;
}

function LockRow({
  lock,
  now,
  maxLockAge,
  feePercent,
  exitCooldown,
  isConfirming,
  disabled,
  busyLabel,
  onExit,
  onConfirmExit,
  onKeep,
}: LockRowProps) {
  const amount = tokenToNumber(lock.amount, PEPPER_DECIMALS);
  const power = tokenToNumber(lock.votingPower, PEPPER_DECIMALS);
  const multiplier = amount > 0 ? power / amount : 0;
  // Voting power grows from 1x to its cap over a year (curve maxTime)
  const age = Math.max(0, now - lock.start);
  const maxIn = maxLockAge - age;

  return (
    <View>
      <HardShadow />
      <View style={[styles.box, { borderColor: isConfirming ? THERMAL_COLORS.white : THERMAL_COLORS.border }]}>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>{`LOCK #${lock.tokenId}`}</Text>
          <Text style={[TYPE.label12, { color: INK.muted }]}>{`SINCE ${formatShortDate(new Date(lock.start * 1000).toISOString()).toUpperCase()}`}</Text>
        </View>
        <Text style={TYPE.display24}>{`${formatAmount(amount)} PEPPER`}</Text>
        <View style={styles.between}>
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>{`${formatAmount(power)} vePEPPER`}</Text>
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>{`${multiplier.toFixed(1)}X`}</Text>
        </View>
        <PixelBar colors={getHeatBarColors(maxLockAge > 0 ? age / maxLockAge : 1)} height={6} delay={100} />
        <Text style={[TYPE.label10, { color: INK.faint }]}>
          {maxIn > 0 ? `MAX POWER IN ${formatDuration(maxIn)}` : 'MAX POWER REACHED'}
        </Text>

        {isConfirming ? (
          <>
            <Text style={TYPE.body14}>
              {`This lock stops voting right away. Withdrawing now costs ${feePercent}%; the fee drops to 0% over ${formatDays(exitCooldown)}. You can cancel while it is exiting.`}
            </Text>
            <View style={styles.row}>
              <PixelButton label="KEEP" variant="outline" disabled={disabled} style={{ flex: 1 }} onPress={onKeep} />
              <PixelButton
                label={busyLabel ?? 'EXIT LOCK >'}
                variant="outlineRed"
                disabled={disabled}
                style={{ flex: 2 }}
                onPress={onConfirmExit}
              />
            </View>
          </>
        ) : (
          <PixelButton label="EXIT" variant="outline" size="small" disabled={disabled} onPress={onExit} />
        )}
      </View>
    </View>
  );
}

interface ExitRowProps {
  exit: VePepperExit;
  now: number;
  disabled: boolean;
  busyLabel: string | null;
  onWithdraw: () => void;
  onCancel: () => void;
}

function ExitRow({ exit, now, disabled, busyLabel, onWithdraw, onCancel }: ExitRowProps) {
  const amount = tokenToNumber(exit.amount, PEPPER_DECIMALS);
  const fee = tokenToNumber(exit.currentFee, PEPPER_DECIMALS);
  const feeFreeIn = exit.queuedAt + exit.cooldown - now;

  return (
    <View>
      <HardShadow />
      <View style={[styles.box, { borderColor: THERMAL_COLORS.orange }]}>
        <View style={styles.between}>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.orange }]}>{`LOCK #${exit.tokenId}`}</Text>
          <Text style={[TYPE.label12, { color: feeFreeIn > 0 ? THERMAL_COLORS.amber : STATUS_COLORS.positive.text }]}>
            {feeFreeIn > 0 ? `NO FEE IN ${formatDuration(feeFreeIn)}` : 'NO FEE'}
          </Text>
        </View>
        <Text style={TYPE.display24}>{`${formatAmount(amount)} PEPPER`}</Text>
        <PixelBar colors={getHeatBarColors(1 - Math.max(0, feeFreeIn) / Math.max(1, exit.cooldown))} height={6} delay={100} />
        <View style={styles.between}>
          <Text style={[TYPE.meta18, { color: fee > 0 ? THERMAL_COLORS.ember : STATUS_COLORS.positive.text }]}>
            {fee > 0 ? `FEE ${formatAmount(fee)}` : 'NO FEE'}
          </Text>
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>{`YOU GET ${formatAmount(amount - fee)}`}</Text>
        </View>
        <View style={styles.row}>
          <PixelButton label="CANCEL" variant="outline" disabled={disabled} style={{ flex: 1 }} onPress={onCancel} />
          <PixelButton
            label={busyLabel ?? 'WITHDRAW >'}
            variant="gold"
            disabled={disabled || !exit.canWithdraw}
            style={{ flex: 2 }}
            onPress={onWithdraw}
          />
        </View>
      </View>
    </View>
  );
}

interface TotalProps {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}

function Total({ label, value, color, highlight = false }: TotalProps) {
  return (
    <View style={{ flex: highlight ? 2 : 1 }}>
      <HardShadow />
      <View style={[styles.box, { borderColor: highlight ? THERMAL_COLORS.gold : THERMAL_COLORS.border }]}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
        <Text style={[TYPE.display24, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

/** Current time in seconds, ticking every minute for the fee countdowns */
function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** 35W, 3D 4H, 5H 20M, 12M */
function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 14) return `${Math.floor(days / 7)}W`;
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.max(1, Math.floor((seconds % 3_600) / 60));
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

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
    gap: 8,
  },
  box: {
    gap: 6,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
  },
});
