import * as Haptics from 'expo-haptics';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTreasuryChzTransactions } from '@/hooks/use-treasury-chz-transactions';
import { copyToClipboard } from '@/lib/clipboard';
import { formatPepperAmount, formatTimeAgoFromSeconds } from '@/lib/pepper-metrics';
import type { TreasuryChzTx, TreasuryWindow } from '@/services/chiliz-api';

import { shortenAddress } from '../lib/format';
import { FEEDBACK_HOLD_MS } from '../motion';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { DashedDivider, FilterChip, Tag, Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

interface TreasurySheetProps {
  visible: boolean;
  onClose: () => void;
  address: string;
}

/**
 * Treasury CHZ activity: every transfer in or out of the DAO treasury for a
 * chosen window. Tap an address to copy it.
 */
export function TreasurySheet({ visible, onClose, address }: TreasurySheetProps) {
  const [timeWindow, setTimeWindow] = useState<TreasuryWindow>('24h');
  const [copied, setCopied] = useState<string | null>(null);
  const { transactions, isLoading, isError, refetch } = useTreasuryChzTransactions(timeWindow, visible);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), FEEDBACK_HOLD_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy(value: string) {
    await copyToClipboard(value);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(value);
  }

  async function handleExplorer() {
    await openBrowserAsync(`${EXPLORER_URL}/address/${address}`, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }

  const list = transactions ?? [];
  const totals = list.reduce(
    (sum, tx) => (tx.direction === 'in' ? { ...sum, in: sum.in + 1 } : { ...sum, out: sum.out + 1 }),
    { in: 0, out: 0 },
  );

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      eyebrow="LIVE · TREASURY"
      title="TREASURY ACTIVITY"
      subtitle="Every CHZ moving in or out of the DAO treasury. Managed by vote."
      footer={
        <>
          <PixelButton label="VIEW ON CHILISCAN >" variant="gold" style={{ flex: 1 }} onPress={() => void handleExplorer()} />
          <PixelButton label="CLOSE" variant="outline" onPress={onClose} />
        </>
      }
    >
      <View style={styles.filters}>
        {WINDOWS.map((item) => (
          <FilterChip key={item.id} label={item.label} isActive={timeWindow === item.id} onPress={() => setTimeWindow(item.id)} />
        ))}
      </View>

      <SheetSection
        label="TRANSFERS"
        right={copied ? 'ADDRESS COPIED' : isLoading ? 'SCANNING…' : `${totals.in} IN · ${totals.out} OUT`}
        rightColor={copied ? THERMAL_COLORS.orange : undefined}
      />

      <View>
        <HardShadow />
        <View style={styles.list}>
          {isLoading ? (
            <View style={styles.state}>
              <ActivityIndicator color={THERMAL_COLORS.gold} />
            </View>
          ) : isError ? (
            <View style={styles.state}>
              <Text style={TYPE.meta18}>Signal lost</Text>
              <PixelButton label="RETRY" variant="outline" onPress={refetch} />
            </View>
          ) : list.length === 0 ? (
            <View style={styles.state}>
              <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]}>No transfers in this window.</Text>
            </View>
          ) : (
            list.map((tx, index) => (
              <View key={tx.hash}>
                <TxRow tx={tx} copied={copied} onCopy={(value) => void handleCopy(value)} />
                {index < list.length - 1 ? <DashedDivider /> : null}
              </View>
            ))
          )}
        </View>
      </View>
    </ThermalSheet>
  );
}

interface TxRowProps {
  tx: TreasuryChzTx;
  copied: string | null;
  onCopy: (value: string) => void;
}

function TxRow({ tx, copied, onCopy }: TxRowProps) {
  const isIn = tx.direction === 'in';
  const counterparty = isIn ? tx.from : tx.to;

  return (
    <View style={styles.row}>
      <View style={styles.between}>
        <View style={[styles.between, { gap: 8 }]}>
          <Tag label={isIn ? 'IN' : 'OUT'} color={isIn ? THERMAL_COLORS.cream : THERMAL_COLORS.blue} textColor={isIn ? THERMAL_COLORS.void : THERMAL_COLORS.white} />
          <Text style={[TYPE.display24, { color: isIn ? THERMAL_COLORS.cream : THERMAL_COLORS.white }]}>
            {`${isIn ? '+' : '-'}${formatPepperAmount(tx.value, 18)}`}
          </Text>
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>CHZ</Text>
        </View>
        <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.4)' }]}>{formatTimeAgoFromSeconds(tx.timestamp).toUpperCase()}</Text>
      </View>
      <Touchable onPress={() => onCopy(counterparty)} hitSlop={6}>
        <Text style={[TYPE.meta16, { color: copied === counterparty ? THERMAL_COLORS.orange : 'rgba(255,255,255,0.6)' }]}>
          {`${isIn ? 'FROM' : 'TO'} ${shortenAddress(counterparty)}${copied === counterparty ? ' · COPIED' : ''}`}
        </Text>
      </Touchable>
    </View>
  );
}

const WINDOWS: Array<{ id: TreasuryWindow; label: string }> = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '365d', label: '1Y' },
  { id: 'all', label: 'ALL' },
];

const EXPLORER_URL = 'https://chiliscan.com';

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  list: {
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  row: {
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    gap: 4,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  state: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: SPACE.rowX,
  },
});
