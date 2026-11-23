import { type ReactNode, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
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
  /**
   * True while the data behind the screen is being fetched. The spinner only
   * follows it after the user pulls to refresh, so background refetches
   * (focus, intervals) never show it or push the content down.
   */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pass one in to read the scroll offset from the screen's content */
  scrollY?: SharedValue<number>;
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
  scrollY: externalScrollY,
}: ThermalScreenProps) {
  const insets = useSafeAreaInsets();
  const ownScrollY = useSharedValue(0);
  const scrollY = externalScrollY ?? ownScrollY;
  const focusKey = useFocusKey();
  const pullRefresh = usePullRefresh(refreshing);

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
              refreshing={pullRefresh.active}
              onRefresh={() => {
                pullRefresh.start();
                onRefresh();
              }}
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

/**
 * Spinner state for a user's pull: on from the pull until `refreshing` has
 * gone true and back to false (or straight away if no fetch starts)
 */
function usePullRefresh(refreshing: boolean): { active: boolean; start: () => void } {
  const [phase, setPhase] = useState<PullPhase>('idle');

  useEffect(() => {
    if (phase === 'pulled' && refreshing) setPhase('fetching');
    if (phase === 'fetching' && !refreshing) setPhase('idle');
  }, [phase, refreshing]);

  // A pull that starts no fetch (data still fresh) must not spin forever
  useEffect(() => {
    if (phase !== 'pulled') return;
    const timer = setTimeout(() => setPhase((current) => (current === 'pulled' ? 'idle' : current)), PULL_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return { active: phase !== 'idle', start: () => setPhase('pulled') };
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

type PullPhase = 'idle' | 'pulled' | 'fetching';

/** How long a pull waits for its fetch to start before the spinner gives up */
const PULL_START_TIMEOUT_MS = 1500;

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
