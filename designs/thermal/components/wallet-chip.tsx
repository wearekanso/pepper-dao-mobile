import { StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useWallet } from '@/contexts/wallet-context';
import { copyToClipboard } from '@/lib/clipboard';

import { shortenAddress } from '../lib/format';
import { THERMAL_COLORS, TYPE } from '../theme';
import { BlinkDot, Touchable } from './atoms';

/**
 * HUD wallet chip — shows the connected address (tap to copy) or a
 * blinking "CONNECT" prompt that opens the wallet modal.
 */
export function WalletChip() {
  const { address, isConnected, connect } = useWallet();

  function handlePress() {
    void Haptics.selectionAsync();
    if (isConnected && address) {
      void copyToClipboard(address);
      return;
    }
    void connect();
  }

  return (
    <Touchable onPress={handlePress} hitSlop={8} pressedOpacity={0.7} style={styles.chip}>
      {isConnected ? (
        <BlinkDot color={THERMAL_COLORS.gold} size={6} period={2400} />
      ) : (
        <BlinkDot color={THERMAL_COLORS.red} size={6} period={700} />
      )}
      <Text style={TYPE.meta18}>{isConnected && address ? shortenAddress(address) : 'CONNECT'}</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: THERMAL_COLORS.chip,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
});
