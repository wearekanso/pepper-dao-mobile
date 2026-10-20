import type { ReactNode } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useFocusKey } from '../hooks/use-focus-key';
import { NAV_HEIGHT, SPACE, THERMAL_COLORS } from '../theme';
import { ThermalBackground, type ThermalPreset } from './thermal-background';
import { NAV_BAR_HEIGHT, ThermalNavBar } from './thermal-nav-bar';

interface ThermalScreenProps {
  preset: ThermalPreset;
  children: ReactNode;
  gap?: number;
  /** Extra bottom space, e.g. for a docked action bar (defaults to the tab bar) */
  bottomSpace?: number;
  /** Rendered above the scroll view (fixed docks, overlays) */
  overlay?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Fixed top bar for pushed screens; content starts below it */
  navBar?: {
    title: string;
    onBack: () => void;
    accessory?: ReactNode;
    /** Scroll offset where the bar fully fills in (≈ large title height) */
    collapseAt?: number;
  };
}

/**
 * Scrollable screen on top of the animated thermal backdrop.
 * The heat blobs parallax with the scroll and the scan sweep replays on focus.
 */
export function ThermalScreen({
  preset,
  children,
  gap = SPACE.section,
  bottomSpace = NAV_HEIGHT + 20,
  overlay,
  refreshing = false,
  onRefresh,
  navBar,
}: ThermalScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const focusKey = useFocusKey();

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View style={styles.root}>
      <ThermalBackground preset={preset} scrollY={scrollY} scanKey={focusKey} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + (navBar ? NAV_BAR_HEIGHT + 12 : 4),
          paddingHorizontal: SPACE.margin,
          paddingBottom: bottomSpace + insets.bottom,
          gap,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THERMAL_COLORS.gold}
              colors={[THERMAL_COLORS.orange]}
              progressBackgroundColor={THERMAL_COLORS.void}
            />
          ) : undefined
        }
      >
        {children}
      </Animated.ScrollView>
      {navBar ? (
        <ThermalNavBar
          title={navBar.title}
          onBack={navBar.onBack}
          accessory={navBar.accessory}
          collapseAt={navBar.collapseAt}
          scrollY={scrollY}
        />
      ) : (
        <TopFade height={insets.top + 18} />
      )}
      {overlay}
    </View>
  );
}

/** Darkens content as it scrolls under the status bar */
function TopFade({ height }: { height: number }) {
  const { width } = useWindowDimensions();

  // react-native-svg ignores pointerEvents on the root, so the wrapper View
  // is what lets taps through to the back link / wallet chip underneath.
  return (
    <View pointerEvents="none" style={[styles.topFade, { width, height }]}>
      <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="top-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0.6} />
          <Stop offset="0.6" stopColor={THERMAL_COLORS.void} stopOpacity={0.3} />
          <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
        </LinearGradient>
      </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#top-fade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  root: {
    flex: 1,
    backgroundColor: THERMAL_COLORS.void,
  },
});
