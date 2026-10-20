import * as Haptics from 'expo-haptics';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWallet } from '@/contexts/wallet-context';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';

import { Touchable } from '../components/atoms';
import { HeatBurst, Sparks } from '../components/heat-burst';
import { HeatPepper } from '../components/pixel-art';
import { PixelButton } from '../components/pixel-button';
import { getHeatLevel } from '../lib/heat-levels';
import { fadeIn, revealAt } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';

interface WalletLinkScreenProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Post-onboarding wallet prompt, staged like a level-up: linking a wallet is
 * the first heat step (BELL → JALAPEÑO). Figma: "Wallet Connect B — tam ekran".
 */
export function WalletLinkScreen({ visible, onDismiss }: WalletLinkScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connect } = useWallet();

  function handleConnect() {
    void connect();
  }

  function handleExplore() {
    void Haptics.selectionAsync();
    StorageService.setBoolean(STORAGE_KEYS.ONBOARDING_DISMISSED, true);
    onDismiss();
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleExplore}>
      <Animated.View entering={fadeIn()} style={[styles.root, { width, height }]}>
        <HeatBurst width={width} height={height} centerY={0.38} />
        <Sparks width={width} height={height} />

        <View style={[styles.hud, { top: insets.top + 8 }]}>
          <View style={styles.tag}>
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>LINK WALLET · +10 REP</Text>
          </View>
          <Touchable onPress={handleExplore} hitSlop={12} style={styles.close}>
            <Text style={TYPE.label12}>X</Text>
          </Touchable>
        </View>

        <View style={[styles.center, { top: height * 0.15 }]}>
          <Animated.View entering={revealAt(0)}>
            <View style={{ position: 'absolute', left: 6, top: 6 }}>
              <HeatPepper level={LEVEL} silhouette={THERMAL_COLORS.void} />
            </View>
            <HeatPepper level={LEVEL} />
          </Animated.View>

          <Animated.Text entering={revealAt(1)} style={[TYPE.display58, styles.ink, styles.centered]}>
            {'LINK YOUR\nWALLET'}
          </Animated.Text>
          <Animated.Text entering={revealAt(2)} style={[TYPE.meta26, styles.ink]}>
            {'GUEST  >  MEMBER'}
          </Animated.Text>

          <Animated.View entering={revealAt(3)}>
            <View>
              <View style={styles.cardShadow} />
              <View style={styles.card}>
                <Text style={[TYPE.display32, { color: THERMAL_COLORS.cream }]}>{`${FROM.name} → ${LEVEL.name}`}</Text>
                <Text style={[TYPE.meta20, { color: THERMAL_COLORS.orange }]}>VOTE · STAKE · EARN REP</Text>
                <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>CHILIZ CHAIN · WALLETCONNECT</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View entering={revealAt(4)} style={[styles.actions, { bottom: insets.bottom + 24 }]}>
          <PixelButton label="CONNECT WALLET >" variant="void" onPress={handleConnect} />
          <PixelButton label="EXPLORE AS GUEST" variant="paper" onPress={handleExplore} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const FROM = getHeatLevel('OBSERVER');
const LEVEL = getHeatLevel('MEMBER');

const styles = StyleSheet.create({
  root: {
    backgroundColor: THERMAL_COLORS.void,
    overflow: 'hidden',
  },
  hud: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    backgroundColor: THERMAL_COLORS.void,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  close: {
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
    backgroundColor: THERMAL_COLORS.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
  },
  centered: {
    textAlign: 'center',
  },
  ink: {
    color: THERMAL_COLORS.void,
  },
  card: {
    backgroundColor: THERMAL_COLORS.void,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  cardShadow: {
    position: 'absolute',
    left: 6,
    top: 6,
    right: -6,
    bottom: -6,
    backgroundColor: THERMAL_COLORS.red,
  },
  actions: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 10,
  },
});
