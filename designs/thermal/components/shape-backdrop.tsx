import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  BACKDROP_GRADIENT,
  BACKDROP_IMAGES,
  BACKDROP_SHAPES,
  BAND_COLORS,
  type BackdropName,
  type BandImage,
} from '../lib/onboarding-backdrops';
import { DURATION, fadeIn, fadeOut, TIMING } from '../motion';
import { PixelCore } from './pixel-core';
import { SensorGrid } from './thermal-background';

interface ShapeBackdropProps {
  shape: BackdropName;
  width: number;
  height: number;
}

/**
 * Onboarding backdrop: a Figma heat shape (six blurred pixel bands on the
 * sensor grid, pre-rendered from Figma) animated exactly like the Power heat camera — every band
 * breathes like the Power backdrop's heat blobs, and the 09 FLIP pixels pulse
 * out of the shape's hottest band twice ("ba-dum"), then rest. The pulse keeps
 * the shape's outline (a distance field from the band) and fades out a short
 * way from it. Colours come from the shape.
 * Switching shape morphs the bands: each band of the old shape stretches into
 * the matching band of the new one while its image blends over. The old pulse
 * fades out first and the new one starts from the beginning, so old and new
 * pixels never mix.
 */
export function ShapeBackdrop({ shape, width, height }: ShapeBackdropProps) {
  const scale = width / FIGMA_WIDTH;
  // The wave rebuilds its cards when it recolours; do that once the step transition
  // has played so the tap that changed the step is never held up
  const [waveShape, setWaveShape] = useState(shape);
  // While switching, no wave is mounted: the old one fades out before the new one starts
  const isWaveSwitching = shape !== waveShape;
  useEffect(() => {
    if (!isWaveSwitching) return;
    const timer = setTimeout(() => setWaveShape(shape), DURATION.base);
    return () => clearTimeout(timer);
  }, [shape, isWaveSwitching]);
  const bands = useMemo(() => BACKDROP_SHAPES[waveShape].bands.map(buildBand), [waveShape]);
  const core = bands[bands.length - 1];
  const pulseField = useMemo(() => buildPulseField(core), [core]);

  // Distance from the hottest band; past PULSE_REACH the pulse has faded and cells stay still
  const distanceAt = useCallback(
    (x: number, y: number) => {
      const column = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(x / scale / CELL)));
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / scale / CELL)));
      const distance = pulseField.distance[row * GRID_COLUMNS + column];
      return distance > PULSE_REACH ? Infinity : distance * scale;
    },
    [pulseField, scale],
  );

  // Like the Power FLIP lookup, but one band hotter than what's underneath, so
  // the beat reads as a flush of heat passing over the shape
  const sampleColor = useCallback(
    (x: number, y: number) => {
      const fx = x / scale;
      const row = Math.floor(y / scale / CELL) * CELL;
      for (let index = bands.length - 1; index >= 0; index--) {
        const runs = bands[index].rows.get(row);
        if (runs?.some(([x0, x1]) => fx >= x0 && fx < x1)) return BAND_COLORS[Math.min(index + 1, BAND_COLORS.length - 1)];
      }
      return BAND_COLORS[0];
    },
    [bands, scale],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="backdrop-floor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={BACKDROP_GRADIENT[0]} />
            <Stop offset="0.5" stopColor={BACKDROP_GRADIENT[1]} />
            <Stop offset="1" stopColor={BACKDROP_GRADIENT[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#backdrop-floor)" />
      </Svg>

      {/* Bands are keyed by position, not shape, so each one morphs into its counterpart */}
      {BACKDROP_IMAGES[shape].map((image, index) => (
        <BreathingBand key={index} image={image} index={index} scale={scale} />
      ))}

      {isWaveSwitching ? null : (
        <Animated.View key={`wave-${waveShape}`} entering={fadeIn()} exiting={fadeOut()} style={StyleSheet.absoluteFill}>
          <PixelCore
            width={width}
            height={height * WAVE_AREA}
            centerX={pulseField.center.x * scale}
            centerY={pulseField.center.y * scale}
            sampleColor={sampleColor}
            distanceAt={distanceAt}
            beatGap={BEAT_GAP * scale}
            cycleMs={PULSE_CYCLE_MS}
            variant="flip"
          />
        </Animated.View>
      )}
      <SensorGrid width={width} height={height} />
    </View>
  );
}

interface BreathingBandProps {
  image: BandImage;
  index: number;
  scale: number;
}

/**
 * One colour band; breathes with the same timing as the Power backdrop's heat
 * blobs, and morphs to a new image when the shape changes.
 */
function BreathingBand({ image, index, scale }: BreathingBandProps) {
  const breath = useSharedValue(0);
  // Each shape change starts a fresh morph from the band's last target
  const [morph, setMorph] = useState({ from: image, to: image, id: 0 });
  if (morph.to !== image) setMorph({ from: morph.to, to: image, id: morph.id + 1 });

  useEffect(() => {
    breath.value = withDelay(
      index * BREATH_DELAY_MS,
      withRepeat(
        withTiming(1, { duration: BREATH_BASE_MS + index * BREATH_STEP_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [breath, index]);

  return <MorphBand key={morph.id} from={morph.from} to={morph.to} breath={breath} pulse={BAND_PULSE[index]} scale={scale} />;
}

interface MorphBandProps {
  from: BandImage;
  to: BandImage;
  breath: SharedValue<number>;
  pulse: number;
  scale: number;
}

/** Stretches the band's box from `from` to `to` while the new image blends over the old */
function MorphBand({ from, to, breath, pulse, scale }: MorphBandProps) {
  const isMorphing = from !== to;
  const progress = useSharedValue(isMorphing ? 0 : 1);

  useEffect(() => {
    if (isMorphing) progress.value = withTiming(1, TIMING.emphasis);
  }, [isMorphing, progress]);

  const boxStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: (from.x + (to.x - from.x) * p) * scale,
      top: (from.y + (to.y - from.y) * p) * scale,
      width: (from.w + (to.w - from.w) * p) * scale,
      height: (from.h + (to.h - from.h) * p) * scale,
      opacity: interpolate(breath.value, [0, 1], [0.82, 1]),
      transform: [{ scale: interpolate(breath.value, [0, 1], [1, pulse]) }],
    };
  });
  const fromStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const toStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View style={[styles.band, boxStyle]}>
      {isMorphing ? (
        <Animated.View style={[StyleSheet.absoluteFill, fromStyle]}>
          <Image source={from.source} style={StyleSheet.absoluteFill} contentFit="fill" />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, toStyle]}>
        <Image source={to.source} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Animated.View>
    </Animated.View>
  );
}

interface Band {
  /** Row y → pixel runs `[x0, x1]` on that row, for colour sampling */
  rows: Map<number, Array<[number, number]>>;
}

function buildBand(runs: Array<number>): Band {
  const rows = new Map<number, Array<[number, number]>>();

  for (let i = 0; i < runs.length; i += 3) {
    const [x0, y, x1] = [runs[i], runs[i + 1], runs[i + 2]];
    const row = rows.get(y) ?? [];
    row.push([x0, x1]);
    rows.set(y, row);
  }

  return { rows };
}

/**
 * Chamfer distance (10 straight, 14 diagonal) from every 10pt grid cell to the
 * nearest cell of `band`, in Figma points, plus the band's centre (where card
 * faces sample "outward" from).
 */
function buildPulseField(band: Band): { distance: Float32Array; center: { x: number; y: number } } {
  const distance = new Float32Array(GRID_COLUMNS * GRID_ROWS).fill(Infinity);
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const [y, runs] of band.rows) {
    const row = y / CELL;
    if (row < 0 || row >= GRID_ROWS) continue;
    for (const [x0, x1] of runs) {
      for (let column = Math.max(0, Math.floor(x0 / CELL)); column < Math.min(GRID_COLUMNS, Math.ceil(x1 / CELL)); column++) {
        distance[row * GRID_COLUMNS + column] = 0;
        sumX += column * CELL + CELL / 2;
        sumY += y + CELL / 2;
        count++;
      }
    }
  }

  const relax = (index: number, neighbour: number, cost: number) => {
    if (distance[neighbour] + cost < distance[index]) distance[index] = distance[neighbour] + cost;
  };
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let column = 0; column < GRID_COLUMNS; column++) {
      const index = row * GRID_COLUMNS + column;
      if (column > 0) relax(index, index - 1, STRAIGHT);
      if (row > 0) {
        relax(index, index - GRID_COLUMNS, STRAIGHT);
        if (column > 0) relax(index, index - GRID_COLUMNS - 1, DIAGONAL);
        if (column < GRID_COLUMNS - 1) relax(index, index - GRID_COLUMNS + 1, DIAGONAL);
      }
    }
  }
  for (let row = GRID_ROWS - 1; row >= 0; row--) {
    for (let column = GRID_COLUMNS - 1; column >= 0; column--) {
      const index = row * GRID_COLUMNS + column;
      if (column < GRID_COLUMNS - 1) relax(index, index + 1, STRAIGHT);
      if (row < GRID_ROWS - 1) {
        relax(index, index + GRID_COLUMNS, STRAIGHT);
        if (column < GRID_COLUMNS - 1) relax(index, index + GRID_COLUMNS + 1, DIAGONAL);
        if (column > 0) relax(index, index + GRID_COLUMNS - 1, DIAGONAL);
      }
    }
  }

  return { distance, center: count > 0 ? { x: sumX / count, y: sumY / count } : { x: FIGMA_WIDTH / 2, y: 0 } };
}

const FIGMA_WIDTH = 402;
/** The flip wave only runs over the top of the screen; below it the copy sits on the dark fade */
const WAVE_AREA = 0.62;
/** Figma pixel-run height: the 10pt sensor grid */
const CELL = 10;
const FIGMA_HEIGHT = 874;
const GRID_COLUMNS = Math.ceil(FIGMA_WIDTH / CELL) + 1;
const GRID_ROWS = Math.ceil(FIGMA_HEIGHT / CELL);
/** Chamfer steps between neighbouring cells, in points */
const STRAIGHT = CELL;
const DIAGONAL = 14;
/** How far out of the hottest band the pulse travels before it fades, in Figma points */
const PULSE_REACH = 150;
/** Distance between the two beats' fronts ("ba-dum"), in Figma points */
const BEAT_GAP = 70;
/** One ba-dum plus the rest before the next, in ms */
const PULSE_CYCLE_MS = 2600;

/*
 * Breathing timing — identical to ThermalBackground's HeatBlob so the
 * onboarding shapes move like the Power heat camera's backdrop.
 */
const BREATH_BASE_MS = 3600;
const BREATH_STEP_MS = 700;
const BREATH_DELAY_MS = 180;
/** Max breathing scale per band, coolest → hottest (Power blobs: 1.03 → 1.2) */
const BAND_PULSE = [1.03, 1.05, 1.07, 1.1, 1.14, 1.18];

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
  },
});

