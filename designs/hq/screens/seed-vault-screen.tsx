import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useWallet } from '@/contexts/wallet-context';
import { useStaking } from '@/hooks/use-staking';
import { useCountUp } from '@/designs/thermal/hooks/use-count-up';
import { formatCompact, formatInteger } from '@/designs/thermal/lib/format';

import { Card, Notice, StatRow } from '../components/atoms';
import { ConnectCard } from '../components/connect-card';
import { HqButton } from '../components/hq-button';
import { HqScreen } from '../components/hq-screen';
import { StakeSheet, type StakeMode } from '../components/stake-sheet';
import { HQ_IMAGES } from '../lib/floors';
import { HQ_COLORS, TYPE } from '../theme';

/**
 * 1F · SEED VAULT — plant PEPPER (stake) to grow voting power, harvest
 * what is claimable, dig it back up (unstake).
 */
export function SeedVaultScreen() {
  const { isConnected } = useWallet();
  const [sheetMode, setSheetMode] = useState<StakeMode | null>(null);
  const {
    isLoading,
    isRefetching,
    refetch,
    error,
    txStatus,
    txError,
    formattedStakedBalance,
    formattedWalletBalance,
    formattedEarnedRewards,
    formattedTotalStaked,
    canClaim,
    claim,
  } = useStaking();

  const staked = parseFloat(formattedStakedBalance) || 0;
  const wallet = parseFloat(formattedWalletBalance) || 0;
  const claimable = parseFloat(formattedEarnedRewards) || 0;
  const totalStaked = parseFloat(formattedTotalStaked) || 0;
  const share = totalStaked > 0 ? (staked / totalStaked) * 100 : 0;
  const animatedStaked = useCountUp(staked, 1100);
  const isClaiming = txStatus === 'pending' && sheetMode === null;

  async function handleClaim() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await claim();
    if (result.success) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <HqScreen
      header={{ floor: '1F', title: 'SEED VAULT' }}
      banner={HQ_IMAGES.seed}
      refreshing={isRefetching}
      onRefresh={() => refetch()}
    >
      {!isConnected ? (
        <ConnectCard title="Plant your first seeds" message="Connect a wallet to stake PEPPER and earn voting power in the Ministers Hall." />
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text style={TYPE.label}>YOUR STAKE</Text>
            <Text style={[TYPE.display56, { color: HQ_COLORS.green }]} numberOfLines={1} adjustsFontSizeToFit>
              {isLoading ? '…' : formatInteger(animatedStaked)}
            </Text>
            <Text style={TYPE.body13}>{staked > 0 ? 'PEPPER staked · voting power active' : 'Nothing staked yet'}</Text>
          </View>

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
                disabled={!canClaim()}
                onPress={() => void handleClaim()}
              />
            </Card>
          </Animated.View>

          <Animated.View style={styles.actions}>
            <HqButton label="STAKE MORE" style={{ flex: 1 }} onPress={() => setSheetMode('stake')} />
            <HqButton label="UNSTAKE" variant="secondary" style={{ flex: 1 }} disabled={staked <= 0} onPress={() => setSheetMode('unstake')} />
          </Animated.View>

          {txError && sheetMode === null ? <Notice title="HARVEST FAILED" message={txError} /> : null}
        </>
      )}

      {error ? <Notice title="COULD NOT LOAD THE VAULT" message="Pull down to try again." /> : null}

      <Animated.View>
        <StatRow
          stats={[
            { label: 'TOTAL STAKED', value: totalStaked > 0 ? formatCompact(totalStaked) : '–', unit: 'PEPPER' },
            { label: 'YOUR SHARE', value: isConnected ? formatShare(share) : '–', unit: 'of the vault' },
            { label: 'IN WALLET', value: isConnected ? formatCompact(wallet) : '–', unit: 'PEPPER' },
          ]}
        />
      </Animated.View>

      <Text style={[TYPE.body13, { color: HQ_COLORS.dim }]}>
        Staked PEPPER is your voting power in the Ministers Hall.
      </Text>

      <StakeSheet visible={sheetMode !== null} initialMode={sheetMode ?? 'stake'} onClose={() => setSheetMode(null)} />
    </HqScreen>
  );
}

function formatShare(percent: number): string {
  if (percent <= 0) return '0%';
  if (percent < 0.01) return '<0.01%';
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

const styles = StyleSheet.create({
  harvest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
});
