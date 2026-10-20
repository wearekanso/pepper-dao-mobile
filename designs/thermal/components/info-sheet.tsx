import * as Haptics from 'expo-haptics';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { copyToClipboard } from '@/lib/clipboard';

import { shortenAddress } from '../lib/format';
import { FEEDBACK_HOLD_MS } from '../motion';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { Touchable } from './atoms';
import { HardShadow } from './panel';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

interface InfoSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  /** Contract / wallet the readout comes from — tap to copy */
  address?: string;
}

/**
 * Explainer sheet for a readout (treasury, staking, CEX fund): what it is,
 * plus the on-chain address with copy and explorer shortcuts.
 */
export function InfoSheet({ visible, onClose, title, message, address }: InfoSheetProps) {
  const [copied, setCopied] = useState(false);

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

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        address ? (
          <PixelButton label="VIEW ON CHILISCAN >" variant="gold" style={{ flex: 1 }} onPress={() => void handleExplorer()} />
        ) : undefined
      }
    >
      <Text style={TYPE.body14}>{message}</Text>

      {address ? (
        <>
          <SheetSection label="ON-CHAIN ADDRESS" right={copied ? 'COPIED' : 'TAP TO COPY'} rightColor={copied ? THERMAL_COLORS.orange : undefined} />
          <View>
            <HardShadow />
            <Touchable onPress={() => void handleCopy()} style={styles.address}>
              <View style={{ width: 8, height: 8, backgroundColor: copied ? THERMAL_COLORS.orange : THERMAL_COLORS.gold }} />
              <Text style={[TYPE.meta18, { flex: 1 }]}>{shortenAddress(address)}</Text>
              <Text style={[TYPE.label10, { color: copied ? THERMAL_COLORS.orange : 'rgba(255,255,255,0.6)' }]}>
                {copied ? 'COPIED' : 'COPY'}
              </Text>
            </Touchable>
          </View>
        </>
      ) : null}
    </ThermalSheet>
  );
}

const EXPLORER_URL = 'https://chiliscan.com';

const styles = StyleSheet.create({
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
});
