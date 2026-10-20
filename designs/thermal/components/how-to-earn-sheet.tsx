import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { REPUTATION_POINTS, STREAK_MILESTONES } from '@/lib/reputation';
import type { Profile } from '@/types/user';

import { getHeatProgress, formatShu } from '../lib/heat-levels';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { DashedDivider } from './atoms';
import { HardShadow } from './panel';
import { HeatPepper } from './pixel-art';
import { PixelButton } from './pixel-button';
import { SheetSection, ThermalSheet } from './thermal-sheet';

interface HowToEarnSheetProps {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
}

/**
 * HOW TO EARN HEAT — bottom sheet listing every REP source, what you've
 * already done and the next best action, plus the streak bonus ladder.
 */
export function HowToEarnSheet({ visible, profile, onClose }: HowToEarnSheetProps) {
  const router = useRouter();
  const heat = getHeatProgress(profile);
  const actions = getActions(profile);
  const doneCount = actions.filter((action) => action.state === 'done').length;
  const repToNext = heat.targetPoints ? Math.max(0, heat.targetPoints - profile.reputation_points) : 0;
  const progress = heat.targetPoints ? Math.min(1, profile.reputation_points / heat.targetPoints) : heat.next ? 0 : 1;

  function findVote() {
    onClose();
    router.push('/governance');
  }

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      title="HOW TO EARN HEAT"
      subtitle="Every action adds REP. REP turns up your SHU."
      footer={<PixelButton label="FIND A LIVE VOTE >" variant="gold" style={{ flex: 1 }} onPress={findVote} />}
    >
      <View style={styles.you}>
        <HeatPepper level={heat.current} width={18} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[TYPE.label10, { opacity: 0.6 }]}>
            {`YOU · ${heat.current.name} · ${profile.reputation_points} REP`}
          </Text>
          <Text style={TYPE.meta18}>
            {heat.next
              ? repToNext > 0
                ? `${repToNext} REP TO ${heat.next.name} ${formatShu(heat.next.shu)} SHU`
                : `UNLOCK ${heat.next.name} WITH YOUR NEXT ACTION`
              : 'MAXIMUM HEAT REACHED'}
          </Text>
          <ProgressCells progress={progress} />
        </View>
      </View>

      <SheetSection label="ACTIONS" right={`${doneCount} / ${actions.length} DONE`} />

      <View>
        <HardShadow />
        <View style={styles.list}>
          {actions.map((action, index) => (
            <View key={action.title}>
              <ActionRow action={action} />
              {index < actions.length - 1 && action.state !== 'next' && actions[index + 1]?.state !== 'next' ? (
                <DashedDivider />
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <SheetSection label="KEEP THE FIRE · STREAK BONUS" right="VOTE EVERY 2 WEEKS" rightColor={THERMAL_COLORS.orange} />

      <View>
        <HardShadow />
        <View style={styles.ladder}>
          {LADDER.map((step) => (
            <LadderStep key={step.weeks} step={step} reached={profile.current_streak_weeks >= step.weeks} />
          ))}
        </View>
      </View>
    </ThermalSheet>
  );
}

function ActionRow({ action }: { action: EarnAction }) {
  const glow = useSharedValue(0);
  const isNext = action.state === 'next';
  const isDone = action.state === 'done';

  useEffect(() => {
    if (!isNext) return;
    glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow, isNext]);

  const rowStyle = useAnimatedStyle(() => {
    if (!isNext) return {};
    return {
      borderColor: interpolateColor(glow.value, [0, 1], [THERMAL_COLORS.orange, THERMAL_COLORS.gold]),
      backgroundColor: interpolateColor(glow.value, [0, 1], ['rgba(255,122,0,0.10)', 'rgba(255,122,0,0.18)']),
    };
  });

  const chipColor = isNext ? THERMAL_COLORS.void : action.heat;

  return (
    <Animated.View style={[styles.row, isNext && styles.rowNext, rowStyle]}>
      <View
        style={[
          styles.chip,
          isNext
            ? { backgroundColor: THERMAL_COLORS.orange }
            : { borderWidth: 2, borderColor: action.heat, backgroundColor: isDone ? 'transparent' : `${action.heat}14` },
          isDone && { opacity: 0.4 },
        ]}
      >
        <Text style={[TYPE.display24, { color: chipColor }]}>{action.points}</Text>
        {action.unit ? <Text style={[TYPE.label10, { color: chipColor, fontSize: 10, marginTop: -2 }]}>{action.unit}</Text> : null}
      </View>
      <View style={{ flex: 1, gap: 2, opacity: isDone ? 0.4 : 1 }}>
        <Text style={TYPE.label12}>{action.title}</Text>
        <Text style={[TYPE.meta16, { opacity: 0.6 }]}>{action.hint}</Text>
      </View>
      {isDone ? (
        <View style={styles.doneTag}>
          <Text style={[TYPE.label10, { color: THERMAL_COLORS.cream, opacity: 0.6 }]}>DONE</Text>
        </View>
      ) : isNext ? (
        <View style={styles.nextTag}>
          <Text style={[TYPE.label10, { color: THERMAL_COLORS.void }]}>NEXT</Text>
        </View>
      ) : (
        <Text style={[TYPE.label12, { opacity: 0.4 }]}>{'>'}</Text>
      )}
    </Animated.View>
  );
}

function LadderStep({ step, reached }: { step: LadderItem; reached: boolean }) {
  return (
    <View style={styles.step}>
      <View style={{ gap: 2, alignItems: 'center' }}>
        {Array.from({ length: step.bars }, (_, bar) => (
          <View key={bar} style={{ width: 28, height: 4, backgroundColor: step.color, opacity: reached ? 1 : 0.35 }} />
        ))}
      </View>
      <Text style={[TYPE.display24, { color: reached ? THERMAL_COLORS.cream : step.color, opacity: reached ? 1 : 0.7 }]}>
        {`+${step.points}`}
      </Text>
      <Text style={[TYPE.label10, { opacity: 0.6 }]}>{`${step.weeks}W`}</Text>
    </View>
  );
}

function ProgressCells({ progress }: { progress: number }) {
  const filled = Math.round(progress * PROGRESS_CELLS);
  return (
    <View style={[styles.between, { gap: 2, marginTop: 4 }]}>
      {Array.from({ length: PROGRESS_CELLS }, (_, index) => (
        <View
          key={index}
          style={{ flex: 1, height: 6, backgroundColor: index < filled ? THERMAL_COLORS.orange : THERMAL_COLORS.ghost }}
        />
      ))}
    </View>
  );
}



/** REP sources in suggested order; the first one not done becomes NEXT */
function getActions(profile: Profile): Array<EarnAction> {
  const list: Array<Omit<EarnAction, 'state'> & { done: boolean }> = [
    { title: 'LINK WALLET', hint: 'One-time · unlocks MEMBER', points: `+${REPUTATION_POINTS.WALLET_CONNECTED}`, heat: THERMAL_COLORS.cream, done: Boolean(profile.wallet_address) },
    { title: 'FIRST VOTE', hint: `Then +${REPUTATION_POINTS.VOTE} for every vote after`, points: `+${REPUTATION_POINTS.FIRST_VOTE}`, heat: THERMAL_COLORS.cream, done: profile.has_voted },
    { title: 'STAKE PEPPER', hint: 'Per week while staked', points: `+${REPUTATION_POINTS.STAKING_BONUS}`, unit: '/WK', heat: THERMAL_COLORS.cream, done: false },
    { title: 'PROPOSAL HEATS UP', hint: 'Your proposal gets engagement', points: `+${REPUTATION_POINTS.PROPOSAL_ENGAGED}`, heat: THERMAL_COLORS.gold, done: profile.has_engaged_proposal },
    { title: 'PROPOSAL PASSES', hint: 'Community votes it through', points: `+${REPUTATION_POINTS.PROPOSAL_PASSED}`, heat: THERMAL_COLORS.orange, done: profile.has_passed_proposal },
    { title: 'PROPOSAL EXECUTES', hint: 'Shipped on-chain', points: `+${REPUTATION_POINTS.PROPOSAL_EXECUTED}`, heat: THERMAL_COLORS.red, done: false },
  ];

  const nextIndex = list.findIndex((item) => !item.done);
  return list.map(({ done, ...item }, index) => ({
    ...item,
    state: done ? 'done' : index === nextIndex ? 'next' : 'todo',
  }));
}

interface EarnAction {
  title: string;
  hint: string;
  points: string;
  unit?: string;
  heat: string;
  state: 'done' | 'next' | 'todo';
}

interface LadderItem {
  weeks: number;
  points: number;
  bars: number;
  color: string;
}

const LADDER_COLORS = [THERMAL_COLORS.orange, THERMAL_COLORS.gold, THERMAL_COLORS.orange, THERMAL_COLORS.red];
const LADDER_BARS = [2, 3, 5, 7];
const LADDER: Array<LadderItem> = Object.entries(STREAK_MILESTONES)
  .map(([weeks, points]) => ({ weeks: Number(weeks), points }))
  .sort((a, b) => a.weeks - b.weeks)
  .map((item, index) => ({ ...item, bars: LADDER_BARS[index] ?? 7, color: LADDER_COLORS[index] ?? THERMAL_COLORS.red }));


const PROGRESS_CELLS = 16;

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  you: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: THERMAL_COLORS.orange,
  },
  list: {
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACE.rowY,
    paddingHorizontal: SPACE.rowX,
  },
  rowNext: {
    borderWidth: 2,
  },
  chip: {
    width: 52,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTag: {
    borderWidth: 1,
    borderColor: 'rgba(255,245,214,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  nextTag: {
    backgroundColor: THERMAL_COLORS.orange,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ladder: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
});
