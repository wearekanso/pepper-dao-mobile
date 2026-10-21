import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { REPUTATION_POINTS, STREAK_MILESTONES } from '@/lib/reputation';
import type { Profile } from '@/types/user';

import { getHeatProgress } from '../lib/heat-levels';
import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
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
 * HOW TO EARN REP — every REP source, what you've already done and the next
 * best action, plus the streak bonus ladder.
 */
export function HowToEarnSheet({ visible, profile, onClose }: HowToEarnSheetProps) {
  const router = useRouter();
  const heat = getHeatProgress(profile);
  const actions = getActions(profile);
  const doneCount = actions.filter((action) => action.state === 'done').length;
  const repToNext = heat.targetPoints ? Math.max(0, heat.targetPoints - profile.reputation_points) : 0;
  const progress = heat.targetPoints ? Math.min(1, profile.reputation_points / heat.targetPoints) : heat.next ? 0 : 1;
  const nextMilestone = LADDER.find((step) => profile.current_streak_weeks < step.weeks)?.weeks ?? null;

  function findVote() {
    onClose();
    router.push('/governance');
  }

  return (
    <ThermalSheet
      visible={visible}
      onClose={onClose}
      title="HOW TO EARN REP"
      subtitle="Every action earns REP. More REP raises your heat level."
      footer={<PixelButton label="FIND A LIVE VOTE >" variant="gold" style={{ flex: 1 }} onPress={findVote} />}
    >
      <View>
        <HardShadow />
        <View style={styles.you}>
          <View style={styles.between}>
            <View style={[styles.between, { gap: 8 }]}>
              <HeatPepper level={heat.current} width={18} />
              <Text style={[TYPE.label12, { color: INK.muted }]}>{`${heat.current.name} · ${profile.reputation_points} REP`}</Text>
            </View>
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.cream }]}>
              {heat.next ? (repToNext > 0 ? `${repToNext} TO ${heat.next.name}` : `${heat.next.name} NEXT`) : 'MAX HEAT'}
            </Text>
          </View>
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

      <SheetSection label="STREAK BONUS" right="VOTE EVERY 2 WEEKS" />

      <View style={[styles.between, { gap: 8 }]}>
        {LADDER.map((step) => (
          <LadderStep
            key={step.weeks}
            step={step}
            state={profile.current_streak_weeks >= step.weeks ? 'reached' : step.weeks === nextMilestone ? 'next' : 'todo'}
          />
        ))}
      </View>
    </ThermalSheet>
  );
}

function ActionRow({ action }: { action: EarnAction }) {
  const isNext = action.state === 'next';
  const isDone = action.state === 'done';

  return (
    <View style={[styles.row, isNext && styles.rowNext]}>
      <View style={[styles.chip, CHIP_STYLES[action.state].box]}>
        <Text style={[TYPE.display24, { color: CHIP_STYLES[action.state].text }]}>{action.points}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.label12, { color: isDone ? INK.faint : THERMAL_COLORS.white }]}>{action.title}</Text>
        <Text style={[TYPE.meta18, { color: isDone ? INK_DONE_HINT : INK.muted }]}>{action.hint}</Text>
      </View>
      {isDone ? (
        <Text style={[TYPE.label12, { color: STATUS_COLORS.positive.text }]}>DONE</Text>
      ) : isNext ? (
        <View style={styles.nextTag}>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.void }]}>NEXT</Text>
        </View>
      ) : (
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
      )}
    </View>
  );
}

function LadderStep({ step, state }: { step: LadderItem; state: 'reached' | 'next' | 'todo' }) {
  const color = state === 'reached' ? STATUS_COLORS.positive.text : state === 'next' ? THERMAL_COLORS.cream : INK.muted;

  return (
    <View style={{ flex: 1 }}>
      <HardShadow />
      <View style={[styles.step, { borderColor: state === 'next' ? THERMAL_COLORS.white : THERMAL_COLORS.border }]}>
        <Text style={[TYPE.display24, { color }]}>{`+${step.points}`}</Text>
        <Text style={[TYPE.label12, { color: INK.muted }]}>{`${step.weeks}W`}</Text>
      </View>
    </View>
  );
}

function ProgressCells({ progress }: { progress: number }) {
  const filled = Math.round(progress * PROGRESS_CELLS);
  return (
    <View style={[styles.between, { gap: 2 }]}>
      {Array.from({ length: PROGRESS_CELLS }, (_, index) => (
        <View
          key={index}
          style={{ flex: 1, height: 6, backgroundColor: index < filled ? THERMAL_COLORS.cream : THERMAL_COLORS.ghost }}
        />
      ))}
    </View>
  );
}

/** REP sources in suggested order; the first one not done becomes NEXT */
function getActions(profile: Profile): Array<EarnAction> {
  const list: Array<Omit<EarnAction, 'state'> & { done: boolean }> = [
    { title: 'LINK WALLET', hint: 'One-time · unlocks MEMBER', points: `+${REPUTATION_POINTS.WALLET_CONNECTED}`, done: Boolean(profile.wallet_address) },
    { title: 'FIRST VOTE', hint: `Then +${REPUTATION_POINTS.VOTE} for every vote after`, points: `+${REPUTATION_POINTS.FIRST_VOTE}`, done: profile.has_voted },
    { title: 'STAKE PEPPER', hint: 'Every week while staked', points: `+${REPUTATION_POINTS.STAKING_BONUS}`, done: false },
    { title: 'PROPOSAL HEATS UP', hint: 'Your proposal gets engagement', points: `+${REPUTATION_POINTS.PROPOSAL_ENGAGED}`, done: profile.has_engaged_proposal },
    { title: 'PROPOSAL PASSES', hint: 'Community votes it through', points: `+${REPUTATION_POINTS.PROPOSAL_PASSED}`, done: profile.has_passed_proposal },
    { title: 'PROPOSAL EXECUTES', hint: 'Shipped on-chain', points: `+${REPUTATION_POINTS.PROPOSAL_EXECUTED}`, done: false },
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
  state: 'done' | 'next' | 'todo';
}

interface LadderItem {
  weeks: number;
  points: number;
}

const LADDER: Array<LadderItem> = Object.entries(STREAK_MILESTONES)
  .map(([weeks, points]) => ({ weeks: Number(weeks), points }))
  .sort((a, b) => a.weeks - b.weeks);

/** Points chip per action state: faded when done, filled cream when next */
const CHIP_STYLES: Record<EarnAction['state'], { box: object; text: string }> = {
  done: { box: { borderWidth: SIZE.stroke, borderColor: 'rgba(255,245,214,0.35)' }, text: 'rgba(255,245,214,0.4)' },
  next: { box: { backgroundColor: THERMAL_COLORS.cream }, text: THERMAL_COLORS.void },
  todo: { box: { borderWidth: SIZE.stroke, borderColor: THERMAL_COLORS.cream }, text: THERMAL_COLORS.cream },
};

/** Done hints fade a step further than done titles (Figma: 30%) */
const INK_DONE_HINT = 'rgba(255,255,255,0.3)';

const PROGRESS_CELLS = 16;

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  you: {
    gap: 8,
    padding: 12,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  list: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: SPACE.rowX,
  },
  rowNext: {
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.white,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chip: {
    width: 52,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTag: {
    backgroundColor: THERMAL_COLORS.white,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  step: {
    alignItems: 'center',
    gap: 2,
    padding: 10,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
  },
});
