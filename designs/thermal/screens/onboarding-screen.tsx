import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { RANK_IMAGES } from '@/lib/rank-images';
import { REPUTATION_POINTS } from '@/lib/reputation';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { telemetry } from '@/lib/telemetry';
import type { Rank } from '@/types/user';

import { DashedDivider, Touchable } from '../components/atoms';
import { HardShadow } from '../components/panel';
import { PixelButton } from '../components/pixel-button';
import { PixelCore } from '../components/pixel-core';
import { getHeatHotspot, sampleHeatColor, ThermalBackground } from '../components/thermal-background';
import { NavIconButton } from '../components/thermal-nav-bar';
import { HEAT_LEVELS } from '../lib/heat-levels';
import { stepIn, stepOut } from '../motion';
import { INK, SIZE, SPACE, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * First-run briefing in four steps over the Power heat camera's backdrop:
 * the same "power" thermal background with the 09 FLIP pixel wave rolling
 * out of its hot spot. The last step links a wallet or lets the user
 * explore as a guest. Figma: "Onboarding · 1–4 · V2".
 */
export function OnboardingScreen({ onComplete, onSkip }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connect } = useWallet();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  // Same backdrop + flip wave as the Power header, full screen
  const hotspot = getHeatHotspot(BACKDROP, width);
  const sampleColor = useCallback((x: number, y: number) => sampleHeatColor(BACKDROP, width, x, y), [width]);

  useEffect(() => {
    telemetry.track('onboarding_started');
  }, []);

  useEffect(() => {
    telemetry.track('onboarding_step_viewed', { step: index + 1, stepTitle: STEPS[index].title });
  }, [index]);

  function handleNext() {
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

  /** The wallet step replaces the separate post-onboarding wallet prompt */
  function finish(linkWallet: boolean) {
    StorageService.setBoolean(STORAGE_KEYS.ONBOARDING_DISMISSED, true);
    onComplete();
    if (linkWallet) void connect();
  }

  return (
    <View style={styles.root}>
      <ThermalBackground preset={BACKDROP} />
      <PixelCore
        width={width}
        height={height}
        centerX={hotspot.x}
        centerY={hotspot.y}
        sampleColor={sampleColor}
        variant="flip"
      />
      <Fades width={width} height={height} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.top}>
          {index > 0 ? <NavIconButton icon="back" onPress={handleBack} /> : null}
          <View style={styles.progress}>
            {STEPS.map((item, stepIndex) => (
              <View
                key={item.title}
                style={[styles.progressCell, { backgroundColor: stepIndex <= index ? THERMAL_COLORS.gold : PROGRESS_TODO }]}
              />
            ))}
          </View>
          {isLast ? null : (
            <Touchable onPress={handleSkip} hitSlop={10} pressedOpacity={0.7} style={styles.skip}>
              <Text style={TYPE.label12}>{'SKIP >'}</Text>
            </Touchable>
          )}
        </View>

        <View style={{ flex: 1 }} />

        <Animated.View key={step.title} entering={stepIn()} exiting={stepOut()} style={styles.step}>
          <Mascot rank={step.mascot} />

          {step.kind === 'wallet' ? (
            <WalletStep />
          ) : (
            <>
              <View style={styles.badge}>
                <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{step.badge}</Text>
              </View>
              {step.kind === 'levels' ? <LevelLadder /> : <ChipRow chips={step.chips} />}
              <View style={styles.copy}>
                <Text style={[TYPE.display40, styles.title]}>{step.title}</Text>
                <Text style={[TYPE.meta18, styles.body]}>{step.body}</Text>
              </View>
            </>
          )}
        </Animated.View>

        <View style={{ gap: 12 }}>
          {isLast ? (
            <>
              <PixelButton label="CONNECT WALLET >" variant="gold" onPress={() => finish(true)} />
              <PixelButton label="EXPLORE AS GUEST" variant="outline" onPress={() => finish(false)} />
            </>
          ) : (
            <PixelButton label="NEXT >" variant="gold" onPress={handleNext} />
          )}
        </View>
      </View>
    </View>
  );
}

function Mascot({ rank }: { rank: Rank }) {
  return (
    <Image source={RANK_IMAGES[rank] as number} style={{ width: MASCOT_SIZE, height: MASCOT_SIZE }} contentFit="contain" />
  );
}

function ChipRow({ chips }: { chips: Array<{ label: string; color: string }> }) {
  return (
    <View style={[styles.row, { gap: 8 }]}>
      {chips.map((chip) => (
        <View key={chip.label} style={styles.chip}>
          <View style={{ width: 8, height: 8, backgroundColor: chip.color }} />
          <Text style={TYPE.label12}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Six heat levels as rising bars; the user's own level is lit */
function LevelLadder() {
  const { profile } = useUser();
  const current = profile?.rank ?? 'OBSERVER';

  return (
    <View style={styles.ladder}>
      {LADDER.map((item) => (
        <View key={item.rank} style={styles.ladderStep}>
          <View style={{ alignSelf: 'stretch', height: item.height, backgroundColor: item.color }} />
          <Text style={[TYPE.label12, { color: item.rank === current ? THERMAL_COLORS.white : INK.muted }]}>
            {HEAT_LEVELS[item.rank].name.slice(0, item.letters)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Last step: what the three tabs do and the wallet bonus */
function WalletStep() {
  return (
    <>
      <View style={[styles.copy, { gap: 12 }]}>
        <Text style={[TYPE.display40, styles.title]}>PEPPER DAO</Text>
        <Text style={[TYPE.meta18, styles.body]}>The community runs it. You can too.</Text>
      </View>
      <View style={{ alignSelf: 'stretch' }}>
        <HardShadow />
        <View style={styles.modes}>
          {MODES.map((mode, index) => (
            <View key={mode.title}>
              {index > 0 ? <DashedDivider /> : null}
              <View style={[styles.row, styles.modeRow]}>
                <Image source={mode.icon} style={{ width: 28, height: 28 }} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={TYPE.label12}>{mode.title}</Text>
                  <Text style={[TYPE.meta18, { color: INK.muted }]}>{mode.hint}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>
        {`+${REPUTATION_POINTS.WALLET_CONNECTED} REP WHEN YOU LINK A WALLET`}
      </Text>
    </>
  );
}

/** Darkens the top behind the HUD and cools the burst into the void under the copy */
function Fades({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="onboarding-bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.5" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="0.65" stopColor={THERMAL_COLORS.void} stopOpacity={0.96} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="onboarding-top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0.7} />
            <Stop offset="0.6" stopColor={THERMAL_COLORS.void} stopOpacity={0.35} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#onboarding-bottom)" />
        <Rect x="0" y="0" width={width} height={TOP_FADE} fill="url(#onboarding-top)" />
      </Svg>
    </View>
  );
}

type StepKind = 'chips' | 'levels' | 'wallet';

interface Step {
  kind: StepKind;
  mascot: Rank;
  badge: string;
  chips: Array<{ label: string; color: string }>;
  title: string;
  body: string;
}

const STEPS: Array<Step> = [
  {
    kind: 'chips',
    mascot: 'OBSERVER',
    badge: 'LIVE · DAO TREASURY',
    chips: [
      { label: 'TREASURY', color: THERMAL_COLORS.gold },
      { label: 'TOKEN', color: THERMAL_COLORS.cream },
      { label: 'VOTES', color: THERMAL_COLORS.red },
    ],
    title: 'FEEL THE PULSE',
    body: 'PEPPER holders run the DAO together. Watch the treasury, the token and every vote live.',
  },
  {
    kind: 'chips',
    mascot: 'MEMBER',
    badge: 'YOUR VOTE COUNTS',
    chips: [
      { label: 'YES', color: VOTE_COLORS.YES },
      { label: 'NO', color: VOTE_COLORS.NO },
      { label: 'ABSTAIN', color: VOTE_COLORS.ABSTAIN },
    ],
    title: 'DECIDE TOGETHER',
    body: 'Vote with staked PEPPER. Every vote is recorded on Chiliz Chain and counts.',
  },
  {
    kind: 'levels',
    mascot: 'PARTICIPANT',
    badge: '6 HEAT LEVELS',
    chips: [],
    title: 'HEAT UP',
    body: 'Stake, vote and propose to earn REP. Climb 6 heat levels, from Bell to Reaper.',
  },
  {
    kind: 'wallet',
    mascot: 'STEWARD',
    badge: '',
    chips: [],
    title: 'PEPPER DAO',
    body: '',
  },
];

/** Six levels: colour from the heat ramp, bars rise with the heat */
const LADDER: Array<{ rank: Rank; color: string; height: number; letters: number }> = [
  { rank: 'OBSERVER', color: THERMAL_COLORS.navy, height: 6, letters: 4 },
  { rank: 'MEMBER', color: THERMAL_COLORS.violet, height: 6, letters: 4 },
  { rank: 'PARTICIPANT', color: THERMAL_COLORS.red, height: 9, letters: 4 },
  { rank: 'STEWARD', color: THERMAL_COLORS.orange, height: 11, letters: 4 },
  { rank: 'INITIATOR', color: THERMAL_COLORS.gold, height: 14, letters: 5 },
  { rank: 'GOVERNOR', color: THERMAL_COLORS.cream, height: 16, letters: 6 },
];

const MODES = [
  { title: 'PULSE', hint: 'Treasury & token, live', icon: require('@/assets/images/pepper/total-supply.png') },
  { title: 'DECIDE', hint: 'Vote on proposals', icon: require('@/assets/images/pepper/vault.png') },
  { title: 'POWER', hint: 'Stake, earn REP, level up', icon: require('@/assets/images/pepper/burn.png') },
];

/** The Power screen's thermal preset — its hot spot is where the flip wave starts */
const BACKDROP = 'power';
const MASCOT_SIZE = 190;
const TOP_FADE = 120;
/** Upcoming progress cells (Figma: 20% white) */
const PROGRESS_TODO = 'rgba(255,255,255,0.2)';

/** Onboarding body copy sits at 70% (Figma) */
const INK_BODY = 'rgba(255,255,255,0.7)';

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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 36,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  progressCell: {
    flex: 1,
    height: 6,
  },
  skip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  step: {
    alignItems: 'center',
    gap: 16,
  },
  badge: {
    backgroundColor: THERMAL_COLORS.void,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  ladder: {
    width: 330,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  ladderStep: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  copy: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    textAlign: 'center',
    textShadowColor: '#000000',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  body: {
    textAlign: 'center',
    color: INK_BODY,
  },
  modes: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  modeRow: {
    gap: 12,
    paddingHorizontal: SPACE.rowX,
    paddingVertical: 12,
  },
});
