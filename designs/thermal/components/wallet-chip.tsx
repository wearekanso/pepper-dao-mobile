import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useWallet } from '@/contexts/wallet-context';

import { shortenAddress } from '../lib/format';
import { THERMAL_COLORS, TYPE } from '../theme';
import { BlinkDot, Touchable } from './atoms';
import { WalletAccountSheet } from './wallet-account-sheet';

/**
 * HUD wallet chip — shows the connected address (tap for YOUR WALLET) or
 * a blinking "CONNECT" prompt that opens the wallet picker.
 */
export function WalletChip() {
  const { address, isConnected, connect } = useWallet();
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  function handlePress() {
    void Haptics.selectionAsync();
    if (isConnected && address) {
      setIsAccountOpen(true);
      return;
    }
    void connect();
  }

  return (
    <>
      <Touchable onPress={handlePress} hitSlop={8} pressedOpacity={0.7} style={styles.chip}>
        {isConnected ? (
          <BlinkDot color={THERMAL_COLORS.gold} size={6} period={2400} />
        ) : (
          <BlinkDot color={THERMAL_COLORS.red} size={6} period={700} />
        )}
        <Text style={TYPE.meta18}>{isConnected && address ? shortenAddress(address) : 'CONNECT'}</Text>
      </Touchable>
      <WalletAccountSheet visible={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
});
