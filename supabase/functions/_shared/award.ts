/**
 * Paying rewards: loads a wallet's votes and proposals, runs the reward
 * engine (rewards.ts) and hands the result to apply_rewards(), then promotes
 * the rank. Used by sync-proposals and link-wallet (Deno, service role).
 */

import { computeRewards, type RewardProposal, type RewardVote } from './rewards.ts';
import {
  eligibleRank,
  getStreakPeriodStart,
  isHigherRank,
  type RankInput,
  type RuleRank,
} from './reputation-rules.ts';

/** sync_state row of the proposal index (sync-proposals' own cursor) */
export const PROPOSALS_SYNC_STATE_ID = 'main_dao';
/** sync_state row of the VoteCast index */
export const VOTES_SYNC_STATE_ID = 'main_dao_votes';
/** sync_state row of the hourly re-check of every verified wallet */
export const REWARDS_SYNC_STATE_ID = 'rewards';

/**
 * Rewards are only paid once both indexes have reached the chain head (give
 * or take this many blocks, ~1.5 h):
 * - votes: before that a wallet's earliest vote may be missing, so its first
 *   vote and streaks would come out wrong
 * - proposals: a missing proposal hides a period in which a vote was
 *   possible, so a streak would run through a gap it should break at, pay
 *   its milestones early, and pay them again once the proposal shows up
 *   (the streak then splits and its milestone keys change)
 * A proposal created within the lag can only open the period in progress,
 * which never breaks a streak.
 */
const MAX_INDEX_LAG_BLOCKS = 2_000;

/** True when the vote and proposal indexes are close enough to `headBlock` to pay rewards */
export async function isRewardDataCurrent(supabase: SupabaseLike, headBlock: bigint): Promise<boolean> {
  const { data, error } = await supabase
    .from('sync_state')
    .select('id, last_synced_block')
    .in('id', [VOTES_SYNC_STATE_ID, PROPOSALS_SYNC_STATE_ID]);
  if (error || !data || data.length < 2) return false;
  return data.every(
    (row: { last_synced_block: number | string }) =>
      BigInt(row.last_synced_block) + BigInt(MAX_INDEX_LAG_BLOCKS) >= headBlock,
  );
}

/**
 * Every row a query returns, page by page: PostgREST caps one response (1,000
 * rows by default), so a single select would cut off the rest silently.
 * `build` makes a fresh, ordered query for each page.
 */
export async function selectAll<T>(build: () => SupabaseLike): Promise<Array<T>> {
  const rows: Array<T> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<T>));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Rows per page in selectAll; at most the PostgREST cap */
const PAGE_SIZE = 1_000;

/** Every proposal, in the shape the reward engine reads */
export async function loadRewardProposals(supabase: SupabaseLike): Promise<Array<RewardProposal>> {
  const rows = await selectAll<ProposalRow>(() =>
    supabase
      .from('proposals')
      .select(
        'proposal_id, plugin_address, display_index, creator, status, start_date, end_date, executed_at, tally_yes, tally_no, tally_abstain, total_voting_power, min_participation',
      )
      .order('plugin_address')
      .order('proposal_id'),
  );
  return rows.map((row) => ({
    pluginAddress: row.plugin_address,
    proposalId: row.proposal_id,
    displayIndex: row.display_index === null ? null : String(row.display_index),
    creator: row.creator,
    status: row.status,
    startDate: Date.parse(row.start_date),
    endDate: Date.parse(row.end_date),
    executedAt: row.executed_at ? Date.parse(row.executed_at) : null,
    tallyYes: row.tally_yes,
    tallyNo: row.tally_no,
    tallyAbstain: row.tally_abstain,
    totalVotingPower: row.total_voting_power,
    minParticipation: row.min_participation ?? 0,
  }));
}

/**
 * Pay what the wallet has earned to the verified profile that holds it.
 * Safe to call any number of times: only grants not paid before are paid.
 * Returns the updated profile, or null when no profile holds the wallet as a
 * verified link (nothing to pay yet; the link pays it later).
 */
export async function refreshWalletRewards(
  supabase: SupabaseLike,
  address: string,
  proposals?: Array<RewardProposal>,
): Promise<RewardProfile | null> {
  const wallet = address.toLowerCase();

  // Addresses are hex, so ilike is an exact, case-insensitive match
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('wallet_address', wallet)
    .not('wallet_verified_at', 'is', null)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const voteRows = await selectAll<VoteRow>(() =>
    supabase
      .from('chain_votes')
      .select('plugin_address, proposal_id, voter, voted_at')
      .eq('voter', wallet)
      .order('plugin_address')
      .order('proposal_id'),
  );

  const votes: Array<RewardVote> = voteRows.map((row) => ({
    pluginAddress: row.plugin_address,
    proposalId: row.proposal_id,
    voter: row.voter,
    votedAt: Date.parse(row.voted_at),
  }));

  const { grants, state } = computeRewards({
    address: wallet,
    votes,
    proposals: proposals ?? (await loadRewardProposals(supabase)),
    now: Date.now(),
  });

  const { data: applied, error: applyError } = await supabase.rpc('apply_rewards', {
    p_user_id: profile.id,
    p_address: wallet,
    p_grants: grants.map((grant) => ({
      key: grant.key,
      event_type: grant.eventType,
      points: grant.points,
      proposal_label: grant.proposalLabel,
      metadata: { ...grant.metadata, earned_at: new Date(grant.occurredAt).toISOString() },
    })),
    p_state: {
      has_voted: state.hasVoted,
      has_engaged_proposal: state.hasEngagedProposal,
      has_passed_proposal: state.hasPassedProposal,
      current_streak_weeks: state.currentStreakWeeks,
      longest_streak_weeks: state.longestStreakWeeks,
      streak_start:
        state.streakStartPeriod === null
          ? null
          : new Date(getStreakPeriodStart(state.streakStartPeriod)).toISOString().slice(0, 10),
      streak_votes: state.streakVotes,
      last_vote_at: state.lastVoteAt === null ? null : new Date(state.lastVoteAt).toISOString(),
    },
  });
  if (applyError || !applied) throw applyError ?? new Error('apply_rewards returned nothing');

  return promoteIfEligible(supabase, applied as RewardProfile);
}

/** Promote to the highest eligible rank; never demotes */
export async function promoteIfEligible(supabase: SupabaseLike, profile: RewardProfile): Promise<RewardProfile> {
  const currentRank = profile.rank as RuleRank;
  const eligible = eligibleRank(profile);
  if (!isHigherRank(eligible, currentRank)) return profile;

  // Only applies if the rank is still what we read
  const { data, error } = await supabase.rpc('promote_rank', {
    p_user_id: profile.id,
    p_from: currentRank,
    p_to: eligible,
  });
  if (error || !data) {
    // The rank is recalculated on the next call
    console.error('[award] promote_rank failed:', error);
    return profile;
  }
  return data as RewardProfile;
}

export interface RewardProfile extends RankInput {
  id: string;
  rank: string;
  wallet_verified_at: string | null;
}

/** The parts of a supabase-js client used here (keeps this file client-agnostic) */
// deno-lint-ignore no-explicit-any
export type SupabaseLike = any;

interface ProposalRow {
  proposal_id: string;
  plugin_address: string;
  display_index: number | null;
  creator: string | null;
  status: string;
  start_date: string;
  end_date: string;
  executed_at: string | null;
  tally_yes: string | null;
  tally_no: string | null;
  tally_abstain: string | null;
  total_voting_power: string | null;
  min_participation: number | null;
}

interface VoteRow {
  plugin_address: string;
  proposal_id: string;
  voter: string;
  voted_at: string;
}
