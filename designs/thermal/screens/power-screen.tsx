import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { useActivities } from '@/hooks/use-activities';
import { RANK_IMAGES } from '@/lib/rank-images';
import { getEventTitle, getNextStreakMilestone, RANK_REQUIREMENTS, REPUTATION_POINTS } from '@/lib/reputation';
import type { Activity, Profile } from '@/types/user';

import { BlinkDot, DashedDivider } from '../components/atoms';
import { CornerBrackets } from '../components/corner-brackets';
import { HowToEarnSheet } from '../components/how-to-earn-sheet';
import { Panel } from '../components/panel';
import { HeatPepper, PixelArt } from '../components/pixel-art';
import { getHeatBarColors, PixelBar } from '../components/pixel-bar';
import { PixelButton } from '../components/pixel-button';
import { PixelCore, type PixelCoreVariant } from '../components/pixel-core';
import { useRankUp } from '../components/rank-up-overlay';
import { StakeSheet } from '../components/stake-sheet';
import { BACKDROP_PARALLAX, getHeatHotspot, sampleHeatColor } from '../components/thermal-background';
import { TabHeader } from '../components/tab-header';
import { ThermalScreen } from '../components/thermal-screen';
import { WalletChip } from '../components/wallet-chip';
import { useCountUp } from '../hooks/use-count-up';
import { createDemoActivities, createDemoProfile, isDemoPower } from '../lib/demo-power';
import { useFocusKey } from '../hooks/use-focus-key';
import { formatDayMonth, formatInteger } from '../lib/format';
import { formatShu, getHeatLevel, getHeatProgress, getRankLabel, HEAT_LEVELS, MAX_HEAT_LEVEL } from '../lib/heat-levels';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';

/**
 * POWER — your heat signature: the camera locks onto your rank art, the
 * thermal scale shows where you sit, and the heat log lists what earned it.
 */
export function PowerScreen() {
  const user = useUser();
  const [isStakeOpen, setIsStakeOpen] = useState(false);
  const [isHowToOpen, setIsHowToOpen] = useState(false);
  const wallet = useWallet();
  const { connect } = wallet;
  // Dev-only: pepperdao://power?demo=1 shows the connected screen with a fake profile
  const isDemo = isDemoPower(useLocalSearchParams<{ demo?: string }>().demo);
  const demoProfile = useMemo(() => (isDemo ? createDemoProfile() : null), [isDemo]);
  const profile = demoProfile ?? user.profile;
  const isLoading = isDemo ? false : user.isLoading;
  const isConnected = isDemo || wallet.isConnected;
  const scrollY = useSharedValue(0);

  return (
    <ThermalScreen preset="power" scrollY={scrollY}>
      <TabHeader title="POWER" subtitle="YOUR HEAT, STREAK & LEVEL" />

      {isLoading && !profile ? (
        <View style={styles.center}>
          <ActivityIndicator color={THERMAL_COLORS.gold} />
          <Text style={[TYPE.label12, { color: INK.muted }]}>CALIBRATING SENSOR…</Text>
        </View>
      ) : null}

      {!isLoading && !profile ? (
        <Panel>
          <Text style={TYPE.display24}>No heat signature</Text>
          <Text style={TYPE.body13}>Connect your wallet to start building heat.</Text>
          <WalletChip />
        </Panel>
      ) : null}

      {profile ? (
        <>
          <HeatCamera profile={profile} variant={CORE_VARIANT} isGuest={!isConnected} scrollY={scrollY} />
          {isConnected ? (
            <>
              <StreakPanel profile={profile} />
              <NextLevelPanel profile={profile} />
              <Animated.View style={[styles.row, { gap: 12 }]}>
                <PixelButton label="STAKE PEPPER" variant="gold" style={{ flex: 1 }} onPress={() => setIsStakeOpen(true)} />
                <PixelButton label="HOW TO EARN" variant="outline" style={{ flex: 1 }} onPress={() => setIsHowToOpen(true)} />
              </Animated.View>
              <HeatLog profile={profile} isDemo={isDemo} />
            </>
          ) : (
            <GuestPanel onConnect={() => void connect()} />
          )}
        </>
      ) : null}

      <StakeSheet visible={isStakeOpen} onClose={() => setIsStakeOpen(false)} />
      {profile ? <HowToEarnSheet visible={isHowToOpen} profile={profile} onClose={() => setIsHowToOpen(false)} /> : null}
    </ThermalScreen>
  );
}

interface HeatCameraProps {
  profile: Profile;
  variant: PixelCoreVariant;
  isGuest: boolean;
  scrollY: SharedValue<number>;
}

function HeatCamera({ profile, variant, isGuest, scrollY }: HeatCameraProps) {
  const { width } = useWindowDimensions();
  const focusKey = useFocusKey();
  const { preview } = useRankUp();
  const heat = getHeatProgress(profile);
  const animatedShu = useCountUp(heat.shu, 1500);
  const stageWidth = width - 32;
  const centerX = stageWidth / 2;
  const stageRef = useRef<View>(null);
  const [stageY, setStageY] = useState(0);
  // The flip wave starts at the backdrop's white spot, which lives in screen space
  const hotspot = getHeatHotspot('power', width);
  const isFlip = variant === 'flip';
  // Stage x matches the screen; stage y is offset by where the stage sits
  const sampleColor = useCallback((x: number, y: number) => sampleHeatColor('power', width, x, y + stageY), [width, stageY]);
  // The mascot sits on the backdrop's white-hot core, which lives in screen space
  const artCenterY = hotspot.y - stageY;
  // The wave belongs to the backdrop: undo part of the scroll so it drifts with the glow's parallax
  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * (1 - BACKDROP_PARALLAX) }],
  }));

  return (
    <View
      ref={stageRef}
      style={{ height: STAGE_HEIGHT }}
      onLayout={() => stageRef.current?.measureInWindow((_x, y) => setStageY(y))}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { left: -16, right: -16 }, waveStyle]}>
        <PixelCore
          width={width}
          height={STAGE_HEIGHT}
          centerX={isFlip ? hotspot.x : width / 2}
          centerY={isFlip ? hotspot.y - stageY : ART_CENTER_Y}
          gridOffsetY={stageY}
          sampleColor={sampleColor}
          intensity={(heat.current.level - 1) / (MAX_HEAT_LEVEL - 1)}
          variant={variant}
        />
      </Animated.View>

      {/* Same hero pattern as Pulse: status row above, viewfinder below */}
      <Animated.View style={styles.stageHud}>
        <View style={[styles.row, { gap: 6 }]}>
          <BlinkDot />
          <Text style={TYPE.meta18}>REC · PEPPER-CAM 02</Text>
        </View>
      </Animated.View>

      <View style={styles.viewfinder} pointerEvents="none">
        <CornerBrackets size={16} focusKey={focusKey} />
      </View>

      {/* Mounted once the stage is measured, so the mascot fades in already on the core */}
      {stageY > 0 ? (
        <>
          <FloatingArt profile={profile} centerX={centerX} centerY={artCenterY} />
          <Crosshair centerX={centerX} centerY={artCenterY} />
        </>
      ) : null}
      <ThermalScale levelIndex={heat.current.level - 1} />
      <YouCallout shu={heat.shu} levelIndex={heat.current.level - 1} artCenterY={stageY > 0 ? artCenterY : ART_CENTER_Y} />

      <View style={styles.readout}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>YOUR HEAT · SCOVILLE READING</Text>
        <Pressable onLongPress={preview} delayLongPress={600}>
          <View style={[styles.row, { alignItems: 'flex-end', gap: 8 }]}>
            <Text style={[TYPE.display72, styles.dropShadow]}>{formatInteger(animatedShu)}</Text>
            <Text style={[TYPE.label14, styles.dropShadowSmall, { marginBottom: 8 }]}>SHU</Text>
          </View>
        </Pressable>
        <View style={[styles.row, { gap: 8 }]}>
          <HeatPepper level={heat.current} width={18} />
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>
            {isGuest
              ? `${heat.current.name} · GUEST`
              : `${heat.current.name} · ${getRankLabel(profile.rank)} · HEAT ${heat.current.level}/${MAX_HEAT_LEVEL}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function FloatingArt({ profile, centerX, centerY }: { profile: Profile; centerX: number; centerY: number }) {
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) });
  }, [enter]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  return (
    <Animated.View style={[styles.art, { left: centerX - ART_SIZE / 2, top: centerY - ART_SIZE / 2 }, animatedStyle]}>
      <Image source={RANK_IMAGES[profile.rank] as number} style={{ width: ART_SIZE, height: ART_SIZE, opacity: 0.95 }} contentFit="contain" />
    </Animated.View>
  );
}

function Crosshair({ centerX, centerY }: { centerX: number; centerY: number }) {
  const spin = useSharedValue(0);

  // Slow opacity pulse only — no rotation or scaling
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [spin]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.5 + spin.value * 0.4 }));

  return (
    <Animated.View pointerEvents="none" style={[styles.crosshair, { left: centerX - 14, top: centerY - 14 }, animatedStyle]}>
      <PixelArt name="crosshair" />
    </Animated.View>
  );
}

/**
 * "YOU" tag pinned to your row on the thermal scale (Figma: callout sits on
 * the current level's line and replaces its label). The pixel leader points
 * back toward the camera art: it steps down to the tag when the tag is below
 * the art (as in Figma) and up to it when the tag is above.
 */
function YouCallout({ shu, levelIndex, artCenterY }: { shu: number; levelIndex: number; artCenterY: number }) {
  const level = LEVEL_LIST[levelIndex];
  const top = levelLabelTop(levelIndex) - CALLOUT_OFFSET;
  const isBelowArt = top + CALLOUT_HEIGHT / 2 > artCenterY;

  return (
    <View pointerEvents="none" style={[styles.callout, { top, right: CALLOUT_RIGHT }]}>
      <View style={isBelowArt ? styles.leaderDown : styles.leaderUp}>
        <PixelArt name="leader" />
      </View>
      <View style={styles.calloutBox}>
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.void }]}>{`YOU · ${level.name} ${formatShu(level.shu)}`}</Text>
        <Text style={[TYPE.meta18, { color: THERMAL_COLORS.void }]}>{`${formatInteger(shu)} SHU`}</Text>
      </View>
    </View>
  );
}

/** Stage y of a level's scale label (Figma: BELL 412 … REAPER 52) */
function levelLabelTop(levelIndex: number): number {
  return SCALE_BOTTOM_LABEL_TOP - levelIndex * LEVEL_STEP;
}

/** Right-hand thermal scale: cells fill bottom-up, then the marker slides to your level */
function ThermalScale({ levelIndex }: { levelIndex: number }) {
  const marker = useSharedValue(0);

  useEffect(() => {
    marker.value = withDelay(400, withTiming(levelIndex, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [levelIndex, marker]);

  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -marker.value * LEVEL_STEP }] }));

  return (
    <View pointerEvents="none" style={styles.scale}>
      <View style={styles.scaleLabels}>
        {LEVEL_LIST.map((level, index) =>
          index === levelIndex ? null : (
            <Text
              key={level.rank}
              style={[TYPE.meta18, styles.scaleLabel, { bottom: index * LEVEL_STEP - 4, color: SCALE_LABEL_INK }]}
            >
              {`${level.name} ${formatShu(level.shu)}`}
            </Text>
          ),
        )}
      </View>
      <View style={{ gap: 2 }}>
        {SCALE_COLORS.map((color, index) => (
          <ScaleCell key={index} color={color} delay={(SCALE_COLORS.length - index) * 8} />
        ))}
      </View>
      <Animated.Text style={[TYPE.label12, styles.scaleMarker, { color: THERMAL_COLORS.cream }, markerStyle]}>{'<'}</Animated.Text>
    </View>
  );
}

function ScaleCell({ color, delay }: { color: string; delay: number }) {
  const lit = useSharedValue(0);

  useEffect(() => {
    lit.value = withDelay(delay, withTiming(1, { duration: 120 }));
  }, [delay, lit]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.1 + lit.value * 0.9 }));

  return <Animated.View style={[{ width: 12, height: 7, backgroundColor: color }, animatedStyle]} />;
}

/** No wallet yet: what linking unlocks, and the first two REP sources */
function GuestPanel({ onConnect }: { onConnect: () => void }) {
  return (
    <Panel index={1}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>NO HEAT SIGNATURE YET</Text>
      <Text style={TYPE.body14}>Link a wallet to start building heat. Every vote, stake and proposal earns REP.</Text>
      <View style={styles.guestList}>
        {GUEST_STEPS.map((step, index) => (
          <View key={step.title}>
            {index > 0 ? <DashedDivider /> : null}
            <View style={[styles.row, styles.guestRow]}>
              <View style={styles.guestChip}>
                <Text style={TYPE.display24}>{`+${step.points}`}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={TYPE.label12}>{step.title}</Text>
                <Text style={[TYPE.meta18, { color: INK.muted }]}>{step.hint}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
      <PixelButton label="CONNECT WALLET >" variant="gold" onPress={onConnect} />
    </Panel>
  );
}

function StreakPanel({ profile }: { profile: Profile }) {
  const weeks = profile.current_streak_weeks;
  const next = getNextStreakMilestone(weeks);
  const daysLeft = getStreakDaysLeft(profile.last_activity_at);

  return (
    <Panel index={1}>
      <View style={styles.between}>
        <View style={[styles.row, { gap: 10 }]}>
          <FlickerFlame />
          <View>
            <Text style={[TYPE.label12, { color: INK.muted }]}>VOTING STREAK</Text>
            <Text style={TYPE.display32}>{weeks === 1 ? '1 WEEK' : `${weeks} WEEKS`}</Text>
          </View>
        </View>
        <WeeklyHeat weeks={weeks} />
      </View>

      <DashedDivider />

      {next ? (
        <View style={styles.between}>
          <Text style={TYPE.meta18}>{`NEXT BONUS · ${next.weeks} WEEKS`}</Text>
          <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>{`+${next.points} REP`}</Text>
        </View>
      ) : null}
      <Text style={[TYPE.meta18, { color: INK.muted }]}>
        {weeks === 0 || daysLeft === null
          ? 'Vote on any proposal to start your streak.'
          : `Vote on any proposal within ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to keep your streak.`}
      </Text>
    </Panel>
  );
}

function NextLevelPanel({ profile }: { profile: Profile }) {
  const heat = getHeatProgress(profile);
  const repProgress = heat.targetPoints === null ? 1 : heat.targetPoints > 0 ? profile.reputation_points / heat.targetPoints : 0;
  const requirements = heat.next ? getRequirements(profile, heat.next.rank) : [];

  return (
    <Panel index={2}>
      <View style={styles.between}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>NEXT LEVEL</Text>
          <Text style={TYPE.meta18} numberOfLines={1}>
            {heat.next ? `${heat.next.name} · ${getRankLabel(heat.next.rank)}` : 'MAX HEAT REACHED'}
          </Text>
        </View>
        <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>
          {heat.targetPoints ? `${profile.reputation_points} / ${heat.targetPoints} REP` : `${profile.reputation_points} REP`}
        </Text>
      </View>
      <PixelBar colors={getHeatBarColors(repProgress)} height={8} delay={400} />
      {requirements.map((item) => (
        <View key={item.label} style={styles.between}>
          <View style={[styles.row, { gap: 8, flexShrink: 1 }]}>
            <View style={[styles.checkBox, { borderColor: item.isDone ? STATUS_COLORS.positive.stroke : THERMAL_COLORS.border }]}>
              {item.isDone ? <View style={styles.checkFill} /> : null}
            </View>
            <Text style={[TYPE.meta18, { color: item.isDone ? INK_DONE : THERMAL_COLORS.white, flexShrink: 1 }]}>
              {item.label}
            </Text>
          </View>
          <Text style={[TYPE.meta18, { color: item.isDone ? STATUS_COLORS.positive.text : INK.muted }]}>
            {item.isDone ? 'DONE' : item.remaining}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

interface Requirement {
  label: string;
  isDone: boolean;
  /** Right-hand text while not done, e.g. "10 TO GO" */
  remaining: string;
}

/** What the next rank asks for, in the order a player usually meets it */
function getRequirements(profile: Profile, rank: Profile['rank']): Array<Requirement> {
  const rule = RANK_REQUIREMENTS[rank];
  const items: Array<Requirement> = [];

  if (rule.requiresWallet) {
    items.push({ label: 'Link your wallet', isDone: Boolean(profile.wallet_address), remaining: 'TO DO' });
  }
  if (rule.requiresVote) {
    items.push({ label: 'Vote on 1 proposal', isDone: profile.has_voted, remaining: 'TO DO' });
  }
  if (rule.requiresStreak > 0) {
    const left = rule.requiresStreak - profile.current_streak_weeks;
    items.push({ label: `Keep a ${rule.requiresStreak}-week streak`, isDone: left <= 0, remaining: `${left}W TO GO` });
  }
  if (rule.requiresEngagedProposal) {
    items.push({ label: 'Create a proposal that heats up', isDone: profile.has_engaged_proposal, remaining: 'TO DO' });
  }
  if (rule.requiresPassedProposal) {
    items.push({ label: 'Get a proposal passed', isDone: profile.has_passed_proposal, remaining: 'TO DO' });
  }
  if (rule.points > 0) {
    const left = rule.points - profile.reputation_points;
    items.push({ label: `Earn ${rule.points} REP`, isDone: left <= 0, remaining: `${left} TO GO` });
  }
  return items;
}

/** Whole days left in the 7-day window that keeps the weekly streak alive */
function getStreakDaysLeft(lastActivityAt: string | null): number | null {
  if (!lastActivityAt) return null;
  const last = Date.parse(lastActivityAt);
  if (!Number.isFinite(last)) return null;
  const left = Math.ceil((last + STREAK_WINDOW_MS - Date.now()) / DAY_MS);
  return left > 0 ? left : null;
}

function FlickerFlame() {
  const flick = useSharedValue(0);

  useEffect(() => {
    flick.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [flick]);

  // Gentle glow instead of a jittery scale flicker
  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.8 + flick.value * 0.2 }));

  return (
    <Animated.View style={animatedStyle}>
      <PixelArt name="flameLarge" />
    </Animated.View>
  );
}

/** Six weekly columns that rise as the streak grows */
function WeeklyHeat({ weeks }: { weeks: number }) {
  return (
    <View style={[styles.row, { gap: 4, alignItems: 'flex-end' }]}>
      {WEEK_COLORS.map((color, column) => {
        const isFilled = column < weeks;
        const height = isFilled ? Math.min(6, 2 + column) : 6;
        return (
          <View key={column} style={{ gap: 2 }}>
            {Array.from({ length: 6 }, (_, row) => {
              const fromBottom = 5 - row;
              const visible = fromBottom < height;
              return (
                <Animated.View
                  key={row}
                 
                  style={{
                    width: 10,
                    height: 6,
                    backgroundColor: !visible ? 'transparent' : isFilled ? color : THERMAL_COLORS.ghost,
                  }}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function HeatLog({ profile, isDemo }: { profile: Profile; isDemo: boolean }) {
  const feed = useActivities({ profileId: isDemo ? undefined : profile.id, limit: 12 });
  const demoActivities = useMemo(() => (isDemo ? createDemoActivities() : null), [isDemo]);
  const activities = demoActivities ?? feed.records;
  const isLoading = isDemo ? false : feed.isLoading;

  return (
    <Panel index={4} padding={0} gap={0}>
      <View style={[styles.between, styles.logRow]}>
        <Text style={[TYPE.label12, { color: INK.muted }]}>HEAT LOG</Text>
        <Text style={[TYPE.meta18, { color: INK.muted }]}>{`${profile.reputation_points} REP TOTAL`}</Text>
      </View>
      {isLoading && activities.length === 0 ? (
        <View style={styles.logRow}>
          <ActivityIndicator color={THERMAL_COLORS.gold} />
        </View>
      ) : null}
      {!isLoading && activities.length === 0 ? (
        <>
          <DashedDivider />
          <View style={styles.logRow}>
            <Text style={[TYPE.meta18, { color: INK.muted }]}>No heat yet — vote on a proposal to spark it.</Text>
          </View>
        </>
      ) : null}
      {activities.map((activity, index) => (
        <Animated.View key={activity.id}>
          <DashedDivider />
          <View style={[styles.row, styles.logRow, { gap: 12 }]}>
            <Text style={[TYPE.display24, { width: 40, color: getLogColor(activity) }]}>{getLogPoints(activity)}</Text>
            <Text style={[TYPE.meta18, { flex: 1 }]} numberOfLines={1}>
              {getLogTitle(activity)}
            </Text>
            <Text style={[TYPE.meta18, { color: INK.faint }]}>{formatDayMonth(activity.created_at)}</Text>
          </View>
        </Animated.View>
      ))}
    </Panel>
  );
}

function getLogPoints(activity: Activity): string {
  if (activity.event_type === 'RANK_UP') return 'LVL';
  if (activity.points === 0) return '·';
  return activity.points > 0 ? `+${activity.points}` : `${activity.points}`;
}

function getLogColor(activity: Activity): string {
  if (activity.event_type === 'RANK_UP') return THERMAL_COLORS.gold;
  if (activity.event_type === 'STREAK_MILESTONE') return THERMAL_COLORS.orange;
  if (activity.points < 0) return STATUS_COLORS.negative.text;
  return THERMAL_COLORS.cream;
}

function getLogTitle(activity: Activity): string {
  switch (activity.event_type) {
    case 'RANK_UP':
      return activity.rank_after ? `LEVEL UP · ${getHeatLevel(activity.rank_after).name}` : 'LEVEL UP';
    case 'STREAK_MILESTONE': {
      const weeks = (activity.metadata as { weeks?: number })?.weeks ?? 0;
      return `STREAK BONUS · ${weeks} WEEKS`;
    }
    case 'VOTE':
    case 'FIRST_VOTE': {
      const label = activity.event_type === 'FIRST_VOTE' ? 'FIRST VOTE' : 'VOTED';
      // Only community proposals are voted on
      return activity.proposal_id !== null ? `${label} · COMMUNITY #${activity.proposal_id}` : label;
    }
    case 'WALLET_CONNECTED':
      return 'WALLET LINKED';
    default:
      return getEventTitle(activity).toUpperCase();
  }
}

/** Background animation for the heat camera: 09 FLIP (the approved one) */
const CORE_VARIANT: PixelCoreVariant = 'flip';

/** Done checklist items fade back (Figma: 50% white) */
const INK_DONE = 'rgba(255,255,255,0.5)';

const GUEST_STEPS = [
  { title: 'LINK WALLET', hint: `Unlocks MEMBER · ${HEAT_LEVELS.MEMBER.name}`, points: REPUTATION_POINTS.WALLET_CONNECTED },
  { title: 'FIRST VOTE', hint: 'Any live proposal', points: REPUTATION_POINTS.FIRST_VOTE },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS = 7 * DAY_MS;

const STAGE_HEIGHT = 508;
const ART_SIZE = 110;
const ART_CENTER_Y = 273;
const LEVEL_STEP = 72;
const VIEWFINDER_TOP = 44;
/** Figma: BELL label top in the stage; each level above is LEVEL_STEP higher */
const SCALE_BOTTOM_LABEL_TOP = 412;
/** Callout box top sits 10pt above its level label; box is ~42pt tall */
const CALLOUT_OFFSET = 10;
const CALLOUT_HEIGHT = 42;
/** Tag hugs the thermal scale: its right edge stops 8pt before the scale cells */
const CALLOUT_RIGHT = 24;
/** Rising leader (tag above the art) sits lower so it meets the box's lower edge */
const LEADER_UP_TOP = 18;
/** Scale level labels (Figma: 55% white) */
const SCALE_LABEL_INK = 'rgba(255,255,255,0.55)';

const LEVEL_LIST = Object.values(HEAT_LEVELS);

const SCALE_COLORS = [
  ...Array(5).fill(THERMAL_COLORS.cream),
  ...Array(5).fill(THERMAL_COLORS.gold),
  ...Array(5).fill(THERMAL_COLORS.orange),
  ...Array(5).fill(THERMAL_COLORS.red),
  ...Array(5).fill(THERMAL_COLORS.magenta),
  ...Array(5).fill(THERMAL_COLORS.violet),
  ...Array(5).fill(THERMAL_COLORS.indigo),
  ...Array(5).fill(THERMAL_COLORS.navy),
] as Array<string>;

const WEEK_COLORS = [
  THERMAL_COLORS.violet,
  THERMAL_COLORS.magenta,
  THERMAL_COLORS.orange,
  THERMAL_COLORS.red,
  THERMAL_COLORS.gold,
  THERMAL_COLORS.cream,
];


const styles = StyleSheet.create({
  guestList: {
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  guestRow: {
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guestChip: {
    width: 52,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.cream,
  },
  checkBox: {
    width: 14,
    height: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkFill: {
    width: 6,
    height: 6,
    backgroundColor: STATUS_COLORS.positive.stroke,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  center: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 120,
  },
  stageHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  art: {
    position: 'absolute',
  },
  crosshair: {
    position: 'absolute',
  },
  callout: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // The pixel leader art rises left→right; mirrored, it steps down into the tag
  leaderDown: {
    marginTop: -4,
    transform: [{ scaleY: -1 }],
  },
  leaderUp: {
    marginTop: LEADER_UP_TOP,
  },
  calloutBox: {
    backgroundColor: THERMAL_COLORS.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: -2,
    shadowColor: '#000000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  scale: {
    position: 'absolute',
    top: 70,
    right: 4,
    flexDirection: 'row',
    gap: 6,
  },
  scaleLabels: {
    position: 'absolute',
    right: 24,
    top: 0,
    bottom: 0,
    width: 160,
  },
  scaleLabel: {
    position: 'absolute',
    right: 0,
    textAlign: 'right',
  },
  scaleMarker: {
    position: 'absolute',
    right: -14,
    bottom: -2,
  },
  viewfinder: {
    position: 'absolute',
    top: VIEWFINDER_TOP,
    bottom: 6,
    left: 0,
    right: 0,
  },
  readout: {
    position: 'absolute',
    left: SPACE.panel,
    top: 372,
    gap: 6,
  },
  dropShadow: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0.1,
  },
  dropShadowSmall: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0.1,
  },
  logRow: {
    paddingHorizontal: SPACE.rowX,
    paddingVertical: SPACE.rowY,
  },
});
