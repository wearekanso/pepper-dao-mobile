import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { VoteOption } from '@/types/governance';

import { formatDayMonth } from '../lib/format';
import { DURATION, TIMING } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';
import { HardShadow } from './panel';

interface VoteStampProps {
  option: Exclude<VoteOption, 'NONE'>;
  /** Shown for fresh votes; the vote date isn't indexed for older votes */
  date?: Date;
  /** Slam the stamp in (fresh vote) instead of just showing it */
  slam: boolean;
  /** `mini` sits in the results header; `large` is the hero of the vote-recorded sheet */
  size?: 'mini' | 'large';
}

/**
 * Red rubber "VOTED" stamp in the results card header. On a fresh vote it
 * slams down from above with a heavy haptic; otherwise it fades in already
 * pressed on.
 */
export function VoteStamp({ option, date, slam, size = 'mini' }: VoteStampProps) {
  const isLarge = size === 'large';
  const progress = useSharedValue(slam ? 0 : 1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!slam) {
      opacity.value = withTiming(1, { duration: DURATION.emphasis });
      progress.value = 1;
      return;
    }

    progress.value = 0;
    opacity.value = withTiming(1, { duration: 120 });
    progress.value = withSequence(
      withTiming(0.82, { duration: 230, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(impact)();
      }),
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
    );
  }, [slam, option, progress, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = 2.6 - 1.6 * progress.value;
    return {
      opacity: opacity.value,
      transform: [{ rotate: `${STAMP_TILT + 12 * (1 - progress.value)}deg` }, { scale }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, animatedStyle]}>
      <View style={[styles.inner, isLarge && styles.innerLarge]}>
        <Text style={[isLarge ? TYPE.display40 : TYPE.meta18, styles.ink]}>VOTED</Text>
        <Text style={[TYPE.label12, styles.ink]}>{date ? `${option} · ${formatDayMonth(date.toISOString())}` : option}</Text>
      </View>
    </Animated.View>
  );
}

interface RepStickerProps {
  points: number;
  delay?: number;
}

/** Gold "+10 REP" sticker that pops in after the stamp lands */
export function RepSticker({ points, delay = 420 }: RepStickerProps) {
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.value = withDelay(delay, withTiming(1, TIMING.enter));
  }, [delay, pop]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: (1 - pop.value) * 6 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={animatedStyle}>
      <View>
        <HardShadow offset={3} />
        <View style={styles.sticker}>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.void }]}>{`+${points} REP`}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** Resting tilt of the stamp (deg) */
const STAMP_TILT = 4;

function impact() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

const styles = StyleSheet.create({
  stamp: {
    borderWidth: 3,
    borderColor: THERMAL_COLORS.red,
    padding: 4,
    shadowColor: THERMAL_COLORS.red,
    shadowOpacity: 0.85,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: THERMAL_COLORS.red,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  innerLarge: {
    flexDirection: 'column',
    gap: 2,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  ink: {
    color: THERMAL_COLORS.red,
  },
  sticker: {
    backgroundColor: THERMAL_COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
