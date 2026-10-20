import { ModalController, RouterController, WalletUtil } from '@reown/appkit-core-react-native';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { FEATURED_WALLETS } from '@/config/appkit';
import { setWalletConnectOverride } from '@/contexts/wallet-context';
import { telemetry } from '@/lib/telemetry';

import { DashedDivider, Tag, Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { ThermalSheet } from './thermal-sheet';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';

/**
 * Takes over "connect wallet" in the thermal design: every CONNECT button
 * opens this sheet instead of Reown's white list. Picking a featured wallet
 * jumps straight to Reown's connecting step for that wallet (which deep
 * links into the wallet app); everything else falls back to Reown's lists.
 * Figma: "Wallet Picker — thermal cüzdan seçimi".
 */
export function WalletPickerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => setWalletConnectOverride(() => setVisible(true)), []);

  const close = useCallback(() => setVisible(false), []);

  return (
    <>
      {children}
      <WalletPickerSheet visible={visible} onClose={close} />
    </>
  );
}

interface WalletPickerSheetProps {
  visible: boolean;
  onClose: () => void;
}

function WalletPickerSheet({ visible, onClose }: WalletPickerSheetProps) {
  async function openReown(view: 'Connect' | 'AllWallets', walletId?: string) {
    onClose();
    telemetry.trackWalletConnectOpened('reown');
    // iOS can't present Reown's modal while ours is still dismissing
    await new Promise((resolve) => setTimeout(resolve, SHEET_DISMISS_MS));
    await ModalController.open();
    if (walletId) {
      const wallet = WalletUtil.getWallet(walletId);
      // Unknown to the explorer (offline / not prefetched): leave the user on Reown's list
      if (wallet) RouterController.push('WalletConnect', { wallet });
      return;
    }
    if (view === 'AllWallets') RouterController.push('AllWallets');
  }

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      title="CONNECT WALLET"
      subtitle="Pick the wallet that holds your PEPPER."
      footer={<PixelButton label="ALL WALLETS · QR CODE" variant="outline" style={{ flex: 1 }} onPress={() => void openReown('AllWallets')} />}
    >
      <View>
        <HardShadow />
        <View style={styles.list}>
          {FEATURED_WALLETS.map((wallet, index) => (
            <View key={wallet.id}>
              <Touchable
                onPress={() => {
                  void Haptics.selectionAsync();
                  void openReown('Connect', wallet.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Connect with ${wallet.name}`}
                style={styles.row}
              >
                <View style={styles.logo}>
                  <Svg width={20} height={20} viewBox="0 0 20 20">
                    <Path d={LOGOS[wallet.key].d} fill={LOGOS[wallet.key].color} />
                  </Svg>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={TYPE.label12}>{wallet.name}</Text>
                  <Text style={[TYPE.meta16, { opacity: 0.6 }]}>{wallet.meta}</Text>
                </View>
                {index === 0 ? <Tag label="BEST" color={THERMAL_COLORS.gold} /> : null}
                <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
              </Touchable>
              {index < FEATURED_WALLETS.length - 1 ? <DashedDivider /> : null}
            </View>
          ))}
        </View>
      </View>

      <Touchable onPress={() => void openReown('Connect')} hitSlop={8} style={styles.social}>
        <Text style={[TYPE.meta16, { opacity: 0.45 }]}>{'Email & social login  >'}</Text>
      </Touchable>
    </ThermalSheet>
  );
}

/** ThermalSheet's slide-out (220ms) plus a beat for the native modal to unmount */
const SHEET_DISMISS_MS = 360;

/** Pixel marks in brand colours (20pt grid), same as the Figma draft */
const LOGOS: Record<(typeof FEATURED_WALLETS)[number]['key'], { d: string; color: string }> = {
  socios: { d: 'M4 0H16V4H4V0ZM0 4H4V8H0V4ZM4 8H16V12H4V8ZM16 12H20V16H16V12ZM4 16H16V20H4V16Z', color: '#E3001B' },
  metamask: { d: 'M0 0H4V4H0V0ZM16 0H20V4H16V0ZM0 4H8V8H0V4ZM12 4H20V8H12V4ZM0 8H20V12H0V8ZM4 12H16V16H4V12ZM8 16H12V20H8V16Z', color: '#F6851B' },
  okx: { d: 'M0 0H6V6H0V0ZM14 0H20V6H14V0ZM7 7H13V13H7V7ZM0 14H6V20H0V14ZM14 14H20V20H14V14Z', color: THERMAL_COLORS.white },
};

const styles = StyleSheet.create({
  list: {
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACE.rowX,
    paddingVertical: SPACE.rowY,
  },
  logo: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.borderSoft,
  },
  social: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
});
