import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { SIZE, SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { Touchable } from './atoms';

interface ThermalNavBarProps {
  /** Compact title, shown once the large title has scrolled under the bar */
  title: string;
  onBack: () => void;
  /** `back` for pushed screens, `close` for screens presented as a modal */
  icon?: 'back' | 'close';
  /** Right-hand slot (e.g. "READ 3 / 7"); a string renders in gold Meta 18 */
  accessory?: ReactNode;
  scrollY: SharedValue<number>;
  /** Scroll offset at which the bar has fully filled in (≈ large title height) */
  collapseAt?: number;
  /** Space above the bar; defaults to the status bar inset */
  topInset?: number;
}

/**
 * Fixed top bar for pushed thermal screens (Figma: "Nav Bar / Thermal").
 * At the top of the page it is transparent and the screen shows its own
 * large title; as the content scrolls under it the bar fills with void,
 * gains a 2pt rule and fades in a compact centred title.
 */
export function ThermalNavBar({
  title,
  onBack,
  icon = 'back',
  accessory,
  scrollY,
  collapseAt = 44,
  topInset,
}: ThermalNavBarProps) {
  const insets = useSafeAreaInsets();
  const top = topInset ?? insets.top;

  const fillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapseAt * 0.4, collapseAt], [0, 1], 'clamp'),
  }));
  const titleStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [collapseAt * 0.7, collapseAt * 1.2], [0, 1], 'clamp');
    return { opacity: progress, transform: [{ translateY: (1 - progress) * 6 }] };
  });

  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingTop: top, height: top + NAV_BAR_HEIGHT }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, fillStyle]} />

      <View pointerEvents="box-none" style={styles.row}>
        <Touchable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          hitSlop={4}
          pressedOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={icon === 'close' ? 'Close' : 'Back'}
          style={styles.button}
        >
          <Svg width={9} height={icon === 'close' ? 9 : 15} viewBox={icon === 'close' ? '0 0 9 9' : '0 0 9 15'}>
            <Path d={icon === 'close' ? CLOSE_PATH : CHEVRON_PATH} fill={THERMAL_COLORS.white} />
          </Svg>
        </Touchable>

        <Animated.View pointerEvents="none" style={[styles.title, titleStyle]}>
          <Text style={TYPE.label14} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>

        <View style={styles.accessory}>
          {typeof accessory === 'string' ? (
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]} numberOfLines={1}>
              {accessory}
            </Text>
          ) : (
            accessory
          )}
        </View>
      </View>
    </View>
  );
}

/** Bar height below the top inset */
export const NAV_BAR_HEIGHT = 44;

const BUTTON_SIZE = SIZE.navButton;
const TITLE_INSET = 84;

/** Pixel "<" (3pt cells), same as the Figma component */
const CHEVRON_PATH = 'M6 0H9V3H6V0ZM3 3H6V6H3V3ZM0 6H3V9H0V6ZM3 9H6V12H3V9ZM6 12H9V15H6V12Z';
/** Pixel "×" (3pt cells) */
const CLOSE_PATH = 'M0 0H3V3H0V0ZM6 0H9V3H6V0ZM3 3H6V6H3V3ZM0 6H3V9H0V6ZM6 6H9V9H6V6Z';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  fill: {
    backgroundColor: THERMAL_COLORS.void,
    borderBottomWidth: 2,
    borderBottomColor: THERMAL_COLORS.borderSoft,
  },
  row: {
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.margin,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THERMAL_COLORS.chip,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  title: {
    position: 'absolute',
    // Symmetric so the title stays centred; wide enough to clear "READ 3 / 7"
    left: SPACE.margin + TITLE_INSET,
    right: SPACE.margin + TITLE_INSET,
    alignItems: 'center',
  },
  accessory: {
    minWidth: BUTTON_SIZE,
    alignItems: 'flex-end',
  },
});
