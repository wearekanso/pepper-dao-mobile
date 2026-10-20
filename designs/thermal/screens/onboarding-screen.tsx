import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
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
import { ShapeBackdrop } from '../components/shape-backdrop';
import { NavIconButton } from '../components/thermal-nav-bar';
import { HEAT_LEVELS } from '../lib/heat-levels';
import type { BackdropName } from '../lib/onboarding-backdrops';
import { fadeIn, fadeOut } from '../motion';
import { INK, SIZE, SPACE, THERMAL_COLORS, TYPE, VOTE_COLORS } from '../theme';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * First-run briefing in four steps, each over its own Figma heat shape
 * (heartbeat · check · bolt · wave) animated like the Power heat camera.
 * The last step links a wallet or lets the user explore as a guest.
 * Figma: "Onboarding · 1–4 · V2".
 */
export function OnboardingScreen({ onComplete, onSkip }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { connect, isConnected } = useWallet();
  const [isLinking, setIsLinking] = useState(false);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

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

  /** SKIP jumps to the last step (wallet / guest choice) instead of leaving onboarding */
  function handleSkip() {
    void Haptics.selectionAsync();
    telemetry.track('onboarding_skipped', { skippedAtStep: index + 1 });
    setIndex(STEPS.length - 1);
  }

  /** The wallet step replaces the separate post-onboarding wallet prompt */
  function finish() {
    StorageService.setBoolean(STORAGE_KEYS.ONBOARDING_DISMISSED, true);
    onComplete();
  }

  // CONNECT WALLET keeps the user here with the wallet picker on top; the app
  // opens only once a wallet is actually connected (cancelling stays on step 4)
  function handleConnect() {
    setIsLinking(true);
    void connect();
  }

  useEffect(() => {
    if (isLinking && isConnected) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLinking, isConnected]);

  return (
    <View style={styles.root}>
      <ShapeBackdrop shape={step.backdrop} width={width} height={height} />
      <Fades width={width} height={height} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        {/* Fixed top bar: the progress bar sits centred and never moves between steps */}
        <View style={styles.top}>
          <View style={styles.topSide}>{index > 0 ? <NavIconButton icon="back" onPress={handleBack} /> : null}</View>
          <View pointerEvents="none" style={styles.progress}>
            {STEPS.map((item, stepIndex) => (
              <View
                key={item.title}
                style={[styles.progressCell, { backgroundColor: stepIndex <= index ? THERMAL_COLORS.gold : PROGRESS_TODO }]}
              />
            ))}
          </View>
          <View style={[styles.topSide, { alignItems: 'flex-end' }]}>
            {isLast ? null : (
              <Touchable onPress={handleSkip} hitSlop={12} pressedOpacity={0.7}>
                <Text style={TYPE.label12}>{'SKIP >'}</Text>
              </Touchable>
            )}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Content swaps in place (cross-fade), it doesn't slide to a new page */}
        <Animated.View key={step.title} entering={fadeIn()} exiting={fadeOut()} style={styles.step}>
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
              <PixelButton label="CONNECT WALLET >" variant="gold" onPress={handleConnect} />
              <PixelButton label="EXPLORE AS GUEST" variant="outline" onPress={finish} />
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
  /** Figma heat shape behind this step */
  backdrop: BackdropName;
  mascot: Rank;
  badge: string;
  chips: Array<{ label: string; color: string }>;
  title: string;
  body: string;
}

const STEPS: Array<Step> = [
  {
    kind: 'chips',
    backdrop: 'heartbeat',
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
    backdrop: 'check',
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
    backdrop: 'bolt',
    mascot: 'PARTICIPANT',
    badge: '6 HEAT LEVELS',
    chips: [],
    title: 'HEAT UP',
    body: 'Stake, vote and propose to earn REP. Climb 6 heat levels, from Bell to Reaper.',
  },
  {
    kind: 'wallet',
    backdrop: 'wave',
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

const MASCOT_SIZE = 190;
const TOP_FADE = 120;
/** Upcoming progress cells (Figma: 20% white) */
const PROGRESS_TODO = 'rgba(255,255,255,0.2)';
/** Four 57pt cells + 4pt gaps = the 240pt centred bar in Figma */
const PROGRESS_CELL = 57;

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
    height: SIZE.navButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topSide: {
    width: SIZE.navButton + 16,
    justifyContent: 'center',
  },
  progress: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  progressCell: {
    width: PROGRESS_CELL,
    height: 6,
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
