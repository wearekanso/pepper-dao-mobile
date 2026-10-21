import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUser } from '@/contexts/user-context';
import { RANK_IMAGES } from '@/lib/rank-images';
import { RANK_ORDER, RANK_REQUIREMENTS } from '@/lib/reputation';
import { StorageService } from '@/lib/storage';
import type { Rank } from '@/types/user';

import { formatInteger } from '../lib/format';
import { getHeatLevel, getNextHeatLevel, getRankLabel, MAX_HEAT_LEVEL } from '../lib/heat-levels';
import { RANKUP_BAND_COLORS, RANKUP_BANDS, RANKUP_IMAGES } from '../lib/rankup-backdrop';
import { DURATION, fadeIn, revealAt, STAGGER, TIMING } from '../motion';
import { INK, THERMAL_COLORS, TYPE } from '../theme';
import { PixelButton } from './pixel-button';
import { PixelCore } from './pixel-core';
import { SensorGrid } from './thermal-background';

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
        <RankUpBackdrop width={width} height={height} />
        <SensorGrid width={width} height={height} />
        <TopFade width={width} />

        <View style={[styles.center, { top: height * 0.15 }]}>
          <Animated.View entering={revealAt(0)} style={styles.badge}>
            <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>NEW HEAT LEVEL</Text>
          </Animated.View>

          <BouncingMascot levelRank={transition.to} />

          <Animated.Text entering={revealAt(1)} style={[TYPE.display72, styles.ink]}>
            LEVEL UP
          </Animated.Text>

          <Animated.View entering={revealAt(2)}>
            <View>
              <View style={[styles.cardShadow]} />
              <View style={styles.card}>
                <Text style={[TYPE.display40, { color: THERMAL_COLORS.cream }]}>{level.name}</Text>
                <Text style={[TYPE.meta18, { color: INK.body }]}>{`LEVEL ${level.level} OF ${MAX_HEAT_LEVEL}`}</Text>
                <Text style={[TYPE.label12, { color: INK.muted }]}>
                  {next ? `NEXT: ${next.name} · ${getNextRequirement(next.rank)}` : 'MAXIMUM HEAT REACHED'}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View
          entering={revealAt(3)}
          style={[styles.actions, { bottom: insets.bottom }]}
        >
          <PixelButton label="CONTINUE >" variant="gold" onPress={onClose} />
          <PixelButton label="SHARE MY LEVEL CARD" variant="outline" onPress={() => void handleShare()} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Figma "Heat Burst · pulse · 10pt": eight blurred colour bands around the
 * mascot, with the Power heat camera's FLIP wave rolling out of the hottest
 * band in round rings, taking its colours from the band under each card.
 */
function RankUpBackdrop({ width, height }: { width: number; height: number }) {
  const scale = width / FIGMA_WIDTH;
  const bands = useMemo(() => RANKUP_BANDS.map(buildRows), []);
  const hotspot = useMemo(() => getCenter(RANKUP_BANDS[RANKUP_BANDS.length - 1]), []);

  const sampleColor = useCallback(
    (x: number, y: number) => {
      const fx = x / scale;
      const row = Math.floor(y / scale / CELL) * CELL;
      for (let index = bands.length - 1; index >= 0; index--) {
        if (bands[index].get(row)?.some(([x0, x1]) => fx >= x0 && fx < x1)) return RANKUP_BAND_COLORS[index];
      }
      return RANKUP_BAND_COLORS[0];
    },
    [bands, scale],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {RANKUP_IMAGES.map((image, index) => (
        <Image
          key={index}
          source={image.source}
          contentFit="fill"
          style={[styles.band, { left: image.x * scale, top: image.y * scale, width: image.w * scale, height: image.h * scale }]}
        />
      ))}
      <PixelCore
        width={width}
        height={height}
        centerX={hotspot.x * scale}
        centerY={hotspot.y * scale}
        sampleColor={sampleColor}
        variant="flip"
      />
    </View>
  );
}

/** Figma "Top Fade": keeps the status bar readable over the burst */
function TopFade({ width }: { width: number }) {
  return (
    <Svg width={width} height={TOP_FADE_HEIGHT} style={styles.topFade} pointerEvents="none">
      <Defs>
        <LinearGradient id="rankup-top-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0.7} />
          <Stop offset="0.6" stopColor={THERMAL_COLORS.void} stopOpacity={0.35} />
          <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={TOP_FADE_HEIGHT} fill="url(#rankup-top-fade)" />
    </Svg>
  );
}

/** Row y → pixel runs `[x0, x1]` on that row */
function buildRows(runs: Array<number>): Map<number, Array<[number, number]>> {
  const rows = new Map<number, Array<[number, number]>>();
  for (let i = 0; i < runs.length; i += 3) {
    const row = rows.get(runs[i + 1]) ?? [];
    row.push([runs[i], runs[i + 2]]);
    rows.set(runs[i + 1], row);
  }
  return rows;
}

/** Middle of a band's bounding box, in Figma points */
function getCenter(runs: Array<number>): { x: number; y: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < runs.length; i += 3) {
    x0 = Math.min(x0, runs[i]);
    x1 = Math.max(x1, runs[i + 2]);
    y0 = Math.min(y0, runs[i + 1]);
    y1 = Math.max(y1, runs[i + 1] + CELL);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

/** "250 REP + 4-WEEK STREAK" — what the next rank asks for */
function getNextRequirement(rank: Rank): string {
  const rule = RANK_REQUIREMENTS[rank];
  const parts = [`${rule.points} REP`];
  if (rule.requiresStreak > 0) parts.push(`${rule.requiresStreak}-WEEK STREAK`);
  if (rule.requiresEngagedProposal) parts.push('A PROPOSAL THAT HEATS UP');
  if (rule.requiresPassedProposal) parts.push('A PASSED PROPOSAL');
  return parts.join(' + ');
}

/** The new rank's mascot drops in (same drop as before, now the rank art) */
function BouncingMascot({ levelRank }: { levelRank: Rank }) {
  const drop = useSharedValue(0);

  useEffect(() => {
    drop.value = withDelay(STAGGER.lead, withTiming(1, TIMING.emphasis));
  }, [drop]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -24 }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Image source={RANK_IMAGES[levelRank] as number} style={{ width: MASCOT_SIZE, height: MASCOT_SIZE }} contentFit="contain" />
    </Animated.View>
  );
}

interface RankTransition {
  from: Rank;
  to: Rank;
}

const LAST_RANK_KEY = 'thermal:last_rank';
const MASCOT_SIZE = 170;
const FIGMA_WIDTH = 402;
/** Figma pixel-run height: the 10pt sensor grid */
const CELL = 10;
const TOP_FADE_HEIGHT = 120;
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
    paddingHorizontal: 22,
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
  band: {
    position: 'absolute',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
