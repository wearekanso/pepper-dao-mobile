import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { telemetry } from '@/lib/telemetry';

import { Touchable } from '../components/atoms';
import { HeatBurst, type HeatShape, Sparks } from '../components/heat-burst';
import { Panel } from '../components/panel';
import { PixelBar } from '../components/pixel-bar';
import { PixelButton } from '../components/pixel-button';
import { SensorGrid } from '../components/thermal-background';
import { stepIn, stepOut } from '../motion';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * First-run recruit briefing: three steps over a heat burst that cools down
 * into the void. Figma: "Onboarding C — sol hizalı · heat burst".
 */
export function OnboardingScreen({ onComplete, onSkip }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    telemetry.track('onboarding_started');
  }, []);

  useEffect(() => {
    telemetry.track('onboarding_step_viewed', { step: index + 1, stepTitle: STEPS[index].title.replace('\n', ' ') });
  }, [index]);

  function handleNext() {
    if (isLast) {
      onComplete();
      return;
    }
    setIndex((previous) => Math.min(previous + 1, STEPS.length - 1));
  }

  function handleBack() {
    setIndex((previous) => Math.max(previous - 1, 0));
  }

  function handleSkip() {
    void Haptics.selectionAsync();
    telemetry.track('onboarding_skipped', { skippedAtStep: index + 1 });
    onSkip();
  }

  return (
    <View style={styles.root}>
      <HeatBurst width={width} height={height} centerY={step.shape === 'pulse' ? 0.08 : SHAPE_CENTER_Y} shape={step.shape} morph flow />
      <Sparks width={width} height={height} />
      <BottomFade width={width} height={height} />
      <SensorGrid width={width} height={height} />

      <View style={[styles.content, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.hud}>
          <View style={styles.tag}>
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.gold }]}>{`NEW RECRUIT · STEP ${step.number}`}</Text>
          </View>
          <Touchable onPress={handleSkip} hitSlop={10} pressedOpacity={0.7} style={styles.skip}>
            <Text style={TYPE.label12}>SKIP {'>'}</Text>
          </Touchable>
        </View>

        <View style={{ flex: 1 }} />

        <Animated.View
          key={step.number}
          entering={stepIn()}
          exiting={stepOut()}
          style={styles.step}
        >
          <Text style={[TYPE.display72, styles.inkShadow, { color: THERMAL_COLORS.gold }]}>{step.number}</Text>
          <Text style={[TYPE.display58, styles.inkShadow]}>{step.title}</Text>
          <Panel>
            <Text style={[TYPE.label10, { color: THERMAL_COLORS.orange }]}>{step.eyebrow}</Text>
            <Text style={TYPE.body14}>{step.body}</Text>
          </Panel>
        </Animated.View>

        <PixelBar colors={progressColors(index)} height={6} gap={3} delay={0} />

        <View style={styles.actions}>
          {index > 0 ? <PixelButton label="< BACK" variant="outline" style={{ alignSelf: 'auto' }} onPress={handleBack} /> : null}
          <PixelButton label={isLast ? 'GET STARTED >' : 'NEXT >'} variant="gold" style={{ flex: 1 }} onPress={handleNext} />
        </View>
      </View>
    </View>
  );
}

/** Cools the burst into the void so the copy sits on a dark ground */
function BottomFade({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="onboarding-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.3" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="0.58" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#onboarding-fade)" />
      </Svg>
    </View>
  );
}

function progressColors(index: number): Array<string> {
  const lit = (index + 1) * CELLS_PER_STEP;
  return Array.from({ length: STEPS.length * CELLS_PER_STEP }, (_, cell) =>
    cell < lit ? THERMAL_COLORS.gold : THERMAL_COLORS.ghost,
  );
}

interface Step {
  number: string;
  /** Heat character for this step: pulse → vote ✓ → power ⚡ */
  shape: HeatShape;
  title: string;
  eyebrow: string;
  body: string;
}

const STEPS: Array<Step> = [
  {
    number: '01',
    shape: 'pulse',
    title: 'FEEL THE\nPULSE',
    eyebrow: 'TREASURY · SUPPLY · LIVE VOTES',
    body: "Track PEPPER metrics, treasury health, and community stats. Stay updated on the DAO's heartbeat!",
  },
  {
    number: '02',
    shape: 'check',
    title: 'DECIDE\nTOGETHER',
    eyebrow: 'PROPOSALS · STAGES · VOTES',
    body: "Vote on governance proposals and shape the DAO's future. Your voice matters in every decision.",
  },
  {
    number: '03',
    shape: 'bolt',
    title: 'CLAIM YOUR\nPOWER',
    eyebrow: 'STAKE · REP · 6 HEAT RANKS',
    body: 'Stake tokens, earn reputation, and climb 6 ranks. Build streaks to unlock rewards and influence!',
  },
];

const CELLS_PER_STEP = 4;
/** Vertical centre of a shaped heat character (Figma: 205 / 874) */
const SHAPE_CENTER_Y = 0.235;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THERMAL_COLORS.void,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACE.margin,
    gap: SPACE.section,
  },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    backgroundColor: THERMAL_COLORS.void,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  skip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: THERMAL_COLORS.chip,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  step: {
    gap: SPACE.section,
  },
  inkShadow: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
});
