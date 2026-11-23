/**
 * Reward engine: what a wallet has earned from its governance history.
 *
 * Pure and deterministic: the same votes and proposals always give the same
 * grants, so it is safe to run again and again. Every grant has a key that
 * is unique per wallet; the database pays a key once (reward_grants), so a
 * re-run, a reinstall or a wallet moved to another profile never pays twice.
 *
 * Used by sync-proposals (after indexing votes) and link-wallet (a newly
 * linked wallet gets what it earned before). Keep this file free of Deno and
 * React Native APIs.
 */

import {
  getStreakMilestonePoints,
  getStreakPeriod,
  getStreakPeriodStart,
  getStreakWeeks,
  REPUTATION_POINTS,
} from './reputation-rules.ts';

/**
 * Compute every reward `votes` and `proposals` give one wallet, plus the
 * profile state that follows from them.
 *
 * - FIRST_VOTE for the wallet's earliest vote, VOTE for each other proposal
 * - STREAK_MILESTONE for each milestone a streak reached (see
 *   reputation-rules.ts for the streak rule); a broken streak keeps what it
 *   earned, a new streak can earn the milestones again
 * - PROPOSAL_ENGAGED / PASSED / EXECUTED for proposals the wallet created:
 *   turnout reached the track's minimum participation / the proposal
 *   passed / it was executed
 */
export function computeRewards(input: RewardInput): RewardResult {
  const address = input.address.toLowerCase();
  const proposalsByKey = new Map(input.proposals.map((proposal) => [proposalKey(proposal), proposal]));
  const votes = input.votes
    .filter((vote) => vote.voter.toLowerCase() === address)
    .sort((a, b) => a.votedAt - b.votedAt || proposalKey(a).localeCompare(proposalKey(b)));

  const grants: Array<RewardGrant> = [];

  // Votes: one grant per proposal; the earliest is the first vote
  votes.forEach((vote, index) => {
    const proposal = proposalsByKey.get(proposalKey(vote));
    const isFirst = index === 0;
    grants.push({
      key: isFirst ? 'first_vote' : `vote:${proposalKey(vote)}`,
      eventType: isFirst ? 'FIRST_VOTE' : 'VOTE',
      points: isFirst ? REPUTATION_POINTS.FIRST_VOTE : REPUTATION_POINTS.VOTE,
      occurredAt: vote.votedAt,
      proposalLabel: proposal?.displayIndex ?? null,
      metadata: { plugin: vote.pluginAddress.toLowerCase(), proposal_id: vote.proposalId },
    });
  });

  // Streaks
  const streak = computeStreaks(votes, input.proposals, input.now);
  for (const run of streak.runs) {
    for (let periods = 2; periods <= run.periods; periods += 1) {
      const weeks = getStreakWeeks(periods);
      const points = getStreakMilestonePoints(weeks);
      if (points === 0) continue;
      grants.push({
        key: `streak:${run.startPeriod}:${weeks}`,
        eventType: 'STREAK_MILESTONE',
        points,
        occurredAt: run.reachedAt[periods - 1],
        proposalLabel: null,
        metadata: { weeks, streak_start: new Date(getStreakPeriodStart(run.startPeriod)).toISOString() },
      });
    }
  }

  // Proposals the wallet created
  let hasEngagedProposal = false;
  let hasPassedProposal = false;
  for (const proposal of input.proposals) {
    if (proposal.creator?.toLowerCase() !== address) continue;
    const key = proposalKey(proposal);
    const base = {
      proposalLabel: proposal.displayIndex,
      metadata: { plugin: proposal.pluginAddress.toLowerCase(), proposal_id: proposal.proposalId },
    };
    const endedAt = Math.min(proposal.endDate, input.now);

    if (reachedMinParticipation(proposal)) {
      hasEngagedProposal = true;
      grants.push({ ...base, key: `proposal_engaged:${key}`, eventType: 'PROPOSAL_ENGAGED', points: REPUTATION_POINTS.PROPOSAL_ENGAGED, occurredAt: endedAt });
    }
    if (proposal.status === 'SUCCEEDED' || proposal.status === 'EXECUTED') {
      hasPassedProposal = true;
      grants.push({ ...base, key: `proposal_passed:${key}`, eventType: 'PROPOSAL_PASSED', points: REPUTATION_POINTS.PROPOSAL_PASSED, occurredAt: endedAt });
    }
    if (proposal.status === 'EXECUTED') {
      grants.push({
        ...base,
        key: `proposal_executed:${key}`,
        eventType: 'PROPOSAL_EXECUTED',
        points: REPUTATION_POINTS.PROPOSAL_EXECUTED,
        occurredAt: proposal.executedAt ?? endedAt,
      });
    }
  }

  grants.sort((a, b) => a.occurredAt - b.occurredAt || a.key.localeCompare(b.key));

  const lastVoteAt = votes.length > 0 ? votes[votes.length - 1].votedAt : null;
  return {
    grants,
    state: {
      hasVoted: votes.length > 0,
      hasEngagedProposal,
      hasPassedProposal,
      currentStreakWeeks: streak.current ? getStreakWeeks(streak.current.periods) : 0,
      longestStreakWeeks: Math.max(0, ...streak.runs.map((run) => getStreakWeeks(run.periods))),
      streakStartPeriod: streak.current?.startPeriod ?? null,
      streakVotes: streak.current?.votes ?? 0,
      lastVoteAt,
    },
  };
}

/** Plugin + on-chain proposal id: proposal ids are only unique per plugin */
export function proposalKey(item: { pluginAddress: string; proposalId: string }): string {
  return `${item.pluginAddress.toLowerCase()}:${item.proposalId}`;
}

/**
 * Streak runs from the wallet's votes. Periods are only counted when a
 * proposal was open to vote at some point in them.
 */
function computeStreaks(votes: Array<RewardVote>, proposals: Array<RewardProposal>, now: number): StreakResult {
  const currentPeriod = getStreakPeriod(now);

  // Periods in which a vote was possible
  const openPeriods = new Set<number>();
  for (const proposal of proposals) {
    if (proposal.status === 'CANCELED') continue;
    const first = getStreakPeriod(proposal.startDate);
    const last = getStreakPeriod(Math.min(proposal.endDate, now));
    for (let period = first; period <= last && period <= currentPeriod; period += 1) openPeriods.add(period);
  }

  // First vote time and vote count per period
  const votesByPeriod = new Map<number, { firstAt: number; count: number }>();
  for (const vote of votes) {
    const period = getStreakPeriod(vote.votedAt);
    openPeriods.add(period); // A vote proves the period was open
    const entry = votesByPeriod.get(period);
    if (entry) entry.count += 1;
    else votesByPeriod.set(period, { firstAt: vote.votedAt, count: 1 });
  }

  const runs: Array<StreakRun> = [];
  let run: StreakRun | null = null;
  for (const period of [...openPeriods].sort((a, b) => a - b)) {
    const voted = votesByPeriod.get(period);
    if (voted) {
      if (!run) {
        run = { startPeriod: period, periods: 0, reachedAt: [], votes: 0 };
        runs.push(run);
      }
      run.periods += 1;
      run.reachedAt.push(voted.firstAt);
      run.votes += voted.count;
    } else if (period < currentPeriod) {
      // An open period ended without a vote
      run = null;
    }
    // The period in progress without a vote yet: the streak is still alive
  }

  return { runs, current: run };
}

/** Turnout (yes + no + abstain) reached the track's minimum participation */
function reachedMinParticipation(proposal: RewardProposal): boolean {
  const total = toBigInt(proposal.totalVotingPower);
  if (total === null || total === BigInt(0) || proposal.minParticipation <= 0) return false;
  const cast = (toBigInt(proposal.tallyYes) ?? BigInt(0)) + (toBigInt(proposal.tallyNo) ?? BigInt(0)) + (toBigInt(proposal.tallyAbstain) ?? BigInt(0));
  // minParticipation is in Aragon's ratio base: 1,000,000 = 100%
  return cast * BigInt(1_000_000) >= total * BigInt(proposal.minParticipation);
}

function toBigInt(value: string | null): bigint | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export interface RewardVote {
  pluginAddress: string;
  proposalId: string;
  voter: string;
  /** ms */
  votedAt: number;
}

export interface RewardProposal {
  pluginAddress: string;
  proposalId: string;
  /** Short number shown in the app ("22"); null when not known */
  displayIndex: string | null;
  creator: string | null;
  status: string;
  /** ms */
  startDate: number;
  /** ms */
  endDate: number;
  /** ms */
  executedAt: number | null;
  tallyYes: string | null;
  tallyNo: string | null;
  tallyAbstain: string | null;
  totalVotingPower: string | null;
  /** Aragon ratio base: 1,000,000 = 100% */
  minParticipation: number;
}

export interface RewardInput {
  address: string;
  votes: Array<RewardVote>;
  proposals: Array<RewardProposal>;
  /** ms */
  now: number;
}

export interface RewardGrant {
  /** Unique per wallet; the database pays each key once */
  key: string;
  eventType: 'FIRST_VOTE' | 'VOTE' | 'STREAK_MILESTONE' | 'PROPOSAL_ENGAGED' | 'PROPOSAL_PASSED' | 'PROPOSAL_EXECUTED';
  points: number;
  /** ms; activities are written in this order */
  occurredAt: number;
  /** Goes to activities.proposal_id, which the app shows as "#22" */
  proposalLabel: string | null;
  metadata: Record<string, unknown>;
}

export interface RewardState {
  hasVoted: boolean;
  hasEngagedProposal: boolean;
  hasPassedProposal: boolean;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  /** Period the current streak started in; null when there is none */
  streakStartPeriod: number | null;
  /** Votes cast during the current streak */
  streakVotes: number;
  /** ms */
  lastVoteAt: number | null;
}

export interface RewardResult {
  grants: Array<RewardGrant>;
  state: RewardState;
}

interface StreakRun {
  startPeriod: number;
  periods: number;
  /** Time each period of the run was earned (its first vote), ms */
  reachedAt: Array<number>;
  votes: number;
}

interface StreakResult {
  runs: Array<StreakRun>;
  current: StreakRun | null;
}
