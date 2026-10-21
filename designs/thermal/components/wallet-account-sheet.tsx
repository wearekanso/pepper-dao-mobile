import { useWalletInfo } from '@reown/appkit-react-native';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWallet } from '@/contexts/wallet-context';
import { useStaking } from '@/hooks/use-staking';
import { copyToClipboard } from '@/lib/clipboard';
import { fetchNativeBalance } from '@/services/chiliz-api';

import { DEMO_WALLET } from '../lib/demo-power';
import { formatCompact, shortenAddress, tokenToNumber } from '../lib/format';
import { FEEDBACK_HOLD_MS } from '../motion';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { ThermalSheet } from './thermal-sheet';

interface WalletAccountSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Dev-only demo screens: show the demo wallet; DISCONNECT just closes */
  demo?: boolean;
}

/**
 * YOUR WALLET — opened from the wallet chip once connected: address with
 * copy, PEPPER / vePEPPER / CHZ balances, explorer link and disconnect.
 */
export function WalletAccountSheet({ visible, onClose, demo = false }: WalletAccountSheetProps) {
  const wallet = useWallet();
  const address = demo ? DEMO_WALLET.address : wallet.address;
  const isWrongNetwork = demo ? false : wallet.isWrongNetwork;
  const { walletInfo } = useWalletInfo();
  const walletName = demo ? DEMO_WALLET.walletName : walletInfo?.name;
  const staking = useStaking();
  const isLoading = demo ? false : staking.isLoading;
  const [copied, setCopied] = useState(false);
  const { data: native } = useQuery({
    queryKey: ['thermal', 'nativeBalance', address],
    queryFn: () => fetchNativeBalance(address!),
    enabled: visible && !demo && Boolean(address),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), FEEDBACK_HOLD_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!address) return;
    await copyToClipboard(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
  }

  async function handleExplorer() {
    if (!address) return;
    await openBrowserAsync(`${EXPLORER_URL}/address/${address}`, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }

  async function handleDisconnect() {
    onClose();
    if (!demo) await wallet.disconnect();
  }

  const pepper = demo ? DEMO_WALLET.pepper : parseFloat(staking.formattedWalletBalance) || 0;
  const vePepper = demo ? DEMO_WALLET.vePepper : parseFloat(staking.formattedStakedBalance) || 0;
  const chz = demo ? DEMO_WALLET.chz : native ? tokenToNumber(native.balance, 18) : null;
  const balances = [
    { label: 'PEPPER', value: isLoading ? '…' : formatBalance(pepper), hint: 'in wallet' },
    { label: 'vePEPPER', value: isLoading ? '…' : formatBalance(vePepper), hint: 'voting power' },
    { label: 'CHZ', value: chz === null ? '…' : formatBalance(chz), hint: 'for gas' },
  ];

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      title="YOUR WALLET"
      footer={<PixelButton label="DISCONNECT" variant="outlineRed" style={{ flex: 1 }} onPress={() => void handleDisconnect()} />}
    >
      <View style={{ gap: 6 }}>
        <Text style={TYPE.display32}>{shortenAddress(address)}</Text>
        <View style={styles.between}>
          <View style={[styles.between, { gap: 6 }]}>
            <View style={[styles.dot, { backgroundColor: isWrongNetwork ? STATUS_COLORS.negative.stroke : THERMAL_COLORS.gold }]} />
            <Text style={[TYPE.meta18, { color: isWrongNetwork ? STATUS_COLORS.negative.text : INK.muted }]}>
              {isWrongNetwork ? 'WRONG NETWORK' : walletName ? `CHILIZ CHAIN · ${walletName.toUpperCase()}` : 'CHILIZ CHAIN'}
            </Text>
          </View>
          <Touchable onPress={() => void handleCopy()} hitSlop={8}>
            <Text style={[TYPE.meta18, { color: copied ? STATUS_COLORS.positive.text : THERMAL_COLORS.gold }]}>
              {copied ? 'COPIED' : 'COPY'}
            </Text>
          </Touchable>
        </View>
      </View>

      <View style={[styles.between, { gap: 12 }]}>
        {balances.map((item) => (
          <View key={item.label} style={{ flex: 1 }}>
            <HardShadow />
            <View style={styles.box}>
              <Text style={[TYPE.label12, { color: INK.muted }]}>{item.label}</Text>
              <Text style={TYPE.display24} numberOfLines={1} adjustsFontSizeToFit>
                {item.value}
              </Text>
              <Text style={[TYPE.meta18, { color: INK.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {item.hint}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View>
        <HardShadow />
        <Touchable onPress={() => void handleExplorer()} style={styles.link}>
          <Text style={[TYPE.label12, { flex: 1 }]}>VIEW ON CHILISCAN</Text>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
        </Touchable>
      </View>
    </ThermalSheet>
  );
}

/** Figma: full numbers below a million ("12,000", "230.5"), compact above ("12.4M") */
function formatBalance(value: number): string {
  if (Math.abs(value) >= 1_000_000) return formatCompact(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

const EXPLORER_URL = 'https://chiliscan.com';

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: {
    width: 6,
    height: 6,
  },
  box: {
    gap: 4,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACE.panel,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
});
