import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { INK, SIZE, TYPE } from '../theme';
import { WalletChip } from './wallet-chip';

interface TabHeaderProps {
  /** Tab name, e.g. "PULSE" */
  title: string;
  /** One-line description under the title */
  subtitle: string;
  /** Right-hand slot; defaults to the wallet chip */
  accessory?: ReactNode;
}

/**
 * V2 tab screen header (PULSE / DECIDE / POWER): Display 40 title with the
 * wallet chip on the right, then a Meta 18 line. Always 66pt tall so the
 * three tabs line up when switching.
 */
export function TabHeader({ title, subtitle, accessory = <WalletChip /> }: TabHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={TYPE.display40} numberOfLines={1}>
          {title}
        </Text>
        {accessory}
      </View>
      <Text style={[TYPE.meta18, styles.subtitle]} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: SIZE.tabHeader,
    justifyContent: 'space-between',
  },
  titleRow: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtitle: {
    color: INK.body,
    // Hard 2pt shadow keeps the line readable over the heat background
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
});
