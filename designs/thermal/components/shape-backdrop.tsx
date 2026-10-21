import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
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
import { DURATION, fadeIn, fadeOut } from '../motion';
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
 * breathes like the Power backdrop's heat blobs, and the 09 FLIP pixel wave
 * draws the shape like a pen: it runs along the hottest band in the shape's
 * direction (heartbeat and wave left → right like a monitor, the check from
 * its left tip, the bolt falling from the top) and the glow around the stroke
 * flips a beat after the pen passes. Colours come from the shape.
 * Switching shape cross-fades the bands; the old wave fades out first and the
 * new one starts drawing from the beginning, so old and new pixels never mix.
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
  const axis = DRAW_AXIS[waveShape];
  const penField = useMemo(() => buildPenField(bands[bands.length - 1], axis), [bands, axis]);

  // How far the pen has to travel before it reaches a cell
  const distanceAt = useCallback(
    (x: number, y: number) => {
      const column = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(x / scale / CELL)));
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / scale / CELL)));
      return penField[row * GRID_COLUMNS + column] * scale;
    },
    [penField, scale],
  );

  // Same lookup the FLIP faces use on Power: colour of the hottest band under a point
  const sampleColor = useCallback(
    (x: number, y: number) => {
      const fx = x / scale;
      const row = Math.floor(y / scale / CELL) * CELL;
      for (let index = bands.length - 1; index >= 0; index--) {
        const runs = bands[index].rows.get(row);
        if (runs?.some(([x0, x1]) => fx >= x0 && fx < x1)) return BAND_COLORS[index];
      }
      return y / height < 0.5 ? BACKDROP_GRADIENT[0] : BACKDROP_GRADIENT[1];
    },
    [bands, scale, height],
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

      {/* Only the light band images cross-fade; the flip wave stays mounted and recolours */}
      <Animated.View key={`bands-${shape}`} entering={fadeIn()} exiting={fadeOut()} style={StyleSheet.absoluteFill}>
        {BACKDROP_IMAGES[shape].map((image, index) => (
          <BreathingBand key={index} image={image} index={index} scale={scale} />
        ))}
      </Animated.View>

      {isWaveSwitching ? null : (
        <Animated.View key={`wave-${waveShape}`} entering={fadeIn()} exiting={fadeOut()} style={StyleSheet.absoluteFill}>
          {/* Centre far off-screen on the pen's start side, so card faces sample along the stroke */}
          <PixelCore
            width={width}
            height={height * WAVE_AREA}
            centerX={axis === 'x' ? -width * PEN_SOURCE_AWAY : width / 2}
            centerY={axis === 'x' ? height / 2 : -height * PEN_SOURCE_AWAY}
            sampleColor={sampleColor}
            distanceAt={distanceAt}
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

/** One colour band; breathes with the same timing as the Power backdrop's heat blobs */
function BreathingBand({ image, index, scale }: BreathingBandProps) {
  const breath = useSharedValue(0);

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

  const pulse = BAND_PULSE[index];
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.82, 1]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, pulse]) }],
  }));

  return (
    <Animated.View
      style={[
        styles.band,
        { left: image.x * scale, top: image.y * scale, width: image.w * scale, height: image.h * scale },
        animatedStyle,
      ]}
    >
      <Image source={image.source} style={StyleSheet.absoluteFill} contentFit="fill" />
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
 * Pen distance for every 10pt grid cell, in Figma points: how far along the
 * stroke (its x or y) the nearest cell of `band` sits, plus a lag for how far
 * the cell is from the stroke. Two chamfer passes carry the nearest stroke
 * cell's position outward.
 */
function buildPenField(band: Band, axis: DrawAxis): Float32Array {
  const distance = new Float32Array(GRID_COLUMNS * GRID_ROWS).fill(Infinity);
  const along = new Float32Array(GRID_COLUMNS * GRID_ROWS);
  let start = Infinity;

  for (const [y, runs] of band.rows) {
    const row = y / CELL;
    if (row < 0 || row >= GRID_ROWS) continue;
    for (const [x0, x1] of runs) {
      for (let column = Math.max(0, Math.floor(x0 / CELL)); column < Math.min(GRID_COLUMNS, Math.ceil(x1 / CELL)); column++) {
        const index = row * GRID_COLUMNS + column;
        distance[index] = 0;
        along[index] = (axis === 'x' ? column : row) * CELL;
        start = Math.min(start, along[index]);
      }
    }
  }

  const relax = (index: number, neighbour: number, cost: number) => {
    if (distance[neighbour] + cost < distance[index]) {
      distance[index] = distance[neighbour] + cost;
      along[index] = along[neighbour];
    }
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

  const field = new Float32Array(GRID_COLUMNS * GRID_ROWS);
  for (let index = 0; index < field.length; index++) {
    field[index] = along[index] - start + distance[index] * PEN_SPREAD_LAG;
  }
  return field;
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
/** Which way the pen draws each shape: along x (left → right) or y (top → bottom) */
const DRAW_AXIS: Record<BackdropName, DrawAxis> = {
  heartbeat: 'x',
  check: 'x',
  bolt: 'y',
  wave: 'x',
};
/** Glow away from the stroke flips this much later per point of distance */
const PEN_SPREAD_LAG = 0.6;
/** Screen sizes between the pen's start side and the virtual wave source */
const PEN_SOURCE_AWAY = 10;

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

type DrawAxis = 'x' | 'y';
