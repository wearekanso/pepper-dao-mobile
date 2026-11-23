import { createPublicClient, http, parseAbiItem, type Chain } from 'npm:viem@2.38.6';

import {
  isRewardDataCurrent,
  loadRewardProposals,
  refreshWalletRewards,
  REWARDS_SYNC_STATE_ID,
  selectAll,
  type SupabaseLike,
  VOTES_SYNC_STATE_ID,
} from '../_shared/award.ts';

/**
 * Vote index and rewards, run at the end of each sync-proposals run.
 *
 * 1. Index: every VoteCast of the track plugins goes into chain_votes. The
 *    cursor (sync_state 'main_dao_votes') is separate from the proposal
 *    cursor, so the first runs read the whole vote history from the plugins'
 *    first block. Ankr's public RPC only allows 1,000 blocks per getLogs, so
 *    logs come from CHILIZ_LOGS_RPC_URL (default rpc.chiliz.com, which takes
 *    100,000-block ranges: the whole history is a few requests).
 * 2. Rewards: once the vote and proposal indexes are current, the voters
 *    seen in this run are paid at once; every hour all verified wallets are
 *    re-checked too, which catches streaks that ended and proposals that
 *    passed. The hourly list is shuffled, so a run cut short by its time
 *    budget doesn't always leave the same wallets for last.
 *
 * Never throws: a failure is logged and returned, the proposal sync result
 * stands.
 */
export async function syncVotesAndRewards(options: VoteSyncOptions): Promise<VoteSyncResult> {
  const { supabase, chain, plugins, firstBlock, safeBlock, deadline } = options;
  const result: VoteSyncResult = {
    votesIndexed: 0,
    indexedToBlock: null,
    indexCurrent: false,
    walletsChecked: 0,
    fullRefresh: false,
    error: null,
  };

  try {
    // 1. Index
    const { data: state, error: stateError } = await supabase
      .from('sync_state')
      .select('last_synced_block')
      .eq('id', VOTES_SYNC_STATE_ID)
      .maybeSingle();
    if (stateError) throw stateError;

    let cursor = state ? BigInt(state.last_synced_block) : firstBlock - BigInt(1);
    if (cursor < firstBlock - BigInt(1)) cursor = firstBlock - BigInt(1);

    const logsClient = createPublicClient({
      chain,
      transport: http(Deno.env.get('CHILIZ_LOGS_RPC_URL') ?? 'https://rpc.chiliz.com'),
    });
    const blockTimes = new Map<bigint, string>();
    const voters = new Set<string>();

    while (cursor < safeBlock && Date.now() < deadline) {
      const fromBlock = cursor + BigInt(1);
      const toBlock = fromBlock + VOTE_CHUNK_BLOCKS - BigInt(1) > safeBlock ? safeBlock : fromBlock + VOTE_CHUNK_BLOCKS - BigInt(1);

      const logs = await logsClient.getLogs({
        address: [...plugins],
        event: VOTE_CAST_EVENT,
        fromBlock,
        toBlock,
        strict: true,
      });

      // Block times for the votes, read in parallel (VoteCast has no timestamp)
      const missingBlocks = [...new Set(logs.map((log) => log.blockNumber))].filter((block) => !blockTimes.has(block));
      for (let i = 0; i < missingBlocks.length; i += BLOCK_FETCH_CONCURRENCY) {
        const batch = missingBlocks.slice(i, i + BLOCK_FETCH_CONCURRENCY);
        const blocks = await Promise.all(batch.map((blockNumber) => logsClient.getBlock({ blockNumber })));
        blocks.forEach((block, index) => blockTimes.set(batch[index], new Date(Number(block.timestamp) * 1000).toISOString()));
      }

      const rows = [];
      for (const log of logs) {
        const votedAt = blockTimes.get(log.blockNumber)!;
        const voter = log.args.voter.toLowerCase();
        voters.add(voter);
        rows.push({
          plugin_address: log.address.toLowerCase(),
          proposal_id: log.args.proposalId.toString(),
          voter,
          vote_option: log.args.voteOption,
          voting_power: log.args.votingPower.toString(),
          block_number: Number(log.blockNumber),
          transaction_hash: log.transactionHash,
          voted_at: votedAt,
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from('chain_votes')
          .upsert(rows, { onConflict: 'plugin_address,proposal_id,voter' });
        if (error) throw error;
        result.votesIndexed += rows.length;
      }

      // The cursor only moves past blocks whose votes are stored
      const { error: cursorError } = await supabase
        .from('sync_state')
        .upsert({ id: VOTES_SYNC_STATE_ID, last_synced_block: Number(toBlock), last_sync_at: new Date().toISOString(), error_message: null });
      if (cursorError) throw cursorError;
      cursor = toBlock;
    }
    result.indexedToBlock = Number(cursor);

    // 2. Rewards, only from current vote and proposal indexes
    result.indexCurrent = await isRewardDataCurrent(supabase, safeBlock);
    if (!result.indexCurrent) return result;

    const { data: rewardsState } = await supabase
      .from('sync_state')
      .select('last_sync_at')
      .eq('id', REWARDS_SYNC_STATE_ID)
      .maybeSingle();
    const lastFullRefresh = rewardsState?.last_sync_at ? Date.parse(rewardsState.last_sync_at) : 0;
    result.fullRefresh = Date.now() - lastFullRefresh >= FULL_REFRESH_INTERVAL_MS;

    // This run's voters first, then (hourly) every verified wallet in random order
    const wallets = new Set(voters);
    if (result.fullRefresh) {
      const profiles = await selectAll<{ wallet_address: string }>(() =>
        supabase
          .from('profiles')
          .select('wallet_address')
          .not('wallet_address', 'is', null)
          .not('wallet_verified_at', 'is', null)
          .order('id'),
      );
      for (const wallet of shuffle(profiles.map((profile) => String(profile.wallet_address).toLowerCase()))) {
        wallets.add(wallet);
      }
    }
    if (wallets.size === 0) return result;

    const proposals = await loadRewardProposals(supabase);
    let failures = 0;
    let finished = true;
    for (const wallet of wallets) {
      if (Date.now() >= deadline) {
        finished = false;
        break;
      }
      try {
        await refreshWalletRewards(supabase, wallet, proposals);
        result.walletsChecked += 1;
      } catch (error) {
        failures += 1;
        console.error(`[votes] rewards for ${wallet} failed:`, error);
      }
    }

    if (failures > 0) {
      result.error = `Rewards failed for ${failures} wallet(s); retried on the next hourly check`;
    }
    // A wallet that keeps failing must not restart the full check every run:
    // the hour is marked done once every wallet was tried. A run that ran out
    // of time is not done; the next one tries again in a new random order.
    if (result.fullRefresh && finished) {
      await supabase
        .from('sync_state')
        .upsert({ id: REWARDS_SYNC_STATE_ID, last_synced_block: 0, last_sync_at: new Date().toISOString() });
    } else {
      result.fullRefresh = false;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('[votes] vote sync failed:', error);
    await supabase
      .from('sync_state')
      .update({ error_message: result.error.slice(0, 500) })
      .eq('id', VOTES_SYNC_STATE_ID);
  }

  return result;
}

/** A shuffled copy (Fisher-Yates) */
function shuffle<T>(items: Array<T>): Array<T> {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const VOTE_CAST_EVENT = parseAbiItem(
  'event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 voteOption, uint256 votingPower)',
);

/** Blocks per getLogs on the logs RPC (rpc.chiliz.com accepts up to 250,000) */
const VOTE_CHUNK_BLOCKS = BigInt(100_000);

/** Block headers read at once while indexing a chunk of votes */
const BLOCK_FETCH_CONCURRENCY = 10;

/** How often every verified wallet is re-checked */
const FULL_REFRESH_INTERVAL_MS = 60 * 60_000;

export interface VoteSyncOptions {
  supabase: SupabaseLike;
  chain: Chain;
  plugins: ReadonlyArray<`0x${string}`>;
  /** First block worth indexing (the plugins did not exist before it) */
  firstBlock: bigint;
  /** Confirmed head: nothing past it is indexed */
  safeBlock: bigint;
  /** ms timestamp after which no new request is started */
  deadline: number;
}

export interface VoteSyncResult {
  votesIndexed: number;
  indexedToBlock: number | null;
  indexCurrent: boolean;
  walletsChecked: number;
  fullRefresh: boolean;
  error: string | null;
}
