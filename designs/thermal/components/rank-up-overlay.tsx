import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUser } from '@/contexts/user-context';
import { RANK_ORDER } from '@/lib/reputation';
import { StorageService } from '@/lib/storage';
import type { Rank } from '@/types/user';

import { formatInteger } from '../lib/format';
import { formatShu, getHeatLevel, getNextHeatLevel, getRankLabel, MAX_HEAT_LEVEL } from '../lib/heat-levels';
import { DURATION, fadeIn, revealAt, STAGGER, TIMING } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';
import { HeatBurst, Sparks } from './heat-burst';
import { HeatPepper } from './pixel-art';
import { PixelButton } from './pixel-button';

interface RankUpContextValue {
  /** Shows the overlay for the current rank (or a demo jump) without a real rank change */
  preview: () => void;
}

const RankUpContext = createContext<RankUpContextValue>({ preview: () => undefined });

/**
 * Watches the profile rank and plays the LEVEL UP overlay whenever it rises.
 * The last seen rank is persisted so the celebration plays exactly once.
 */
export function RankUpProvider({ children }: { children: ReactNode }) {
  const { profile } = useUser();
  const [transition, setTransition] = useState<RankTransition | null>(null);

  useEffect(() => {
    if (!profile) return;

    const storageKey = `${LAST_RANK_KEY}:${profile.id}`;
    const lastRank = StorageService.getString(storageKey) as Rank | undefined;
    StorageService.setString(storageKey, profile.rank);

    if (!lastRank || !RANK_ORDER.includes(lastRank)) return;
    if (RANK_ORDER.indexOf(profile.rank) > RANK_ORDER.indexOf(lastRank)) {
      setTransition({ from: lastRank, to: profile.rank });
    }
  }, [profile]);

  const preview = useCallback(() => {
    const to = profile?.rank && profile.rank !== 'OBSERVER' ? profile.rank : 'PARTICIPANT';
    const from = RANK_ORDER[Math.max(0, RANK_ORDER.indexOf(to) - 1)];
    setTransition({ from, to });
  }, [profile?.rank]);

  const value = useMemo(() => ({ preview }), [preview]);

  return (
    <RankUpContext.Provider value={value}>
      {children}
      <RankUpOverlay transition={transition} onClose={() => setTransition(null)} />
    </RankUpContext.Provider>
  );
}

export function useRankUp(): RankUpContextValue {
  return useContext(RankUpContext);
}

interface RankUpOverlayProps {
  transition: RankTransition | null;
  onClose: () => void;
}

function RankUpOverlay({ transition, onClose }: RankUpOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (!transition) return;
    const timer = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, STAGGER.lead + DURATION.emphasis);
    return () => clearTimeout(timer);
  }, [transition]);

  if (!transition) return null;

  const level = getHeatLevel(transition.to);
  const next = getNextHeatLevel(transition.to);

  async function handleShare() {
    await Share.share({
      message: `My heat just hit ${level.name} (${formatInteger(level.shu)} SHU) on Pepper DAO 🌶️ ${getRankLabel(transition!.to)} · HEAT ${level.level}/${MAX_HEAT_LEVEL}`,
    });
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={fadeIn()} style={[styles.root, { width, height }]}>
        <HeatBurst width={width} height={height} />
        <Sparks width={width} height={height} />

        <View style={[styles.center, { top: height * 0.17 }]}>
          <Animated.View entering={revealAt(0)} style={styles.badge}>
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>NEW HEAT LEVEL UNLOCKED</Text>
          </Animated.View>

          <BouncingPepper levelRank={transition.to} />

          <Animated.Text entering={revealAt(1)} style={[TYPE.display72, styles.ink, { marginTop: 10 }]}>
            LEVEL UP
          </Animated.Text>
          <Animated.Text entering={revealAt(2)} style={[TYPE.meta26, styles.ink]}>
            {`${getRankLabel(transition.from)}  >  ${getRankLabel(transition.to)}`}
          </Animated.Text>

          <Animated.View entering={revealAt(3)}>
            <View>
              <View style={[styles.cardShadow]} />
              <View style={styles.card}>
                <Text style={[TYPE.display40, { color: THERMAL_COLORS.cream }]}>{level.name}</Text>
                <Text style={[TYPE.meta20, { color: THERMAL_COLORS.orange }]}>
                  {`${formatInteger(level.shu)} SHU · HEAT ${level.level} / ${MAX_HEAT_LEVEL}`}
                </Text>
                <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>
                  {next ? `NEXT: ${next.name} · ${formatShu(next.shu)} SHU` : 'MAXIMUM HEAT REACHED'}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View
          entering={revealAt(4)}
          style={[styles.actions, { bottom: insets.bottom + 24 }]}
        >
          <PixelButton label="CONTINUE >" variant="void" onPress={onClose} />
          <PixelButton label="SHARE MY HEAT" variant="paper" onPress={() => void handleShare()} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function BouncingPepper({ levelRank }: { levelRank: Rank }) {
  const drop = useSharedValue(0);

  useEffect(() => {
    drop.value = withDelay(STAGGER.lead, withTiming(1, TIMING.emphasis));
  }, [drop]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -24 }],
  }));

  return (
    <Animated.View style={[{ paddingVertical: 8 }, animatedStyle]}>
      <View>
        <View style={{ position: 'absolute', left: 6, top: 6 }}>
          <HeatPepper level={getHeatLevel(levelRank)} silhouette={THERMAL_COLORS.void} />
        </View>
        <HeatPepper level={getHeatLevel(levelRank)} />
      </View>
    </Animated.View>
  );
}

interface RankTransition {
  from: Rank;
  to: Rank;
}

const LAST_RANK_KEY = 'thermal:last_rank';
const styles = StyleSheet.create({
  root: {
    backgroundColor: THERMAL_COLORS.void,
    overflow: 'hidden',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    backgroundColor: THERMAL_COLORS.void,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    gap: 14,
  },
});
