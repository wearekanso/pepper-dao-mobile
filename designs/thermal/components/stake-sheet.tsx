import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useStaking } from '@/hooks/use-staking';
import { useVePepper } from '@/hooks/use-vepepper';
import { TX_CANCELLED_MESSAGE } from '@/services/vepepper-api';

import { createDemoVePepperAccount, DEMO_OLD_STAKED } from '../lib/demo-power';
import { formatAmount, formatInteger } from '../lib/format';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { FilterChip, Touchable } from './atoms';
import { useLockTab } from './lock-tab';
import { LocksTab } from './locks-tab';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

/**
 * Lock PEPPER as vePEPPER and manage locks (useVePepper). Tabs:
 * - LOCK: new lock with voting power preview
 * - MY LOCKS: locks, exits with their fee, withdraw / cancel
 * - OLD STAKING: only while the wallet still has PEPPER in the retired
 *   staking contract, which gives no votes; unstake only
 */
export function StakeSheet({ visible, onClose, demo = false }: StakeSheetProps) {
  const [tab, setTab] = useState<Tab>('lock');
  const vePepper = useVePepper({ enabled: visible });
  const staking = useStaking();

  const oldStaked = demo ? DEMO_OLD_STAKED : parseFloat(staking.formattedStakedBalance) || 0;
  const hasOldStake = oldStaked > 0;
  const shownVePepper = demo ? demoVePepper(vePepper) : vePepper;
  const lockCount = shownVePepper.account ? shownVePepper.account.locks.length + shownVePepper.account.exits.length : 0;
  const isPending = vePepper.txStatus === 'pending' || staking.txStatus === 'pending';

  function handleClose() {
    // Reopening starts clean: no prefilled amount one tap away from a lock
    vePepper.resetTx();
    staking.resetTx();
    lockTab.reset();
    oldStakingTab.reset();
    setTab('lock');
    onClose();
  }

  function selectTab(next: Tab) {
    // Switching mid-transaction would reset txStatus and unlock the sheet
    if (isPending) return;
    vePepper.resetTx();
    setTab(next);
  }

  function handleDone(nextTab: Tab) {
    if (demo) {
      handleClose();
      return;
    }
    setTab(nextTab);
    // Unstaking moves PEPPER into the wallet: the lock tab needs the new balance
    if (nextTab === 'lock') void vePepper.refetch();
  }

  const lockTab = useLockTab({ vePepper, demo, onDone: () => handleDone('locks') });
  const oldStakingTab = useOldStakingTab({ staking, oldStaked, demo, onDone: () => handleDone('lock') });

  const footer = tab === 'lock' ? lockTab.footer : tab === 'old' ? oldStakingTab.footer : undefined;
  const loadError = !demo && vePepper.error && !vePepper.account;

  return (
    <ThermalSheet
      visible={visible}
      onClose={handleClose}
      locked={isPending}
      title={TITLES[tab]}
      footer={footer}
      fullHeight
    >
      <View style={styles.row}>
        <FilterChip label="LOCK" isActive={tab === 'lock'} onPress={() => selectTab('lock')} style={{ flex: 1 }} />
        <FilterChip
          label={lockCount > 0 ? `MY LOCKS · ${lockCount}` : 'MY LOCKS'}
          isActive={tab === 'locks'}
          onPress={() => selectTab('locks')}
          style={{ flex: 1 }}
        />
        {hasOldStake ? (
          <FilterChip label="OLD STAKING" isActive={tab === 'old'} onPress={() => selectTab('old')} style={{ flex: 1 }} />
        ) : null}
      </View>

      {loadError ? (
        <View style={styles.notice}>
          <Text style={[TYPE.body14, { color: INK.muted }]}>Unable to load your locks.</Text>
          <Touchable onPress={() => void vePepper.refetch()}>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>RETRY</Text>
          </Touchable>
        </View>
      ) : null}

      {tab === 'lock' ? lockTab.body : null}
      {tab === 'locks' ? (
        <LocksTab vePepper={shownVePepper} onDone={() => handleDone('locks')} />
      ) : null}
      {tab === 'old' ? oldStakingTab.body : null}

      {tab !== 'old' && vePepper.txError ? <TxError message={vePepper.txError} /> : null}
      {tab === 'old' && staking.txError ? <TxError message={staking.txError} /> : null}
    </ThermalSheet>
  );
}

/** Unstake from the retired staking contract (it gives no votes), then lock */
function useOldStakingTab({ staking, oldStaked, demo, onDone }: UseOldStakingTabOptions): {
  body: ReactNode;
  footer: ReactNode;
  reset: () => void;
} {
  const [amount, setAmount] = useState('');
  const amountNum = parseFloat(amount) || 0;
  const isPending = staking.txStatus === 'pending';
  const isValid = amountNum > 0 && (demo ? amountNum <= oldStaked : staking.canUnstake(amount));
  const inputError = amountNum > 0 && !isValid ? 'NOT ENOUGH STAKED PEPPER' : null;

  async function handleUnstake() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (demo) {
      setAmount('');
      onDone(null);
      return;
    }
    const result = await staking.unstake(amount);
    if (!result.success) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAmount('');
    onDone(result.txHash ?? null);
  }

  function setPercent(percent: number) {
    void Haptics.selectionAsync();
    setAmount(oldStaked > 0 ? String(Math.floor((oldStaked * percent) / 100)) : '');
  }

  const body = (
    <>
      <View style={styles.moved}>
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>STAKING HAS MOVED</Text>
        <Text style={TYPE.body14}>
          {`You have ${formatAmount(oldStaked)} PEPPER in the old staking contract. It no longer counts for votes: unstake it here, then lock it to get vePEPPER.`}
        </Text>
      </View>

      <SheetSection label="UNSTAKE" right={`STAKED ${formatAmount(oldStaked)}`} />

      <View>
        <HardShadow />
        <View
          style={[
            styles.input,
            {
              borderColor: inputError
                ? STATUS_COLORS.negative.stroke
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
        {PERCENTS.map((percent) => (
          <FilterChip
            key={percent}
            label={percent === 100 ? 'MAX' : `${percent}%`}
            isActive={oldStaked > 0 && amountNum === Math.floor((oldStaked * percent) / 100)}
            onPress={() => setPercent(percent)}
            style={{ flex: 1 }}
          />
        ))}
      </View>

      {inputError ? <Text style={[TYPE.label12, { color: STATUS_COLORS.negative.text }]}>{inputError}</Text> : null}
    </>
  );

  const footer = (
    <PixelButton
      label={isPending ? 'SIGN IN YOUR WALLET…' : 'UNSTAKE PEPPER >'}
      variant="gold"
      disabled={!isValid || isPending}
      style={{ flex: 1 }}
      onPress={() => void handleUnstake()}
    />
  );

  return { body, footer, reset: () => setAmount('') };
}

/** Demo screens: sample locks, and actions that succeed without a wallet */
function demoVePepper(vePepper: ReturnType<typeof useVePepper>): ReturnType<typeof useVePepper> {
  const succeed = () => Promise.resolve({ success: true });
  return {
    ...vePepper,
    account: createDemoVePepperAccount(),
    activateVotes: succeed,
    beginExit: succeed,
    cancelExit: succeed,
    withdraw: succeed,
  };
}

function TxError({ message }: { message: string }) {
  // Declining in the wallet isn't a failure: nothing was sent
  const isCancelled = message === TX_CANCELLED_MESSAGE;
  return (
    <View style={[styles.notice, isCancelled && styles.noticeCancelled]}>
      <Text style={[TYPE.label12, { color: isCancelled ? THERMAL_COLORS.cream : STATUS_COLORS.negative.text }]}>
        {isCancelled ? 'TRANSACTION CANCELLED' : 'TRANSACTION FAILED'}
      </Text>
      <Text style={[TYPE.body14, { color: INK.muted }]}>
        {isCancelled ? 'You declined it in your wallet. Nothing was sent.' : message}
      </Text>
    </View>
  );
}

type Tab = 'lock' | 'locks' | 'old';

const TITLES: Record<Tab, string> = {
  lock: 'LOCK PEPPER',
  locks: 'YOUR LOCKS',
  old: 'OLD STAKING',
};

const PERCENTS = [25, 50, 75, 100];

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  moved: {
    gap: 10,
    padding: SPACE.panel,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.gold,
  },
  notice: {
    gap: 4,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    borderWidth: SIZE.stroke,
    borderColor: STATUS_COLORS.negative.stroke,
  },
  noticeCancelled: {
    borderColor: THERMAL_COLORS.border,
  },
});

interface StakeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Dev-only demo screens: demo wallet balance; submitting just closes */
  demo?: boolean;
}

interface UseOldStakingTabOptions {
  staking: ReturnType<typeof useStaking>;
  oldStaked: number;
  /** Dev-only demo: checks the amount against the demo stake; submitting just closes */
  demo: boolean;
  onDone: (txHash: string | null) => void;
}
