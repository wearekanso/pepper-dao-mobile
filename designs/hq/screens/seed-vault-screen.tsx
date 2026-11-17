import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ARAGON_DAO_URL } from '@/config/aragon-governance';
import { PEPPER_DECIMALS } from '@/config/staking';
import { useWallet } from '@/contexts/wallet-context';
import { useStaking } from '@/hooks/use-staking';
import { useVePepper } from '@/hooks/use-vepepper';
import { useCountUp } from '@/designs/thermal/hooks/use-count-up';
import { formatCompact, formatInteger, shortenAddress, tokenToNumber } from '@/designs/thermal/lib/format';

import { Card, Notice, SectionLabel, StatRow } from '../components/atoms';
import { ConnectCard } from '../components/connect-card';
import { HqButton } from '../components/hq-button';
import { HqScreen } from '../components/hq-screen';
import { StakeSheet } from '../components/stake-sheet';
import { HQ_IMAGES } from '../lib/floors';
import { HQ_COLORS, TYPE } from '../theme';

/**
 * 1F · SEED VAULT — voting power from PEPPER locked as vePEPPER (locking
 * happens on Aragon). PEPPER still in the old staking contract gives no
 * votes: it can only be harvested and unstaked here.
 */
export function SeedVaultScreen() {
  const { address, isConnected } = useWallet();
  const [isUnstakeOpen, setIsUnstakeOpen] = useState(false);
  const vePepper = useVePepper();
  const staking = useStaking();

  const account = vePepper.account;
  const votes = account ? tokenToNumber(account.votes, PEPPER_DECIMALS) : 0;
  const locked = account ? tokenToNumber(sumLocked(account.locks), PEPPER_DECIMALS) : 0;
  const hasLocks = Boolean(account && account.locks.length > 0);
  const hasInactiveVotes = hasLocks && account?.delegatee === null;
  // Locks follow the delegatee: votes delegated to someone else show as 0 here
  const delegatedTo = hasLocks && account?.delegatee && !isSameAddress(account.delegatee, address) ? account.delegatee : null;
  const animatedVotes = useCountUp(votes, 1100);

  const oldStaked = parseFloat(staking.formattedStakedBalance) || 0;
  const wallet = parseFloat(staking.formattedWalletBalance) || 0;
  const claimable = parseFloat(staking.formattedEarnedRewards) || 0;
  const hasOldStake = oldStaked > 0 || claimable > 0;

  const isActivating = vePepper.txStatus === 'pending';
  const isClaiming = staking.txStatus === 'pending' && !isUnstakeOpen;

  async function handleClaim() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await staking.claim();
    if (result.success) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleActivate() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await vePepper.activateVotes();
    if (result.success) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <HqScreen
      header={{ floor: '1F', title: 'SEED VAULT' }}
      banner={HQ_IMAGES.seed}
      refreshing={vePepper.isRefetching || staking.isRefetching}
      onRefresh={() => {
        void vePepper.refetch();
        void staking.refetch();
      }}
    >
      {!isConnected ? (
        <ConnectCard title="Plant your first seeds" message="Connect a wallet to see your vePEPPER voting power in the Ministers Hall." />
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text style={TYPE.label}>YOUR VOTING POWER</Text>
            <Text style={[TYPE.display56, { color: HQ_COLORS.green }]} numberOfLines={1} adjustsFontSizeToFit>
              {vePepper.isLoading ? '…' : formatInteger(animatedVotes)}
            </Text>
            <Text style={TYPE.body13}>
              {locked > 0 ? `${formatCompact(locked)} PEPPER locked as vePEPPER` : 'Nothing locked yet'}
            </Text>
            {delegatedTo ? (
              <Text style={[TYPE.body13, { color: HQ_COLORS.muted }]}>{`Votes delegated to ${shortenAddress(delegatedTo)}`}</Text>
            ) : null}
          </View>

          {hasInactiveVotes ? (
            <View style={{ gap: 10 }}>
              <Notice
                title="VOTES NOT ACTIVE"
                message="Your locks give no votes until you delegate them to yourself. One wallet prompt."
                color={HQ_COLORS.yellow}
              />
              <HqButton label="ACTIVATE VOTES" loading={isActivating} disabled={isActivating} onPress={() => void handleActivate()} />
            </View>
          ) : null}

          <HqButton label="LOCK ON ARAGON" onPress={() => void Linking.openURL(ARAGON_DAO_URL)} />

          {vePepper.txError ? <Notice title="ACTIVATION FAILED" message={vePepper.txError} /> : null}

          {hasOldStake ? (
            <View style={{ gap: 10 }}>
              <SectionLabel label="OLD STAKING CONTRACT" />
              <Text style={[TYPE.body13, { color: HQ_COLORS.dim }]}>
                {`${formatCompact(oldStaked)} PEPPER here gives no voting power. Unstake it, then lock it on Aragon.`}
              </Text>
              <Animated.View>
                <Card style={styles.harvest} accent={claimable > 0 ? HQ_COLORS.yellow : undefined}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={TYPE.label}>READY TO HARVEST</Text>
                    <Text style={[TYPE.display32, { color: HQ_COLORS.yellow }]} numberOfLines={1} adjustsFontSizeToFit>
                      {`${formatCompact(claimable)} PEPPER`}
                    </Text>
                  </View>
                  <HqButton
                    label="HARVEST"
                    size="medium"
                    loading={isClaiming}
                    disabled={!staking.canClaim()}
                    onPress={() => void handleClaim()}
                  />
                </Card>
              </Animated.View>
              <HqButton label="UNSTAKE" variant="secondary" disabled={oldStaked <= 0} onPress={() => setIsUnstakeOpen(true)} />
              {staking.txError && !isUnstakeOpen ? <Notice title="HARVEST FAILED" message={staking.txError} /> : null}
            </View>
          ) : null}
        </>
      )}

      {vePepper.error && !account ? <Notice title="COULD NOT LOAD THE VAULT" message="Pull down to try again." /> : null}
      {isConnected && staking.error ? (
        <Notice title="COULD NOT LOAD THE OLD STAKING CONTRACT" message="PEPPER you have there may not show. Pull down to try again." />
      ) : null}

      <Animated.View>
        <StatRow
          stats={[
            { label: 'LOCKED', value: isConnected && account ? formatCompact(locked) : '–', unit: 'vePEPPER' },
            { label: 'OLD STAKE', value: isConnected ? formatCompact(oldStaked) : '–', unit: 'PEPPER' },
            { label: 'IN WALLET', value: isConnected ? formatCompact(wallet) : '–', unit: 'PEPPER' },
          ]}
        />
      </Animated.View>

      <Text style={[TYPE.body13, { color: HQ_COLORS.dim }]}>
        Voting power comes from PEPPER locked as vePEPPER. The old staking contract no longer counts.
      </Text>

      <StakeSheet visible={isUnstakeOpen} initialMode="unstake" onClose={() => setIsUnstakeOpen(false)} />
    </HqScreen>
  );
}

function isSameAddress(a: string, b: string | undefined): boolean {
  return Boolean(b) && a.toLowerCase() === b?.toLowerCase();
}

function sumLocked(locks: Array<{ amount: bigint }>): bigint {
  return locks.reduce((total, lock) => total + lock.amount, BigInt(0));
}

const styles = StyleSheet.create({
  harvest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
