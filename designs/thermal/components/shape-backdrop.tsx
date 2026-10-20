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
 * rolls out of the hottest band, taking its colours from the shape.
 * Switching shape cross-fades with the shared fade tokens.
 */
export function ShapeBackdrop({ shape, width, height }: ShapeBackdropProps) {
  const scale = width / FIGMA_WIDTH;
  // The wave rebuilds its cards when it recolours; do that once the step transition
  // has played so the tap that changed the step is never held up
  const [waveShape, setWaveShape] = useState(shape);
  useEffect(() => {
    if (shape === waveShape) return;
    const timer = setTimeout(() => setWaveShape(shape), DURATION.base);
    return () => clearTimeout(timer);
  }, [shape, waveShape]);
  const bands = useMemo(() => BACKDROP_SHAPES[waveShape].bands.map(buildBand), [waveShape]);
  const hotspot = bands[bands.length - 1].center;

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
      <Animated.View key={shape} entering={fadeIn()} exiting={fadeOut()} style={StyleSheet.absoluteFill}>
        {BACKDROP_IMAGES[shape].map((image, index) => (
          <BreathingBand key={index} image={image} index={index} scale={scale} />
        ))}
      </Animated.View>

      <PixelCore
        width={width}
        height={height * WAVE_AREA}
        centerX={hotspot.x * scale}
        centerY={hotspot.y * scale}
        sampleColor={sampleColor}
        variant="flip"
      />
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
  bounds: { x0: number; y0: number; x1: number; y1: number };
  center: { x: number; y: number };
}

function buildBand(runs: Array<number>): Band {
  const rows = new Map<number, Array<[number, number]>>();
  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  for (let i = 0; i < runs.length; i += 3) {
    const [x0, y, x1] = [runs[i], runs[i + 1], runs[i + 2]];
    const row = rows.get(y) ?? [];
    row.push([x0, x1]);
    rows.set(y, row);
    bounds.x0 = Math.min(bounds.x0, x0);
    bounds.x1 = Math.max(bounds.x1, x1);
    bounds.y0 = Math.min(bounds.y0, y);
    bounds.y1 = Math.max(bounds.y1, y + CELL);
  }

  return {
    rows,
    bounds,
    center: { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 },
  };
}

const FIGMA_WIDTH = 402;
/** The flip wave only runs over the top of the screen; below it the copy sits on the dark fade */
const WAVE_AREA = 0.62;
/** Figma pixel-run height: the 10pt sensor grid */
const CELL = 10;

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
