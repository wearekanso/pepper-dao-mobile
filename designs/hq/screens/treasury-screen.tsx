import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePepperTokenMetrics } from '@/hooks/use-pepper-token-metrics';
import { useTreasuryChzTransactions } from '@/hooks/use-treasury-chz-transactions';
import { formatPepperAmount } from '@/lib/pepper-metrics';
import type { TreasuryWindow } from '@/services/chiliz-api';
import { useCountUp } from '@/designs/thermal/hooks/use-count-up';
import { formatCompact, formatInteger, shortenAddress, tokenToNumber } from '@/designs/thermal/lib/format';

import { Card, ListRow, Notice, SectionLabel, Segmented } from '../components/atoms';
import { HqButton } from '../components/hq-button';
import { HqScreen } from '../components/hq-screen';
import { EXPLORER_URL, HQ_IMAGES, TREASURY_ADDRESS } from '../lib/floors';
import { HQ_COLORS, TYPE } from '../theme';

/**
 * B1 · TREASURY — the DAO vault: CHZ on hand, holdings and every recent move.
 */
export function TreasuryScreen() {
  const [timeWindow, setTimeWindow] = useState<TreasuryWindow>('30d');
  const { metrics, isFetching, refetch } = usePepperTokenMetrics();
  const { transactions, isLoading, isError, refetch: refetchMoves } = useTreasuryChzTransactions(timeWindow, true);

  const chz = metrics ? tokenToNumber(metrics.treasuryChzBalance, 18) : 0;
  const animatedChz = useCountUp(chz, 1300);
  const moves = (transactions ?? []).slice(0, 8);

  function handleRefresh() {
    refetch();
    refetchMoves();
  }

  async function handleExplorer() {
    await openBrowserAsync(`${EXPLORER_URL}/address/${TREASURY_ADDRESS}`, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }

  return (
    <HqScreen
      hasTabBar={false}
      header={{ floor: 'B1', title: 'TREASURY' }}
      banner={HQ_IMAGES.treasury}
      refreshing={isFetching && Boolean(metrics)}
      onRefresh={handleRefresh}
    >
      <View style={{ gap: 2 }}>
        <Text style={TYPE.label}>IN THE VAULT</Text>
        <Text style={[TYPE.display56, { color: HQ_COLORS.yellow }]} numberOfLines={1} adjustsFontSizeToFit>
          {metrics ? formatInteger(animatedChz) : '–'}
        </Text>
        <Text style={TYPE.body13}>CHZ · managed by the Pepper Ministers</Text>
      </View>

      <Animated.View>
        <Card>
          <Text style={TYPE.label}>HOLDINGS</Text>
          <Holding swatch={HQ_COLORS.yellow} label="CHZ" value={metrics ? formatCompact(chz) : '–'} />
          <Holding
            swatch={HQ_COLORS.red}
            label="PEPPER"
            value={metrics ? formatCompact(tokenToNumber(metrics.treasuryBalance, metrics.decimals)) : '–'}
          />
          <Holding
            swatch={HQ_COLORS.muted}
            label="Pepper Treasury (CHZ)"
            value={metrics ? formatCompact(tokenToNumber(metrics.pepperTreasuryChzBalance, 18)) : '–'}
          />
          <Holding
            swatch={HQ_COLORS.muted}
            label="Daily buyback (CHZ)"
            value={metrics ? formatCompact(tokenToNumber(metrics.buybackChzBalance, 18)) : '–'}
          />
        </Card>
      </Animated.View>

      <View style={{ gap: 10 }}>
        <SectionLabel label="RECENT MOVES" />
        <Segmented
          options={WINDOWS}
          value={timeWindow}
          onChange={setTimeWindow}
        />
        <View>
          {isLoading ? <ActivityIndicator color={HQ_COLORS.green} style={{ paddingVertical: 20 }} /> : null}
          {isError ? <Notice title="COULD NOT LOAD MOVES" message="Pull down to try again." /> : null}
          {!isLoading && !isError && moves.length === 0 ? (
            <Text style={[TYPE.body13, { paddingVertical: 12 }]}>No CHZ moved in this window.</Text>
          ) : null}
          {moves.map((tx, index) => {
            const isIn = tx.direction === 'in';
            return (
              <ListRow
                key={tx.hash}
                title={`${isIn ? '+' : '−'} ${formatPepperAmount(tx.value, 18)} CHZ`}
                titleColor={isIn ? HQ_COLORS.green : HQ_COLORS.red}
                subtitle={`${isIn ? 'From' : 'To'} ${shortenAddress(isIn ? tx.from : tx.to)}`}
                right={formatTxDate(tx.timestamp)}
                isLast={index === moves.length - 1}
              />
            );
          })}
        </View>
      </View>

      <HqButton label="VIEW ON CHILISCAN" variant="secondary" onPress={() => void handleExplorer()} />
    </HqScreen>
  );
}

function Holding({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <View style={styles.holding}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text style={[TYPE.medium14, { flex: 1 }]}>{label}</Text>
      <Text style={TYPE.display22}>{value}</Text>
    </View>
  );
}

function formatTxDate(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`;
}

const WINDOWS: Array<{ value: TreasuryWindow; label: string }> = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '365d', label: '1Y' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const styles = StyleSheet.create({
  holding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatch: {
    width: 10,
    height: 10,
  },
});
