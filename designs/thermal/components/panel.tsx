import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { PRESS_SINK, usePressFeedback } from '../hooks/use-press-feedback';
import { fadeIn } from '../motion';
import { SIZE, SPACE, THERMAL_COLORS } from '../theme';

interface PanelProps {
  children: ReactNode;
  borderColor?: string;
  /** V2 live/active state: 2pt full white stroke (wins over `borderColor`) */
  live?: boolean;
  /** Pulses the border between `borderColor` and gold — used for live items */
  glow?: boolean;
  shadowColor?: string;
  /** Stagger index for the entrance animation */
  index?: number;
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * V2 card: opaque void fill, 2pt border (35% white, or full white when
 * `live`) and a hard 4pt pixel shadow.
 * The shadow is a real block (not platform shadow) so it renders the same on Android.
 * Tappable panels sink into their shadow while pressed.
 */
export function Panel({
  children,
  borderColor: borderColorProp = THERMAL_COLORS.border,
  live = false,
  glow = false,
  shadowColor = '#000000',
  index = 0,
  padding = SPACE.panel,
  gap = 12,
  style,
  onPress,
}: PanelProps) {
  const { pressed, pressHandlers } = usePressFeedback();
  const borderColor = live ? THERMAL_COLORS.white : borderColorProp;
  const glowValue = useSharedValue(0);

  useEffect(() => {
    if (!glow) return;
    glowValue.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow, glowValue]);

  const bodyStyle = useAnimatedStyle(() => ({
    borderColor: glow ? interpolateColor(glowValue.value, [0, 1], [borderColor, THERMAL_COLORS.gold]) : borderColor,
    transform: [{ translateX: pressed.value * PRESS_SINK }, { translateY: pressed.value * PRESS_SINK }],
  }));

  const body = (
    <Animated.View style={[styles.body, { padding, gap }, bodyStyle]}>{children}</Animated.View>
  );

  return (
    <Animated.View entering={fadeIn()} style={[styles.wrapper, style]}>
      <HardShadow color={shadowColor} />
      {onPress ? (
        <Pressable
          {...pressHandlers}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Animated.View>
  );
}

interface HardShadowProps {
  color?: string;
  offset?: number;
}

/**
 * Solid offset shadow drawn as an L-shaped strip outside the parent's
 * bottom-right edge, so translucent surfaces stay translucent.
 */
export function HardShadow({ color = '#000000', offset = SHADOW_OFFSET }: HardShadowProps) {
  return (
    <>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: offset, right: -offset, bottom: -offset, width: offset, backgroundColor: color }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: offset, right: 0, bottom: -offset, height: offset, backgroundColor: color }}
      />
    </>
  );
}

const SHADOW_OFFSET = SIZE.shadow;

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
  },
  body: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    overflow: 'hidden',
  },
});
