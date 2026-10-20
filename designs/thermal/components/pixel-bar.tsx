import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { TIMING } from '../motion';
import { THERMAL_COLORS, VOTE_COLORS } from '../theme';

interface PixelBarProps {
  colors: Array<string>;
  height?: number;
  gap?: number;
  /** Delay before the segments start lighting up */
  delay?: number;
  /** Sweeps a highlight across the bar on a loop */
  shimmer?: boolean;
}

/**
 * Segmented bar whose cells light up one after another.
 */
export function PixelBar({ colors, height = 10, gap = 2, delay = 150, shimmer = false }: PixelBarProps) {
  const [width, setWidth] = useState(0);

  return (
    <View style={[styles.row, { gap, height }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {colors.map((color, index) => (
        <Segment key={index} color={color} index={index} delay={delay} />
      ))}
      {shimmer && width > 0 ? <Shimmer width={width} height={height} /> : null}
    </View>
  );
}

interface SegmentProps {
  color: string;
  index: number;
  delay: number;
}

function Segment({ color, index, delay }: SegmentProps) {
  const lit = useSharedValue(0);

  useEffect(() => {
    lit.value = 0;
    lit.value = withDelay(delay + index * 12, withTiming(1, TIMING.cell));
  }, [color, delay, index, lit]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + lit.value * 0.85,
  }));

  return <Animated.View style={[styles.segment, { backgroundColor: color }, animatedStyle]} />;
}

interface ShimmerProps {
  width: number;
  height: number;
}

function Shimmer({ width, height }: ShimmerProps) {
  const x = useSharedValue(-SHIMMER_WIDTH);

  useEffect(() => {
    x.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(width, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
          withTiming(width, { duration: 1800 }),
          withTiming(-SHIMMER_WIDTH, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [width, x]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.shimmer, { height }, animatedStyle]} />
  );
}

export interface VoteSplit {
  yes: number;
  no: number;
  abstain: number;
}

/**
 * Maps yes/no/abstain percentages onto `segments` cells (empty cells stay dim).
 */
export function getVoteBarColors(split: VoteSplit, segments: number = 24): Array<string> {
  const total = split.yes + split.no + split.abstain;
  if (total <= 0) {
    return Array.from({ length: segments }, () => THERMAL_COLORS.ghost);
  }

  const yes = Math.round((split.yes / 100) * segments);
  const no = Math.round((split.no / 100) * segments);
  const abstain = Math.max(0, Math.min(segments - yes - no, Math.round((split.abstain / 100) * segments)));

  return Array.from({ length: segments }, (_, index) => {
    if (index < yes) return VOTE_COLORS.YES;
    if (index < yes + no) return VOTE_COLORS.NO;
    if (index < yes + no + abstain) return VOTE_COLORS.ABSTAIN;
    return THERMAL_COLORS.ghost;
  });
}

/** Cold → hot gradient cells for REP / progress bars */
export function getHeatBarColors(progress: number, segments: number = 20): Array<string> {
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * segments);
  return Array.from({ length: segments }, (_, index) =>
    index < filled ? HEAT_GRADIENT[Math.min(HEAT_GRADIENT.length - 1, Math.floor((index / segments) * HEAT_GRADIENT.length))] : THERMAL_COLORS.ghost,
  );
}

const HEAT_GRADIENT = [
  THERMAL_COLORS.violet,
  THERMAL_COLORS.plum,
  THERMAL_COLORS.magenta,
  THERMAL_COLORS.crimson,
  THERMAL_COLORS.red,
  THERMAL_COLORS.ember,
  THERMAL_COLORS.orange,
  THERMAL_COLORS.amber,
  THERMAL_COLORS.gold,
  THERMAL_COLORS.goldSoft,
];

const SHIMMER_WIDTH = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SHIMMER_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
