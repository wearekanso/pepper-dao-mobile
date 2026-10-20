import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { TIMING } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';
import { PixelArt } from './pixel-art';

/**
 * "Mode selector" tab bar: the active mode slides to the center under the ▲
 * marker like a camera mode dial, and the tick ruler rolls with it.
 * Tap a mode or swipe the bar horizontally to switch.
 */
export function ModeSelectorTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [widths, setWidths] = useState<Array<number>>(() => MODES.map(() => 0));

  const routeIndex = state.routes[state.index]?.name;
  const activeModeIndex = Math.max(0, MODES.findIndex((mode) => mode.route === routeIndex));
  const active = useSharedValue(activeModeIndex);

  useEffect(() => {
    active.value = withTiming(activeModeIndex, TIMING.enter);
  }, [active, activeModeIndex]);

  const centers = useMemo(() => {
    let cursor = 0;
    return widths.map((width) => {
      const center = cursor + width / 2;
      cursor += width + MODE_GAP;
      return center;
    });
  }, [widths]);

  const isMeasured = widths.every((width) => width > 0);

  function goTo(index: number) {
    const mode = MODES[index];
    if (!mode) return;

    const route = state.routes.find((item) => item.name === mode.route);
    if (!route) return;

    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.routes[state.index]?.name !== mode.route && !event.defaultPrevented) {
      void Haptics.selectionAsync();
      navigation.navigate(route.name, route.params);
    }
  }

  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const activeIndexRef = useRef(activeModeIndex);
  activeIndexRef.current = activeModeIndex;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 20,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -SWIPE_THRESHOLD) goToRef.current(activeIndexRef.current + 1);
          if (gesture.dx > SWIPE_THRESHOLD) goToRef.current(activeIndexRef.current - 1);
        },
      }),
    [],
  );

  const rowStyle = useAnimatedStyle(() => {
    if (!isMeasured) return { opacity: 0 };
    const center = interpolate(active.value, MODE_INDICES, centers, Extrapolation.CLAMP);
    return { opacity: 1, transform: [{ translateX: screenWidth / 2 - center }] };
  });

  const rulerStyle = useAnimatedStyle(() => {
    const center = isMeasured
      ? interpolate(active.value, MODE_INDICES, centers, Extrapolation.CLAMP)
      : 0;
    const shift = ((screenWidth / 2 - center) % TICK_PERIOD) - TICK_PERIOD;
    return { transform: [{ translateX: shift }] };
  });

  const barHeight = BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 26);

  return (
    <View style={[styles.container, { height: barHeight }]} {...panResponder.panHandlers}>
      <Svg width={screenWidth} height={barHeight} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="nav-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="0.35" stopColor={THERMAL_COLORS.void} stopOpacity={0.92} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={screenWidth} height={barHeight} fill="url(#nav-fade)" />
      </Svg>

      <View style={[styles.marker, { left: screenWidth / 2 - 7.5 }]}>
        <PixelArt name="activeMarker" />
      </View>

      <Animated.View style={[styles.modes, rowStyle]}>
        {MODES.map((mode, index) => (
          <Pressable
            key={mode.route}
            hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
            onPress={() => goTo(index)}
            onLayout={(event) => {
              const { width } = event.nativeEvent.layout;
              setWidths((previous) => {
                if (previous[index] === width) return previous;
                const next = [...previous];
                next[index] = width;
                return next;
              });
            }}
          >
            <ModeLabel label={mode.label} index={index} active={active} />
          </Pressable>
        ))}
      </Animated.View>

      <Animated.View style={[styles.ruler, rulerStyle]}>
        <Svg width={screenWidth + TICK_PERIOD * 2} height={6}>
          <Path d={buildTicks(screenWidth + TICK_PERIOD * 2)} fill="#FFFFFF" fillOpacity={0.3} />
        </Svg>
      </Animated.View>
    </View>
  );
}

interface ModeLabelProps {
  label: string;
  index: number;
  active: SharedValue<number>;
}

function ModeLabel({ label, index, active }: ModeLabelProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const closeness = interpolate(Math.abs(active.value - index), [0, 1], [1, 0], Extrapolation.CLAMP);
    return {
      color: interpolateColor(closeness, [0, 1], ['rgba(255,255,255,0.4)', THERMAL_COLORS.gold]),
      transform: [{ scale: 1 + (ACTIVE_SCALE - 1) * closeness }],
    };
  });

  return <Animated.Text style={[TYPE.meta18, animatedStyle]}>{label}</Animated.Text>;
}

function buildTicks(width: number): string {
  const parts: Array<string> = [];
  for (let x = 0; x <= width; x += 10) {
    const height = x % TICK_PERIOD === 0 ? 6 : 3;
    parts.push(`M${x} 0H${x + 2}V${height}H${x}Z`);
  }
  return parts.join('');
}

const MODES: Array<{ route: string; label: string }> = [
  { route: 'index', label: 'PULSE' },
  { route: 'governance', label: 'DECIDE' },
  { route: 'power', label: 'POWER' },
];

const MODE_INDICES = MODES.map((_, index) => index);
const ACTIVE_SCALE = 26 / 18;
const MODE_GAP = 38;
const TICK_PERIOD = 50;
const SWIPE_THRESHOLD = 40;
const BAR_CONTENT_HEIGHT = 78;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    top: 22,
  },
  modes: {
    position: 'absolute',
    top: 38,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: MODE_GAP,
  },
  ruler: {
    position: 'absolute',
    top: 72,
    left: 0,
  },
});
