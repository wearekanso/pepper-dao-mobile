import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { THERMAL_COLORS } from '../theme';

interface PixelCoreProps {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX?: number;
  radiusY?: number;
  /** 0…1 — hotter cores reach further out and burn whiter */
  intensity?: number;
  /** Background animation style (temporary A/B/C pick on the Power screen) */
  variant?: PixelCoreVariant;
  /** Vertical offset of the screen's 10pt sensor grid inside this stage, so cards sit on its cells */
  gridOffsetY?: number;
  /** Backdrop colour at a stage point (flip variant) */
  sampleColor?: (x: number, y: number) => string;
  /**
   * Flip variant only: how far a stage point is from where the wave starts.
   * Defaults to the straight distance from (centerX, centerY), i.e. round
   * rings; pass a shape's distance field to make the wave follow that shape.
   */
  distanceAt?: (x: number, y: number) => number;
  /**
   * Flip variant only: a second wave follows the first this many points
   * behind it ("ba-dum"). Cells whose distance is not finite never flip.
   */
  beatGap?: number;
  /** Flip variant only: length of one full cycle in ms (default FLIP_DURATION) */
  cycleMs?: number;
}

export type PixelCoreVariant = 'flicker' | 'ripple' | 'embers' | 'spread' | 'lift' | 'heartbeat' | 'shockwave' | 'heatwave' | 'flip';

export const PIXEL_CORE_VARIANTS: Array<{ value: PixelCoreVariant; label: string }> = [
  { value: 'flicker', label: '01 FLICKER' },
  { value: 'ripple', label: '02 RIPPLE' },
  { value: 'embers', label: '03 EMBERS' },
  { value: 'spread', label: '04 WAVE' },
  { value: 'lift', label: '05 GRID' },
  { value: 'heartbeat', label: '06 HEARTBEAT' },
  { value: 'shockwave', label: '07 SHOCKWAVE' },
  { value: 'heatwave', label: '08 HEATWAVE' },
  { value: 'flip', label: '09 FLIP' },
];

/**
 * Pixelated heat core: 10pt cells colored by distance from the center plus
 * noise. Two differently-seeded frames cross-fade so the core flickers like
 * a live thermal reading.
 */
export function PixelCore({
  variant = 'flicker',
  gridOffsetY = 0,
  sampleColor = sampleNothing,
  distanceAt,
  beatGap = 0,
  cycleMs = FLIP_DURATION,
  ...props
}: PixelCoreProps) {
  if (variant === 'flip') {
    return (
      <FlipCore
        {...props}
        gridOffsetY={gridOffsetY}
        sampleColor={sampleColor}
        distanceAt={distanceAt}
        beatGap={beatGap}
        cycleMs={cycleMs}
      />
    );
  }
  if (variant === 'ripple') return <RippleCore {...props} />;
  if (variant === 'embers') return <EmberCore {...props} />;
  if (variant === 'spread') return <SpreadCore {...props} />;
  if (variant === 'lift') return <LiftCore {...props} />;
  if (variant === 'heartbeat') return <HeartbeatCore {...props} />;
  if (variant === 'shockwave') return <ShockwaveCore {...props} />;
  if (variant === 'heatwave') return <HeatWaveCore {...props} />;
  return <FlickerCore {...props} />;
}

type CoreProps = Omit<PixelCoreProps, 'variant' | 'gridOffsetY' | 'sampleColor' | 'distanceAt' | 'beatGap' | 'cycleMs'>;

function sampleNothing(): string {
  return THERMAL_COLORS.magenta;
}

function FlickerCore({
  width,
  height,
  centerX,
  centerY,
  radiusX = 125,
  radiusY = 170,
  intensity = 0.5,
}: CoreProps) {
  const flicker = useSharedValue(0);

  useEffect(() => {
    flicker.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [flicker]);

  const frameA = useMemo(
    () => buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 7 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );
  const frameB = useMemo(
    () => buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 23 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );

  const frameBStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));

  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {frameA.map((layer) => (
          <Path key={layer.color} d={layer.d} fill={layer.color} />
        ))}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, frameBStyle]} pointerEvents="none">
        <Svg width={width} height={height}>
          {frameB.map((layer) => (
            <Path key={layer.color} d={layer.d} fill={layer.color} />
          ))}
        </Svg>
      </Animated.View>
    </>
  );
}

/**
 * Ripple: a slow heat wave rolls outward from the center. The noise stays
 * fixed and only the wave moves, stepped frame by frame like a sprite.
 */
function RippleCore({
  width,
  height,
  centerX,
  centerY,
  radiusX = 125,
  radiusY = 170,
  intensity = 0.5,
}: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const frames = useMemo(
    () =>
      Array.from({ length: RIPPLE_FRAMES }, (_, index) =>
        buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 7, noise: 0.2, wavePhase: index / RIPPLE_FRAMES }),
      ),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );

  return (
    <>
      {frames.map((frame, index) => (
        <SteppedFrame key={index} index={index} count={RIPPLE_FRAMES} progress={progress} frame={frame} width={width} height={height} />
      ))}
    </>
  );
}

/**
 * Wave: a stadium-style wave rolls from the core out to the stage edges.
 * Cells are grouped into concentric pixel rings; each ring's opacity rises
 * and falls smoothly as the crest passes, so the band moves as one piece.
 */
function SpreadCore({
  width,
  height,
  centerX,
  centerY,
  radiusX = 125,
  radiusY = 170,
  intensity = 0.5,
}: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: WAVE_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const core = useMemo(
    () => buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 7 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );
  const { rings, travel } = useMemo(() => buildWaveRings(width, height, centerX, centerY), [width, height, centerX, centerY]);

  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {core.map((layer) => (
          <Path key={layer.color} d={layer.d} fill={layer.color} />
        ))}
      </Svg>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {rings.map((ring) => (
          <WaveRing key={ring.radius} d={ring.d} radius={ring.radius} travel={travel} progress={progress} />
        ))}
      </Svg>
    </>
  );
}

function WaveRing({ d, radius, travel, progress }: { d: string; radius: number; travel: number; progress: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    // Crest runs from just inside the center to past the far corner, leaving a rest gap
    const front = progress.value * travel - WAVE_BAND;
    const offset = (front - radius) / WAVE_BAND;
    let level = 0;
    if (offset > -1 && offset <= 0) level = 1 + offset;
    else if (offset > 0 && offset < 2.5) level = 1 - offset / 2.5;
    const eased = level * level * (3 - 2 * level);
    return { fillOpacity: eased * WAVE_PEAK_OPACITY };
  });

  return <AnimatedPath d={d} fill={THERMAL_COLORS.gold} animatedProps={animatedProps} />;
}

/** Bucket every cell by its distance from the center into CELL-wide rings */
function buildWaveRings(width: number, height: number, centerX: number, centerY: number) {
  const buckets = new Map<number, Array<string>>();
  let maxRadius = 0;

  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const radius = Math.round(Math.hypot(x + CELL / 2 - centerX, y + CELL / 2 - centerY) / CELL) * CELL;
      maxRadius = Math.max(maxRadius, radius);
      const cells = buckets.get(radius) ?? [];
      cells.push(`M${x} ${y}h${CELL}v${CELL}h-${CELL}z`);
      buckets.set(radius, cells);
    }
  }

  const rings = Array.from(buckets.entries()).map(([radius, cells]) => ({ radius, d: cells.join('') }));
  return { rings, travel: maxRadius * 1.3 + WAVE_BAND * 3.5 };
}

/**
 * Grid wave: no heat core at all — just one color of pixels across the whole
 * stage. As the crest rolls from the center to the edges each pixel grows
 * from nothing to a full cell and shrinks back, so the wave reads as pixels
 * standing up in turn rather than colors changing.
 */
function LiftCore({ width, height, centerX, centerY }: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: GRID_WAVE_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const { rings, travel } = useMemo(() => buildGridRings(width, height, centerX, centerY), [width, height, centerX, centerY]);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((ring) => (
        <GridRing key={ring.radius} radius={ring.radius} centers={ring.centers} travel={travel} progress={progress} />
      ))}
    </Svg>
  );
}

function GridRing({
  radius,
  centers,
  travel,
  progress,
}: {
  radius: number;
  centers: Array<number>;
  travel: number;
  progress: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => {
    const front = progress.value * travel - GRID_WAVE_BAND;
    const offset = (front - radius) / GRID_WAVE_BAND;
    let level = 0;
    if (offset > -1 && offset <= 0) level = 1 + offset;
    else if (offset > 0 && offset < 2) level = 1 - offset / 2;
    const eased = level * level * (3 - 2 * level);
    if (eased < 0.03) return { d: 'M0 0' };

    // Each pixel grows from its own center, so the grid stays aligned
    const size = eased * GRID_DOT_MAX;
    const half = size / 2;
    let d = '';
    for (let i = 0; i < centers.length; i += 2) {
      d += `M${centers[i] - half} ${centers[i + 1] - half}h${size}v${size}h${-size}z`;
    }
    return { d };
  });

  return <AnimatedPath fill={THERMAL_COLORS.cream} fillOpacity={GRID_DOT_OPACITY} animatedProps={animatedProps} />;
}

/**
 * Flip: a card-flip wave over the sensor grid. Starting at the white hotspot
 * (centerX/centerY), every grid cell turns over like a card as the crest
 * passes — the full 10pt card folds to its edge around a vertical axis, opens
 * on its back face, holds, then turns back. Cards never grow from their centre.
 * Faces are sampled from the backdrop: the front is the glow just outward of
 * the card (one step cooler), the back the glow just inward (one step hotter),
 * so the wave matches the heat field all the way to the edges.
 */
function FlipCore({
  width,
  height,
  centerX,
  centerY,
  gridOffsetY,
  sampleColor,
  distanceAt,
  beatGap,
  cycleMs,
}: CoreProps & {
  gridOffsetY: number;
  sampleColor: (x: number, y: number) => string;
  distanceAt?: (x: number, y: number) => number;
  beatGap: number;
  cycleMs: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: cycleMs, easing: Easing.linear }), -1, false);
  }, [progress, cycleMs]);

  const { groups, travel } = useMemo(
    () => buildFlipGroups(width, height, centerX, centerY, gridOffsetY, sampleColor, distanceAt, beatGap),
    [width, height, centerX, centerY, gridOffsetY, sampleColor, distanceAt, beatGap],
  );

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {groups.map((group) => (
        <FlipGroup
          key={`${group.radius}-${group.front}-${group.back}`}
          group={group}
          travel={travel}
          beatGap={beatGap}
          progress={progress}
        />
      ))}
    </Svg>
  );
}

interface FlipGroupData {
  radius: number;
  front: string;
  back: string;
  /** Top-left corners of the cards in this group (flat x,y pairs) */
  corners: Array<number>;
}

interface FlipGroupProps {
  group: FlipGroupData;
  travel: number;
  beatGap: number;
  progress: SharedValue<number>;
}

function FlipGroup({ group, travel, beatGap, progress }: FlipGroupProps) {
  // 0 → 1 across this ring's flip: front folds (0–0.2), back opens (0.2–0.4), hold, back folds, front opens
  const turn = useDerivedValue(() => {
    const first = (progress.value * travel - group.radius) / FLIP_SPAN;
    if (beatGap <= 0 || (first > 0 && first < 1)) return first;
    // Second beat: the same wave again, beatGap points behind the first
    return (progress.value * travel - beatGap - group.radius) / FLIP_SPAN;
  });

  const cardPath = (widthFactor: number, t: number) => {
    'worklet';
    // The card also shrinks a little mid-turn and settles back to full size
    const size = CARD * (1 - FLIP_SHRINK * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
    const w = Math.max(0, size * widthFactor);
    if (w < 0.5) return 'M0 0';
    const insetX = (CELL - w) / 2;
    const insetY = CARD_GAP + (CARD - size) / 2;
    let d = '';
    for (let i = 0; i < group.corners.length; i += 2) {
      d += `M${group.corners[i] + insetX} ${group.corners[i + 1] + insetY}h${w}v${size}h${-w}z`;
    }
    return d;
  };

  // Soft envelope: the whole turn fades in and out (0 at the ends, 1 mid-turn),
  // and a face dims as it goes edge-on, like a card catching less light
  const shade = (t: number, widthFactor: number) => {
    'worklet';
    // Ramps to full strength twice as fast as a plain sine, so cards read crisply mid-turn
    return Math.min(1, Math.sin(Math.PI * t) * 2) * (0.72 + 0.28 * widthFactor);
  };

  const frontProps = useAnimatedProps(() => {
    const t = turn.value;
    if (t <= 0 || t >= 1 || (t >= 0.2 && t <= 0.8)) return { d: 'M0 0', fillOpacity: 0 };
    const folding = t < 0.2;
    const widthFactor = folding ? Math.cos((t / 0.2) * (Math.PI / 2)) : Math.sin(((t - 0.8) / 0.2) * (Math.PI / 2));
    return { d: cardPath(widthFactor, t), fillOpacity: FLIP_FRONT_OPACITY * shade(t, widthFactor) };
  });

  const backProps = useAnimatedProps(() => {
    const t = turn.value;
    if (t <= 0.2 || t >= 0.8) return { d: 'M0 0', fillOpacity: 0 };
    let widthFactor = 1;
    if (t < 0.4) widthFactor = Math.sin(((t - 0.2) / 0.2) * (Math.PI / 2));
    else if (t > 0.6) widthFactor = Math.cos(((t - 0.6) / 0.2) * (Math.PI / 2));
    return { d: cardPath(widthFactor, t), fillOpacity: FLIP_BACK_OPACITY * shade(t, widthFactor) };
  });

  return (
    <>
      <AnimatedPath fill={group.front} animatedProps={frontProps} />
      <AnimatedPath fill={group.back} animatedProps={backProps} />
    </>
  );
}

/**
 * Grid cells bucketed into rings around the hotspot, then split by their
 * sampled front/back colours. Aligned to the screen's sensor grid.
 */
function buildFlipGroups(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  gridOffsetY: number,
  sampleColor: (x: number, y: number) => string,
  distanceAt?: (x: number, y: number) => number,
  beatGap = 0,
) {
  const groups = new Map<string, FlipGroupData>();
  let maxRadius = 0;
  const startY = ((-gridOffsetY % CELL) + CELL) % CELL - CELL;

  for (let y = startY; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const distance = Math.hypot(cx - centerX, cy - centerY);
      const radius = Math.round((distanceAt ? distanceAt(cx, cy) : distance) / CELL) * CELL;
      // Out of the wave's reach (a shape's cutoff): this cell never flips
      if (!Number.isFinite(radius)) continue;
      maxRadius = Math.max(maxRadius, radius);

      // Unit vector pointing away from the hotspot (any direction at the very centre)
      const ux = distance > 0 ? (cx - centerX) / distance : 1;
      const uy = distance > 0 ? (cy - centerY) / distance : 0;
      const front = sampleColor(cx + ux * FLIP_SAMPLE_STEP, cy + uy * FLIP_SAMPLE_STEP);
      const back = sampleColor(cx - ux * FLIP_SAMPLE_STEP, cy - uy * FLIP_SAMPLE_STEP);

      const key = `${radius}|${front}|${back}`;
      const group = groups.get(key) ?? { radius, front, back, corners: [] };
      group.corners.push(x, y);
      groups.set(key, group);
    }
  }

  // Extra travel past the rim leaves a short rest beat before the next wave
  return { groups: Array.from(groups.values()), travel: maxRadius + beatGap + FLIP_SPAN + FLIP_REST };
}

/** Cell centers bucketed into CELL-wide rings around the center (flat x,y pairs) */
function buildGridRings(width: number, height: number, centerX: number, centerY: number) {
  const buckets = new Map<number, Array<number>>();
  let maxRadius = 0;

  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const radius = Math.round(Math.hypot(cx - centerX, cy - centerY) / CELL) * CELL;
      maxRadius = Math.max(maxRadius, radius);
      const centers = buckets.get(radius) ?? [];
      centers.push(cx, cy);
      buckets.set(radius, centers);
    }
  }

  const rings = Array.from(buckets.entries()).map(([radius, centers]) => ({ radius, centers }));
  return { rings, travel: maxRadius * 1.25 + GRID_WAVE_BAND * 3 };
}

/**
 * Heartbeat: the pepper's heat pulses out in a lub-dub rhythm. Each pulse
 * is a ring of grid pixels that grow and shrink as the crest passes. Pixels
 * take the thermal glow's own hue at their distance, one notch deeper, so
 * the wave reads as the heat field breathing rather than a bright band.
 */
function HeartbeatCore({ width, height, centerX, centerY }: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: HEARTBEAT_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const { rings, travel } = useMemo(() => buildGridRings(width, height, centerX, centerY), [width, height, centerX, centerY]);
  const maxRadius = rings.reduce((max, ring) => Math.max(max, ring.radius), 0);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((ring) => (
        <HeartbeatRing
          key={ring.radius}
          radius={ring.radius}
          centers={ring.centers}
          falloff={1 - (ring.radius / maxRadius) * 0.55}
          color={getFieldColor(ring.radius)}
          travel={travel}
          progress={progress}
        />
      ))}
    </Svg>
  );
}

function HeartbeatRing({
  radius,
  centers,
  falloff,
  color,
  travel,
  progress,
}: {
  radius: number;
  centers: Array<number>;
  falloff: number;
  color: string;
  travel: number;
  progress: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => {
    // Sharp rise at the crest, long cooling tail behind it
    const pulse = (front: number) => {
      const offset = (front - radius) / HEARTBEAT_BAND;
      if (offset > -0.6 && offset <= 0) return 1 + offset / 0.6;
      if (offset > 0 && offset < 3) return 1 - offset / 3;
      return 0;
    };
    const first = pulse(progress.value * travel - HEARTBEAT_BAND);
    const second = pulse((progress.value - HEARTBEAT_GAP) * travel - HEARTBEAT_BAND) * 0.6;
    const heat = Math.max(first, second);
    const eased = heat * heat * (3 - 2 * heat);
    if (eased < 0.04) return { d: 'M0 0' };

    const size = eased * HEARTBEAT_DOT_MAX * falloff;
    const half = size / 2;
    let d = '';
    for (let i = 0; i < centers.length; i += 2) {
      d += `M${centers[i] - half} ${centers[i + 1] - half}h${size}v${size}h${-size}z`;
    }
    return { d };
  });

  return <AnimatedPath fill={color} fillOpacity={HEARTBEAT_OPACITY} animatedProps={animatedProps} />;
}

/** Thermal glow hue at a given distance from the core, one notch deeper than the background */
function getFieldColor(radius: number): string {
  const stop = FIELD_COLOR_STOPS.find((entry) => radius <= entry.radius);
  return stop?.color ?? THERMAL_COLORS.violet;
}

/**
 * Shockwave: a quiet dot-matrix field where nothing changes color or size.
 * The wave is pure motion — as the crest passes, each dot is pushed outward
 * from the core and eases back into place, like a ripple through sand.
 */
function ShockwaveCore({ width, height, centerX, centerY }: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: SHOCK_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const { rings, travel } = useMemo(() => buildShockRings(width, height, centerX, centerY), [width, height, centerX, centerY]);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((ring) => (
        <ShockRing key={ring.radius} ring={ring} travel={travel} progress={progress} />
      ))}
    </Svg>
  );
}

interface ShockRingData {
  radius: number;
  /** Flat [x, y, ux, uy, …]: dot center plus unit vector pointing away from the core */
  dots: Array<number>;
  restPath: string;
  color: string;
}

function ShockRing({ ring, travel, progress }: { ring: ShockRingData; travel: number; progress: SharedValue<number> }) {
  const { radius, dots, restPath } = ring;

  const animatedProps = useAnimatedProps(() => {
    const front = progress.value * travel - SHOCK_BAND;
    const offset = (front - radius) / SHOCK_BAND;
    // Push out as the crest arrives, then a slow, slightly springy return
    let push = 0;
    if (offset > -1 && offset <= 0) {
      const t = 1 + offset;
      push = t * t * (3 - 2 * t);
    } else if (offset > 0 && offset < 3) {
      const t = offset / 3;
      push = Math.cos(t * Math.PI * 1.5) * (1 - t);
    }
    if (Math.abs(push) < 0.02) return { d: restPath };

    const shift = push * SHOCK_DISTANCE;
    const half = SHOCK_DOT / 2;
    let d = '';
    for (let i = 0; i < dots.length; i += 4) {
      const x = dots[i] + dots[i + 2] * shift - half;
      const y = dots[i + 1] + dots[i + 3] * shift - half;
      d += `M${x} ${y}h${SHOCK_DOT}v${SHOCK_DOT}h${-SHOCK_DOT}z`;
    }
    return { d };
  });

  return <AnimatedPath fill={ring.color} fillOpacity={SHOCK_OPACITY} animatedProps={animatedProps} />;
}

/** Sparse dot grid bucketed into rings, with each dot's outward direction precomputed */
function buildShockRings(width: number, height: number, centerX: number, centerY: number) {
  const buckets = new Map<number, Array<number>>();
  let maxRadius = 0;

  for (let y = SHOCK_SPACING / 2; y < height; y += SHOCK_SPACING) {
    for (let x = SHOCK_SPACING / 2; x < width; x += SHOCK_SPACING) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy);
      const radius = Math.round(distance / CELL) * CELL;
      maxRadius = Math.max(maxRadius, radius);
      const dots = buckets.get(radius) ?? [];
      dots.push(x, y, distance > 0 ? dx / distance : 0, distance > 0 ? dy / distance : 0);
      buckets.set(radius, dots);
    }
  }

  const half = SHOCK_DOT / 2;
  const rings: Array<ShockRingData> = Array.from(buckets.entries()).map(([radius, dots]) => {
    let restPath = '';
    for (let i = 0; i < dots.length; i += 4) {
      restPath += `M${dots[i] - half} ${dots[i + 1] - half}h${SHOCK_DOT}v${SHOCK_DOT}h${-SHOCK_DOT}z`;
    }
    return { radius, dots, restPath, color: getFieldColor(radius) };
  });
  return { rings, travel: maxRadius * 1.25 + SHOCK_BAND * 4 };
}

function SteppedFrame({
  index,
  count,
  progress,
  frame,
  width,
  height,
}: {
  index: number;
  count: number;
  progress: SharedValue<number>;
  frame: ReturnType<typeof buildFrame>;
  width: number;
  height: number;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.floor(progress.value * count) % count === index ? 1 : 0,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents="none">
      <Svg width={width} height={height}>
        {frame.map((layer, layerIndex) => (
          <Path key={`${layerIndex}-${layer.color}`} d={layer.d} fill={layer.color} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * Embers: the core holds still and breathes very slowly while a handful of
 * pixel sparks drift up out of it and fade.
 */
function EmberCore({
  width,
  height,
  centerX,
  centerY,
  radiusX = 125,
  radiusY = 170,
  intensity = 0.5,
}: CoreProps) {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breath]);

  const frameA = useMemo(
    () => buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 7 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );
  const frameB = useMemo(
    () => buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity: Math.min(1, intensity + 0.15), seed: 7 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );
  const embers = useMemo(() => buildEmbers(centerX, centerY, radiusX, radiusY), [centerX, centerY, radiusX, radiusY]);

  const frameBStyle = useAnimatedStyle(() => ({ opacity: breath.value * 0.7 }));

  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {frameA.map((layer) => (
          <Path key={layer.color} d={layer.d} fill={layer.color} />
        ))}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, frameBStyle]} pointerEvents="none">
        <Svg width={width} height={height}>
          {frameB.map((layer) => (
            <Path key={layer.color} d={layer.d} fill={layer.color} />
          ))}
        </Svg>
      </Animated.View>
      {embers.map((ember, index) => (
        <Ember key={index} {...ember} />
      ))}
    </>
  );
}

interface EmberSpec {
  x: number;
  y: number;
  size: number;
  rise: number;
  sway: number;
  duration: number;
  delay: number;
  color: string;
}

function Ember({ x, y, size, rise, sway, duration, delay, color }: EmberSpec) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [progress, delay, duration]);

  // Snap motion to a 4pt grid so sparks move like sprites, not vectors
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = p < 0.15 ? p / 0.15 : Math.max(0, (1 - p) / 0.85);
    return {
      opacity: Math.round(opacity * 4) / 4,
      transform: [
        { translateX: Math.round((Math.sin(p * Math.PI * 2) * sway) / 4) * 4 },
        { translateY: -Math.round((p * rise) / 4) * 4 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: x, top: y, width: size, height: size, backgroundColor: color }, animatedStyle]}
    />
  );
}

function buildEmbers(centerX: number, centerY: number, radiusX: number, radiusY: number): Array<EmberSpec> {
  const random = mulberry32(41);
  const colors = [THERMAL_COLORS.cream, THERMAL_COLORS.gold, THERMAL_COLORS.cream];
  return Array.from({ length: EMBER_COUNT }, (_, index) => ({
    // Start along the core's upper rim so sparks read against the cooler field
    x: Math.round((centerX + (random() - 0.5) * radiusX * 1.1) / 4) * 4,
    y: Math.round((centerY - radiusY * 0.55 + random() * 40) / 4) * 4,
    size: random() > 0.5 ? 8 : 6,
    rise: 140 + random() * 80,
    sway: 4 + random() * 8,
    duration: 4200 + random() * 2800,
    delay: index * 520,
    color: colors[index % colors.length],
  }));
}

/**
 * Heatwave: the core's own cells stay exactly where they are; a heat crest
 * rolls outward through them. As it passes, each cell borrows the colour of
 * the band one step hotter (magenta → red → orange → gold → cream) and
 * swells by a couple of points, then settles back. Stepped like a sprite.
 */
function HeatWaveCore({
  width,
  height,
  centerX,
  centerY,
  radiusX = 125,
  radiusY = 170,
  intensity = 0.5,
}: CoreProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: HEATWAVE_DURATION, easing: Easing.linear }), -1, false);
  }, [progress]);

  const frames = useMemo(
    () => buildHeatWaveFrames({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed: 7, noise: 0.2 }),
    [width, height, centerX, centerY, radiusX, radiusY, intensity],
  );

  return (
    <>
      {frames.map((frame, index) => (
        <SteppedFrame key={index} index={index} count={HEATWAVE_FRAMES} progress={progress} frame={frame} width={width} height={height} />
      ))}
    </>
  );
}

interface HeatCell {
  x: number;
  y: number;
  /** 0 at the core, ~1.15 at the rim */
  distance: number;
  /** Index into HEAT_PALETTE */
  band: number;
}

/** Same cells as buildFrame, kept individually so the wave can recolour them */
function buildHeatCells({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed, noise = 0.32 }: FrameOptions): Array<HeatCell> {
  const random = mulberry32(seed);
  const cells: Array<HeatCell> = [];
  const reach = 0.75 + intensity * 0.5;

  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const dx = (x + CELL / 2 - centerX) / (radiusX * reach);
      const dy = (y + CELL / 2 - centerY) / (radiusY * reach);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1.15) continue;

      const heat = 1 - distance + (random() - 0.5) * noise + intensity * 0.08;
      const band = pickBand(heat);
      if (band < 0) continue;
      cells.push({ x, y, distance, band });
    }
  }
  return cells;
}

function buildHeatWaveFrames(options: FrameOptions) {
  const cells = buildHeatCells(options);

  return Array.from({ length: HEATWAVE_FRAMES }, (_, frameIndex) => {
    const phase = frameIndex / HEATWAVE_FRAMES;
    const base = new Map<string, Array<string>>();
    const lit = new Map<string, Array<string>>();

    for (const cell of cells) {
      // Distance of this cell from the nearest crest, in wavelengths (0 = on the crest)
      let offset = cell.distance / HEATWAVE_LENGTH - phase;
      offset -= Math.floor(offset);
      if (offset > 0.5) offset -= 1;
      const strength = Math.max(0, 1 - Math.abs(offset) / HEATWAVE_WIDTH);

      if (strength < 0.34) {
        push(base, HEAT_PALETTE[cell.band], `M${cell.x} ${cell.y}h${CELL}v${CELL}h-${CELL}z`);
        continue;
      }

      // Shoulders borrow the next-hotter band and grow 2pt; the crest itself
      // jumps two bands and swells 6pt so the wave reads at a glance
      const onCrest = strength > 0.67;
      const grow = onCrest ? 6 : 2;
      const size = CELL + grow;
      const color = HEAT_PALETTE[Math.min(HEAT_PALETTE.length - 1, cell.band + (onCrest ? 2 : 1))];
      push(lit, color, `M${cell.x - grow / 2} ${cell.y - grow / 2}h${size}v${size}h-${size}z`);
    }

    // Base cells first, swollen crest cells on top so they overlap their neighbours
    return [
      ...Array.from(base.entries()).map(([color, parts]) => ({ color, d: parts.join('') })),
      ...Array.from(lit.entries()).map(([color, parts]) => ({ color, d: parts.join('') })),
    ];
  });
}

function push(map: Map<string, Array<string>>, key: string, value: string) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/** Cold → hot bands of the core, same thresholds as pickColor */
const HEAT_PALETTE = [THERMAL_COLORS.magenta, THERMAL_COLORS.red, THERMAL_COLORS.orange, THERMAL_COLORS.gold, THERMAL_COLORS.cream];

function pickBand(heat: number): number {
  if (heat > 0.86) return 4;
  if (heat > 0.7) return 3;
  if (heat > 0.54) return 2;
  if (heat > 0.38) return 1;
  if (heat > 0.26) return 0;
  return -1;
}

interface FrameOptions {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  intensity: number;
  seed: number;
  /** Noise amplitude; lower reads calmer */
  noise?: number;
  /** 0…1 phase of an outward heat wave; omit for no wave */
  wavePhase?: number;
}

/** One path per color keeps the SVG to a handful of nodes */
function buildFrame({ width, height, centerX, centerY, radiusX, radiusY, intensity, seed, noise = 0.32, wavePhase }: FrameOptions) {
  const random = mulberry32(seed);
  const paths = new Map<string, Array<string>>();
  const reach = 0.75 + intensity * 0.5;

  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const dx = (x + CELL / 2 - centerX) / (radiusX * reach);
      const dy = (y + CELL / 2 - centerY) / (radiusY * reach);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1.15) continue;

      const wave = wavePhase === undefined ? 0 : Math.sin((distance * 2.4 - wavePhase) * Math.PI * 2) * 0.1;
      const heat = 1 - distance + (random() - 0.5) * noise + intensity * 0.08 + wave;
      const color = pickColor(heat);
      if (!color) continue;

      const cells = paths.get(color) ?? [];
      cells.push(`M${x} ${y}h${CELL}v${CELL}h-${CELL}z`);
      paths.set(color, cells);
    }
  }

  return Array.from(paths.entries()).map(([color, cells]) => ({ color, d: cells.join('') }));
}

function pickColor(heat: number): string | null {
  if (heat > 0.86) return THERMAL_COLORS.cream;
  if (heat > 0.7) return THERMAL_COLORS.gold;
  if (heat > 0.54) return THERMAL_COLORS.orange;
  if (heat > 0.38) return THERMAL_COLORS.red;
  if (heat > 0.26) return THERMAL_COLORS.magenta;
  return null;
}

/** Tiny deterministic PRNG so the core looks the same on every render */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL = 10;
const RIPPLE_FRAMES = 8;
const RIPPLE_DURATION = 3600;
const EMBER_COUNT = 9;
const WAVE_DURATION = 5200;
const WAVE_BAND = 40;
const WAVE_PEAK_OPACITY = 0.45;

const GRID_WAVE_DURATION = 4600;
const GRID_WAVE_BAND = 50;
const GRID_DOT_MAX = 8;
const GRID_DOT_OPACITY = 0.5;

const HEARTBEAT_DURATION = 4400;
const HEARTBEAT_GAP = 0.09;
const HEARTBEAT_BAND = 36;
const HEARTBEAT_DOT_MAX = 9;
const HEARTBEAT_OPACITY = 0.85;
const FIELD_COLOR_STOPS: Array<{ radius: number; color: string }> = [
  { radius: 90, color: THERMAL_COLORS.amber },
  { radius: 130, color: THERMAL_COLORS.orange },
  { radius: 170, color: THERMAL_COLORS.ember },
  { radius: 210, color: THERMAL_COLORS.red },
  { radius: 250, color: THERMAL_COLORS.crimson },
  { radius: 300, color: THERMAL_COLORS.magenta },
  { radius: 360, color: THERMAL_COLORS.plum },
];

const HEATWAVE_FRAMES = 18;
const HEATWAVE_DURATION = 2800;
/** Crest spacing, in units of core distance (one crest at a time) */
const HEATWAVE_LENGTH = 1.1;
/** Half-width of a crest, in wavelengths */
const HEATWAVE_WIDTH = 0.16;

const FLIP_DURATION = 4530;
/** How far (pt) behind the crest a card is still turning */
const FLIP_SPAN = 110;
const FLIP_REST = 60;
/** How far (pt) toward / away from the hotspot the back / front faces sample the glow */
const FLIP_SAMPLE_STEP = 25;
const FLIP_FRONT_OPACITY = 0.55;
const FLIP_BACK_OPACITY = 0.85;
/** How much a card shrinks at mid-turn (0 = no shrink) */
const FLIP_SHRINK = 0.1;
/** Card is one grid cell minus a 1pt seam so the grid lines stay visible */
const CARD_GAP = 1;
const CARD = CELL - CARD_GAP;

const SHOCK_DURATION = 4200;
const SHOCK_BAND = 45;
const SHOCK_DISTANCE = 9;
const SHOCK_SPACING = 20;
const SHOCK_DOT = 5;
const SHOCK_OPACITY = 0.6;

const AnimatedPath = Animated.createAnimatedComponent(Path);
