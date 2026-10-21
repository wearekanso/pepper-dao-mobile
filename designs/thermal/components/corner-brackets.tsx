import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TIMING } from '../motion';
import { PixelArt } from './pixel-art';

interface CornerBracketsProps {
  size?: number;
  /** Inset from the parent edges */
  inset?: number;
  /** Replays the focus-lock animation when changed */
  focusKey?: number;
}

/**
 * Camera viewfinder corners. They settle onto the subject once when the
 * screen gains focus.
 */
export function CornerBrackets({ size = 16, inset = 0, focusKey = 0 }: CornerBracketsProps) {
  const spread = useSharedValue(18);

  useEffect(() => {
    spread.value = 10;
    spread.value = withTiming(0, TIMING.reveal);
  }, [focusKey, spread]);

  const topLeft = useAnimatedStyle(() => ({ transform: [{ translateX: -spread.value }, { translateY: -spread.value }] }));
  const topRight = useAnimatedStyle(() => ({ transform: [{ translateX: spread.value }, { translateY: -spread.value }, { rotate: '90deg' }] }));
  const bottomRight = useAnimatedStyle(() => ({ transform: [{ translateX: spread.value }, { translateY: spread.value }, { rotate: '180deg' }] }));
  const bottomLeft = useAnimatedStyle(() => ({ transform: [{ translateX: -spread.value }, { translateY: spread.value }, { rotate: '-90deg' }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { margin: inset }]}>
      <Animated.View style={[styles.corner, { top: 0, left: 0 }, topLeft]}>
        <PixelArt name="corner" width={size} />
      </Animated.View>
      <Animated.View style={[styles.corner, { top: 0, right: 0 }, topRight]}>
        <PixelArt name="corner" width={size} />
      </Animated.View>
      <Animated.View style={[styles.corner, { bottom: 0, right: 0 }, bottomRight]}>
        <PixelArt name="corner" width={size} />
      </Animated.View>
      <Animated.View style={[styles.corner, { bottom: 0, left: 0 }, bottomLeft]}>
        <PixelArt name="corner" width={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
  },
});
