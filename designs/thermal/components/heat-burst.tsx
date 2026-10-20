import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { TIMING } from '../motion';
import { THERMAL_COLORS } from '../theme';

interface HeatBurstProps {
  width: number;
  height: number;
  /** Vertical centre of the burst as a fraction of the height (0.45 = Rank Up) */
  centerY?: number;
  /** Replays the burst-out animation when changed */
  burstKey?: number;
  /**
   * Keeps the heat moving after the burst: rings pulse in a cascade so the
   * bands travel outward from the core, and the whole burst drifts slowly
   * along the vertical axis on an endless loop.
   */
  flow?: boolean;
  /**
   * Shape of the hot core. `pulse` is the classic oval burst; the others
   * grow the same heat rings around a symbol (onboarding: ✓ vote, ⚡ power).
   */
  shape?: HeatShape;
  /**
   * When `shape` changes, the heat rings flow from the old core into the new
   * one (a short stepped morph) instead of snapping.
   */
  morph?: boolean;
}

export type HeatShape = 'pulse' | 'check' | 'bolt';

/** Concentric pixel rings that burst outward, hottest in the middle */
export function HeatBurst({
  width,
  height,
  centerY = 0.45,
  burstKey = 0,
  flow = false,
  shape = 'pulse',
  morph = false,
}: HeatBurstProps) {
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!flow) return;
    drift.value = withRepeat(withTiming(1, { duration: FLOW_DRIFT_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [drift, flow]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: flow ? -FLOW_DRIFT_PT / 2 + drift.value * FLOW_DRIFT_PT : 0 }],
  }));

  // Per-cell band value for the current shape (see buildHeatField)
  const field = useMemo(() => buildHeatField(shape, width, height, centerY), [shape, width, height, centerY]);
  const lastField = useRef(field);
  const [blend, setBlend] = useState<{ from: Float32Array; t: number } | null>(null);

  useEffect(() => {
    const from = lastField.current;
    lastField.current = field;
    if (!morph || from === field || from.length !== field.length) return;

    let step = 0;
    setBlend({ from, t: 0 });
    const timer = setInterval(() => {
      step += 1;
      if (step >= MORPH_STEPS) {
        clearInterval(timer);
        setBlend(null);
        return;
      }
      const t = step / MORPH_STEPS;
      setBlend({ from, t: t * t * (3 - 2 * t) });
    }, MORPH_DURATION / MORPH_STEPS);
    return () => clearInterval(timer);
  }, [field, morph]);

  const rings = useMemo(() => {
    const values = blend ? lerpField(blend.from, field, blend.t) : field;
    return BURST_RINGS.map((ring, index) => ({
      color: ring.color,
      d: ringPath(values, BURST_RINGS.length - 1 - index, width, height),
    }));
  }, [field, blend, width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: THERMAL_COLORS.void }]} />
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        {rings.map((ring, index) => (
          <BurstRing
            key={ring.color}
            index={index}
            d={ring.d}
            color={ring.color}
            width={width}
            height={height}
            burstKey={burstKey}
            flow={flow}
          />
        ))}
      </Animated.View>
    </View>
  );
}

interface BurstRingProps {
  index: number;
  d: string;
  color: string;
  width: number;
  height: number;
  burstKey: number;
  flow: boolean;
}

function BurstRing({ index, d, color, width, height, burstKey, flow }: BurstRingProps) {
  const scale = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    const delay = (BURST_RINGS.length - index) * 55;
    scale.value = 0;
    scale.value = withDelay(delay, withTiming(1, TIMING.emphasis));
    // In flow mode the rings are phase-shifted evenly so one wave travels outward per period
    const period = flow ? FLOW_PULSE_MS : 1400;
    const stagger = flow ? period / BURST_RINGS.length : 90;
    pulse.value = 0;
    pulse.value = withDelay(
      1300 + index * stagger,
      withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [index, scale, pulse, burstKey, flow]);

  const amplitude = flow ? 0.06 : 0.025;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: height * -0.05 }, { scale: scale.value * (1 + pulse.value * amplitude) }, { translateY: height * 0.05 }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <Svg width={width} height={height}>
        <Path d={d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface SparksProps {
  width: number;
  height: number;
}

/** Floating ember squares */
export function Sparks({ width, height }: SparksProps) {
  const sparks = useMemo(
    () =>
      SPARK_SEEDS.map(([x, y, size], index) => ({
        x: (x / 402) * width,
        y: (y / 874) * height,
        size,
        color: index % 3 === 0 ? THERMAL_COLORS.gold : THERMAL_COLORS.cream,
        index,
      })),
    [width, height],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {sparks.map((spark) => (
        <Spark key={spark.index} {...spark} />
      ))}
    </View>
  );
}

interface SparkProps {
  x: number;
  y: number;
  size: number;
  color: string;
  index: number;
}

function Spark({ x, y, size, color, index }: SparkProps) {
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withDelay(
      500 + (index % 7) * 140,
      withRepeat(
        withSequence(withTiming(1, { duration: 1800 + (index % 5) * 300, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })),
        -1,
      ),
    );
  }, [index, rise]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: rise.value < 0.05 ? rise.value * 20 : 1 - rise.value,
    transform: [{ translateY: -rise.value * 90 }, { translateX: Math.sin(rise.value * 6 + index) * 6 }],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', left: x, top: y, width: size, height: size, backgroundColor: color }, animatedStyle]}
    />
  );
}

/**
 * Continuous "band" value per 12pt cell: 0 on the edge of the cream core,
 * +1 per ring outward (7 = navy edge), negative inside the core. Pulse and
 * shaped cores share this scale, so two fields can be blended into a morph.
 */
function buildHeatField(shape: HeatShape, width: number, height: number, centerY: number): Float32Array {
  const columns = Math.ceil(width / BURST_CELL);
  const rows = Math.ceil(height / BURST_CELL);
  const values = new Float32Array(columns * rows);
  const cx = width / 2;
  const cy = height * centerY;
  const scale = width / FIGMA_WIDTH;
  const sdf = shape === 'pulse' ? null : SHAPE_SDFS[shape];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * BURST_CELL + BURST_CELL / 2 - cx;
      const y = row * BURST_CELL + BURST_CELL / 2 - cy;
      let band: number;
      if (sdf) {
        const distance = sdf(x / scale, y / scale / SHAPE_STRETCH) * SHAPE_STRETCH;
        band = toBand(distance, SHAPE_BAND_STOPS);
      } else {
        const radius = Math.hypot(x / (width / 2), y / ((height * 0.92) / 2));
        band = toBand(radius, PULSE_BAND_STOPS);
      }
      values[row * columns + column] = band;
    }
  }
  return values;
}

/** Piecewise-linear map from a distance onto ring index, extrapolating at both ends */
function toBand(value: number, stops: Array<number>): number {
  if (value <= stops[0]) return (value - stops[0]) / (stops[1] - stops[0]);
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i]) return i - 1 + (value - stops[i - 1]) / (stops[i] - stops[i - 1]);
  }
  const last = stops.length - 1;
  return last + (value - stops[last]) / (stops[last] - stops[last - 1]);
}

function lerpField(from: Float32Array, to: Float32Array, t: number): Float32Array {
  const out = new Float32Array(to.length);
  for (let i = 0; i < to.length; i++) out[i] = from[i] + (to[i] - from[i]) * t;
  return out;
}

/** Cells whose band is within `band` (0 = cream … 7 = navy), merged into row runs */
function ringPath(values: Float32Array, band: number, width: number, height: number): string {
  const columns = Math.ceil(width / BURST_CELL);
  const rows = Math.ceil(height / BURST_CELL);
  const parts: Array<string> = [];
  for (let row = 0; row < rows; row++) {
    let runStart = -1;
    for (let column = 0; column <= columns; column++) {
      const inside = column < columns && values[row * columns + column] <= band;
      if (inside && runStart < 0) runStart = column;
      if (!inside && runStart >= 0) {
        const x = runStart * BURST_CELL;
        const w = (column - runStart) * BURST_CELL;
        parts.push(`M${x} ${row * BURST_CELL}h${w}v${BURST_CELL}h${-w}z`);
        runStart = -1;
      }
    }
  }
  return parts.join('');
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}

/** Signed distance to a thick polyline; points are Figma pt around the core */
function strokeSdf(points: Array<[number, number]>, halfWidth: number) {
  const p = points.map(([x, y]) => [x, y / SHAPE_STRETCH]);
  return (x: number, y: number) => {
    let d = Infinity;
    for (let i = 1; i < p.length; i++) d = Math.min(d, segmentDistance(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]));
    return d - halfWidth / SHAPE_STRETCH;
  };
}

/** Signed distance to a closed polygon (negative inside) */
function polygonSdf(points: Array<[number, number]>) {
  const p = points.map(([x, y]) => [x, y / SHAPE_STRETCH]);
  return (x: number, y: number) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      d = Math.min(d, segmentDistance(x, y, p[j][0], p[j][1], p[i][0], p[i][1]));
      if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) {
        inside = !inside;
      }
    }
    return inside ? -d : d;
  };
}

const FIGMA_WIDTH = 402;
/** Rings are this much thicker vertically than horizontally */
const SHAPE_STRETCH = 1.6;
/** Ring edges around a shaped core (Figma pt), cream → navy */
const SHAPE_BAND_STOPS = [0, 26, 52, 80, 108, 140, 176, 214];
/** Ring edges of the oval pulse (normalised radius), cream → navy (BURST_RINGS sizes) */
const PULSE_BAND_STOPS = [0.43, 0.56, 0.7, 0.84, 0.98, 1.14, 1.32, 1.5];
const MORPH_DURATION = 520;
const MORPH_STEPS = 10;

/** Same geometry as the Figma "Onboarding C v2" drafts */
const SHAPE_SDFS: Record<Exclude<HeatShape, 'pulse'>, (x: number, y: number) => number> = {
  check: strokeSdf([[-82, 2], [-24, 62], [86, -78]], 30),
  bolt: polygonSdf([[8, -118], [48, -118], [18, -28], [66, -28], [-14, 120], [4, 18], [-46, 18]]),
};


const BURST_CELL = 12;
const FLOW_PULSE_MS = 1800;
const FLOW_DRIFT_MS = 4200;
const FLOW_DRIFT_PT = 28;

const BURST_RINGS: Array<{ size: number; color: string }> = [
  { size: 1.5, color: THERMAL_COLORS.navy },
  { size: 1.32, color: THERMAL_COLORS.indigo },
  { size: 1.14, color: THERMAL_COLORS.violet },
  { size: 0.98, color: THERMAL_COLORS.magenta },
  { size: 0.84, color: THERMAL_COLORS.red },
  { size: 0.7, color: THERMAL_COLORS.orange },
  { size: 0.56, color: THERMAL_COLORS.gold },
  { size: 0.43, color: THERMAL_COLORS.cream },
];

const SPARK_SEEDS: Array<[number, number, number]> = [
  [130, 640, 8], [270, 540, 8], [140, 600, 4], [360, 680, 4], [360, 590, 4], [330, 300, 4],
  [370, 480, 8], [20, 250, 4], [160, 190, 8], [260, 770, 4], [240, 220, 8], [340, 540, 4],
  [200, 590, 8], [280, 240, 4], [310, 740, 4], [30, 360, 4], [390, 210, 4], [50, 770, 8],
  [350, 60, 8], [90, 620, 8], [350, 480, 4], [80, 490, 4], [220, 580, 4], [280, 610, 4],
];
