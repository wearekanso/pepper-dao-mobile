import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { THERMAL_COLORS } from '../theme';

export type ThermalPreset = 'pulse' | 'decide' | 'detail' | 'rulebook' | 'power';

interface ThermalBackgroundProps {
  preset: ThermalPreset;
  /** Scroll offset of the screen — blobs drift with a slow parallax */
  scrollY?: SharedValue<number>;
  /** Change this value to replay the thermal scan sweep (e.g. on focus) */
  scanKey?: number;
}

/**
 * Animated thermal-camera backdrop: blurred heat blobs that breathe,
 * a 10pt "sensor grid" that pixelates them, and an optional scan sweep.
 */
/** How far the backdrop drifts per point of scroll; layers drawn on the glow must match it */
export const BACKDROP_PARALLAX = 0.35;

export function ThermalBackground({ preset, scrollY, scanKey }: ThermalBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const scale = width / FIGMA_WIDTH;
  const blobs = PRESETS[preset];

  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    return { transform: [{ translateY: -scrollY.value * BACKDROP_PARALLAX }] };
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: THERMAL_COLORS.void }]}>
      <Animated.View style={[StyleSheet.absoluteFill, parallaxStyle]}>
        {blobs.map((blob, index) => (
          <HeatBlob key={`${preset}-${index}`} blob={blob} scale={scale} index={index} />
        ))}
      </Animated.View>
      <SensorGrid width={width} height={height} />
      {scanKey !== undefined ? <ScanSweep scanKey={scanKey} height={height} /> : null}
    </View>
  );
}

/**
 * Screen position of the hottest point of a preset (the centre of its
 * smallest blob — the white spot), so foreground effects can start there.
 */
export function getHeatHotspot(preset: ThermalPreset, width: number): { x: number; y: number } {
  const scale = width / FIGMA_WIDTH;
  const core = PRESETS[preset].reduce((smallest, blob) => (blob.w * blob.h < smallest.w * smallest.h ? blob : smallest));
  return { x: (core.x + core.w / 2) * scale, y: (core.y + core.h / 2) * scale };
}

/**
 * Colour of the (resting) backdrop at a screen point, composited the same way
 * HeatBlob draws it and snapped to the nearest thermal swatch. Lets foreground
 * pixels match the glow underneath them anywhere on the screen.
 */
export function sampleHeatColor(preset: ThermalPreset, width: number, x: number, y: number): string {
  const scale = width / FIGMA_WIDTH;
  const px = x / scale;
  const py = y / scale;
  let rgb = hexToRgb(THERMAL_COLORS.void);

  for (const blob of PRESETS[preset]) {
    const pad = blob.blur * 2;
    const halfW = blob.w / 2 + pad;
    const halfH = blob.h / 2 + pad;
    const t = Math.hypot((px - (blob.x + blob.w / 2)) / halfW, (py - (blob.y + blob.h / 2)) / halfH);
    if (t >= 1) continue;
    const coreStop = Math.max(0.05, (blob.w / 2 - blob.blur) / (blob.w / 2 + pad));
    const alpha =
      t <= coreStop
        ? blob.opacity * (1 - 0.08 * (t / coreStop))
        : blob.opacity * 0.92 * (1 - (t - coreStop) / (1 - coreStop));
    const color = hexToRgb(blob.color);
    rgb = rgb.map((channel, index) => channel + (color[index] - channel) * alpha) as [number, number, number];
  }

  let best = SAMPLE_SWATCHES[0];
  let bestDistance = Infinity;
  for (const swatch of SAMPLE_SWATCHES) {
    const c = hexToRgb(swatch);
    const distance = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = swatch;
    }
  }
  return best;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const SAMPLE_SWATCHES: Array<string> = [
  THERMAL_COLORS.navy,
  THERMAL_COLORS.indigo,
  '#3A0CA3',
  THERMAL_COLORS.violet,
  THERMAL_COLORS.plum,
  THERMAL_COLORS.magenta,
  THERMAL_COLORS.crimson,
  THERMAL_COLORS.red,
  THERMAL_COLORS.ember,
  THERMAL_COLORS.orange,
  THERMAL_COLORS.amber,
  THERMAL_COLORS.gold,
  THERMAL_COLORS.goldSoft,
  THERMAL_COLORS.cream,
];

interface HeatBlobProps {
  blob: Blob;
  scale: number;
  index: number;
}

function HeatBlob({ blob, scale, index }: HeatBlobProps) {
  const breath = useSharedValue(0);

  useEffect(() => {
    const duration = 3600 + index * 700;
    breath.value = withDelay(
      index * 180,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [breath, index]);

  const padX = blob.blur * 2;
  const padY = blob.blur * 2;
  const boxWidth = (blob.w + padX * 2) * scale;
  const boxHeight = (blob.h + padY * 2) * scale;
  const rx = blob.w / 2;
  const coreStop = Math.max(0.05, (rx - blob.blur) / (rx + padX));
  const driftX = (index % 2 === 0 ? 1 : -1) * 6 * scale;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.82, 1]),
    transform: [
      { translateX: interpolate(breath.value, [0, 1], [0, driftX]) },
      { translateY: interpolate(breath.value, [0, 1], [0, -4 * scale]) },
      { scale: interpolate(breath.value, [0, 1], [1, blob.pulse]) },
    ],
  }));

  const gradientId = `heat-${index}`;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: (blob.x - padX) * scale,
          top: (blob.y - padY) * scale,
          width: boxWidth,
          height: boxHeight,
        },
        animatedStyle,
      ]}
    >
      <Svg width={boxWidth} height={boxHeight}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={blob.opacity} />
            <Stop offset={coreStop} stopColor={blob.color} stopOpacity={blob.opacity * 0.92} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={boxWidth / 2}
          cy={boxHeight / 2}
          rx={boxWidth / 2}
          ry={boxHeight / 2}
          fill={`url(#${gradientId})`}
        />
      </Svg>
    </Animated.View>
  );
}

interface SensorGridProps {
  width: number;
  height: number;
}

export function SensorGrid({ width, height }: SensorGridProps) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="sensor-grid" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <Path d="M0.5 0V10M0 0.5H10" stroke="#000000" strokeOpacity={0.28} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#sensor-grid)" />
    </Svg>
  );
}

interface ScanSweepProps {
  scanKey: number;
  height: number;
}

function ScanSweep({ scanKey, height }: ScanSweepProps) {
  const progress = useSharedValue(-1);

  useEffect(() => {
    progress.value = -0.1;
    progress.value = withSequence(
      withTiming(1.1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      withTiming(-1, { duration: 0 }),
    );
  }, [scanKey, progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0 ? 0 : interpolate(progress.value, [0, 0.8, 1.1], [0.9, 0.6, 0]),
    transform: [{ translateY: progress.value * height }],
  }));

  return (
    <Animated.View style={[styles.sweep, sweepStyle]}>
      <Svg width="100%" height={SWEEP_HEIGHT}>
        <Defs>
          <LinearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.gold} stopOpacity={0} />
            <Stop offset="0.85" stopColor={THERMAL_COLORS.gold} stopOpacity={0.18} />
            <Stop offset="1" stopColor={THERMAL_COLORS.cream} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={SWEEP_HEIGHT} fill="url(#sweep)" />
      </Svg>
    </Animated.View>
  );
}

const FIGMA_WIDTH = 402;
const SWEEP_HEIGHT = 90;

interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
  blur: number;
  /** Max breathing scale */
  pulse: number;
}

const NAVY_FLOOR: Blob = { x: -40, y: 640, w: 480, h: 420, color: THERMAL_COLORS.navy, opacity: 1, blur: 45, pulse: 1.04 };

const PRESETS: Record<ThermalPreset, Array<Blob>> = {
  pulse: [
    { x: -80, y: -90, w: 540, h: 540, color: THERMAL_COLORS.indigo, opacity: 0.9, blur: 50, pulse: 1.03 },
    NAVY_FLOOR,
    { x: 0, y: 30, w: 400, h: 340, color: THERMAL_COLORS.magenta, opacity: 0.8, blur: 40, pulse: 1.05 },
    { x: 60, y: 80, w: 280, h: 220, color: THERMAL_COLORS.red, opacity: 0.8, blur: 30, pulse: 1.08 },
    { x: 110, y: 115, w: 180, h: 140, color: THERMAL_COLORS.orange, opacity: 0.85, blur: 22, pulse: 1.12 },
    { x: 155, y: 150, w: 96, h: 70, color: THERMAL_COLORS.gold, opacity: 0.85, blur: 15, pulse: 1.18 },
  ],
  decide: [
    { x: -90, y: -70, w: 540, h: 540, color: THERMAL_COLORS.indigo, opacity: 0.9, blur: 50, pulse: 1.03 },
    { x: 180, y: -40, w: 300, h: 300, color: THERMAL_COLORS.magenta, opacity: 0.55, blur: 40, pulse: 1.06 },
    { x: -40, y: 620, w: 480, h: 420, color: THERMAL_COLORS.navy, opacity: 1, blur: 45, pulse: 1.04 },
    { x: 30, y: 300, w: 300, h: 220, color: THERMAL_COLORS.magenta, opacity: 0.75, blur: 35, pulse: 1.06 },
    { x: 70, y: 330, w: 220, h: 160, color: THERMAL_COLORS.red, opacity: 0.7, blur: 28, pulse: 1.09 },
    { x: 110, y: 350, w: 140, h: 100, color: THERMAL_COLORS.orange, opacity: 0.7, blur: 20, pulse: 1.12 },
  ],
  detail: [
    { x: -90, y: -80, w: 540, h: 540, color: THERMAL_COLORS.indigo, opacity: 0.9, blur: 50, pulse: 1.03 },
    NAVY_FLOOR,
    { x: 10, y: 230, w: 380, h: 320, color: THERMAL_COLORS.magenta, opacity: 0.8, blur: 40, pulse: 1.05 },
    { x: 70, y: 280, w: 260, h: 220, color: THERMAL_COLORS.red, opacity: 0.8, blur: 30, pulse: 1.08 },
    { x: 115, y: 320, w: 170, h: 130, color: THERMAL_COLORS.orange, opacity: 0.85, blur: 22, pulse: 1.12 },
    { x: 160, y: 350, w: 90, h: 70, color: THERMAL_COLORS.gold, opacity: 0.85, blur: 15, pulse: 1.18 },
  ],
  rulebook: [
    { x: -120, y: -120, w: 540, h: 540, color: THERMAL_COLORS.indigo, opacity: 0.9, blur: 50, pulse: 1.03 },
    NAVY_FLOOR,
    { x: 200, y: -60, w: 320, h: 280, color: THERMAL_COLORS.magenta, opacity: 0.75, blur: 40, pulse: 1.06 },
    { x: 240, y: -20, w: 220, h: 180, color: THERMAL_COLORS.red, opacity: 0.55, blur: 30, pulse: 1.1 },
  ],
  power: [
    { x: -60, y: 520, w: 520, h: 420, color: THERMAL_COLORS.navy, opacity: 1, blur: 45, pulse: 1.03 },
    { x: -120, y: 40, w: 560, h: 640, color: '#3A0CA3', opacity: 0.95, blur: 50, pulse: 1.03 },
    { x: -10, y: 120, w: 420, h: 420, color: THERMAL_COLORS.magenta, opacity: 1, blur: 40, pulse: 1.05 },
    { x: 40, y: 170, w: 320, h: 320, color: THERMAL_COLORS.red, opacity: 1, blur: 30, pulse: 1.07 },
    { x: 85, y: 215, w: 230, h: 230, color: THERMAL_COLORS.orange, opacity: 1, blur: 23, pulse: 1.1 },
    { x: 125, y: 255, w: 150, h: 150, color: THERMAL_COLORS.gold, opacity: 1, blur: 18, pulse: 1.14 },
    { x: 162, y: 292, w: 76, h: 76, color: THERMAL_COLORS.cream, opacity: 1, blur: 11, pulse: 1.2 },
  ],
};

const styles = StyleSheet.create({
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -SWEEP_HEIGHT,
    height: SWEEP_HEIGHT,
  },
});
