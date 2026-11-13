import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createPublicClient, getAbiItem, http, hexToString } from 'npm:viem@2.38.6';

/**
 * Sync Proposals Edge Function
 *
 * Indexes ProposalCreated events from the PEPPER MainDao track plugins
 * (one Aragon TokenVoting 1.4 plugin per voting track) and stores them in
 * Supabase for fast retrieval.
 *
 * DAO: 0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213 (chiliz-mainnet)
 *
 * Deployment: supabase functions deploy sync-proposals --no-verify-jwt
 *
 * Usage:
 * - Manual: curl -X POST https://<project>.supabase.co/functions/v1/sync-proposals
 * - Cron: Set up via Supabase Dashboard > Database > Extensions > pg_cron
 *
 * Ankr Public Tier Limits (https://www.ankr.com/docs/rpc-service/service-plans/):
 * - Max block range: 1,000 blocks
 * - Rate limit: ~1,800 requests/minute
 */

// Chiliz mainnet chain configuration
const chiliz = {
  id: 88888,
  name: 'Chiliz',
  nativeCurrency: { name: 'CHZ', symbol: 'CHZ', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/chiliz'] },
  },
  blockExplorers: {
    default: { name: 'Chiliscan', url: 'https://chiliscan.com' },
  },
} as const;

/**
 * Track plugins of the PEPPER MainDao.
 * Keep in sync with config/aragon-governance.ts (trackPlugins).
 */
const TRACK_PLUGINS = [
  { track: 'STANDARD', address: '0xD17B92BD293942A071CDbF3A6e57A790c7FAAD67' },
  { track: 'AGILE', address: '0xA80Bb5fc5B8CE2e84d31338579954e8e37d7f802' },
  { track: 'FAST', address: '0xf544833da4f7Eb68A50b636b3eB5895310780137' },
] as const;

const TRACK_PLUGIN_ADDRESSES = TRACK_PLUGINS.map((plugin) => plugin.address);
const TRACK_PLUGIN_ADDRESSES_LOWER = TRACK_PLUGIN_ADDRESSES.map((address) => address.toLowerCase());

/**
 * The current track plugins were installed right after this block, so the
 * indexer never needs to scan anything older (see config firstIndexedBlock).
 */
const FIRST_INDEXED_BLOCK = BigInt(34_100_000);

/** Aragon's IPFS gateway: the public ipfs.io / dweb.link gateways now answer 429 */
const IPFS_GATEWAY = 'https://aragon-1.mypinata.cloud/ipfs/';
const IPFS_TIMEOUT_MS = 10_000;

/**
 * TokenVoting 1.4 ABI (minimal)
 * Full ABI: config/aragon-abis.ts
 */
const TOKEN_VOTING_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'proposalId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
      { indexed: false, internalType: 'uint64', name: 'startDate', type: 'uint64' },
      { indexed: false, internalType: 'uint64', name: 'endDate', type: 'uint64' },
      { indexed: false, internalType: 'bytes', name: 'metadata', type: 'bytes' },
      {
        components: [
          { internalType: 'address', name: 'to', type: 'address' },
          { internalType: 'uint256', name: 'value', type: 'uint256' },
          { internalType: 'bytes', name: 'data', type: 'bytes' },
        ],
        indexed: false,
        internalType: 'struct Action[]',
        name: 'actions',
        type: 'tuple[]',
      },
      { indexed: false, internalType: 'uint256', name: 'allowFailureMap', type: 'uint256' },
    ],
    name: 'ProposalCreated',
    type: 'event',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_proposalId', type: 'uint256' }],
    name: 'getProposal',
    outputs: [
      { internalType: 'bool', name: 'open', type: 'bool' },
      { internalType: 'bool', name: 'executed', type: 'bool' },
      {
        components: [
          { internalType: 'enum MajorityVotingBase.VotingMode', name: 'votingMode', type: 'uint8' },
          { internalType: 'uint32', name: 'supportThreshold', type: 'uint32' },
          { internalType: 'uint64', name: 'startDate', type: 'uint64' },
          { internalType: 'uint64', name: 'endDate', type: 'uint64' },
          { internalType: 'uint64', name: 'snapshotTimepoint', type: 'uint64' },
          { internalType: 'uint256', name: 'minVotingPower', type: 'uint256' },
        ],
        internalType: 'struct MajorityVotingBase.ProposalParameters',
        name: 'parameters',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint256', name: 'abstain', type: 'uint256' },
          { internalType: 'uint256', name: 'yes', type: 'uint256' },
          { internalType: 'uint256', name: 'no', type: 'uint256' },
        ],
        internalType: 'struct MajorityVotingBase.Tally',
        name: 'tally',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'address', name: 'to', type: 'address' },
          { internalType: 'uint256', name: 'value', type: 'uint256' },
          { internalType: 'bytes', name: 'data', type: 'bytes' },
        ],
        internalType: 'struct Action[]',
        name: 'actions',
        type: 'tuple[]',
      },
      { internalType: 'uint256', name: 'allowFailureMap', type: 'uint256' },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'enum IPlugin.Operation', name: 'operation', type: 'uint8' },
        ],
        internalType: 'struct IPlugin.TargetConfig',
        name: 'targetConfig',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_proposalId', type: 'uint256' }],
    name: 'hasSucceeded',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minParticipation',
    outputs: [{ internalType: 'uint32', name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Rate limiting: minimum 60 seconds between syncs
const MIN_SYNC_INTERVAL_MS = 60_000;

// Ankr Public tier limit: max 1,000 blocks per getLogs request
const BLOCK_CHUNK_SIZE = BigInt(1_000);

// Max blocks to process per function invocation (to avoid timeout).
// All track plugins are queried in one getLogs call, so this is ~100 requests.
const MAX_BLOCKS_PER_CALL = BigInt(100_000);

/** Statuses that can still change on-chain and need refreshing */
const NON_FINAL_STATUSES = ['PENDING', 'ACTIVE', 'SUCCEEDED'];

interface ProposalData {
  proposal_id: string;  // Aragon uses 256-bit hash IDs, stored as string
  plugin_address: string;
  plugin_type: 'TOKEN_VOTING';
  display_index: number;
  title: string;
  description: string;
  status: string;
  start_date: string;
  end_date: string;
  executed_at: string | null;
  tally_yes: string;
  tally_no: string;
  tally_abstain: string;
  total_voting_power: string;
  support_threshold: number;
  min_participation: number;
  min_duration: number;
  approvals: number;
  min_approvals: number;
  current_stage: number;
  is_canceled: boolean;
  is_open: boolean;
  actions: Array<{ to: string; value: string; data: string }>;
  block_number: number;
  transaction_hash: string;
  creator: string;  // Wallet address that created the proposal
}

interface OnChainProposal {
  open: boolean;
  executed: boolean;
  supportThreshold: number;
  tally: { abstain: bigint; yes: bigint; no: bigint };
  actions: Array<{ to: string; value: bigint; data: string }>;
}

interface ProposalMetadata {
  title: string | null;
  description: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check sync state and rate limiting
    const { data: syncState, error: syncError } = await supabase
      .from('sync_state')
      .select('*')
      .eq('id', 'default')
      .single();

    if (syncError) {
      console.error('Failed to get sync state:', syncError);
      return new Response(JSON.stringify({ error: 'Failed to get sync state' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if sync is already in progress
    if (syncState.sync_in_progress) {
      return new Response(JSON.stringify({ message: 'Sync already in progress', skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting check
    const lastSyncAt = syncState.last_sync_at ? new Date(syncState.last_sync_at).getTime() : 0;
    const now = Date.now();
    if (now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
      const waitTime = Math.ceil((MIN_SYNC_INTERVAL_MS - (now - lastSyncAt)) / 1000);
      return new Response(
        JSON.stringify({
          message: `Rate limited. Try again in ${waitTime} seconds`,
          skipped: true,
          retryAfter: waitTime,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': waitTime.toString(),
          },
        },
      );
    }

    // Mark sync as in progress
    await supabase
      .from('sync_state')
      .update({ sync_in_progress: true, error_message: null })
      .eq('id', 'default');

    // Initialize viem client
    const publicClient = createPublicClient({
      chain: chiliz,
      transport: http('https://rpc.ankr.com/chiliz'),
    });

    // Get the latest block number
    const latestBlock = await publicClient.getBlockNumber();
    console.log('Latest block:', latestBlock);

    // Query from last synced block; nothing to find before the plugins existed
    const storedBlock = BigInt(syncState.last_synced_block);
    const startBlock = storedBlock < FIRST_INDEXED_BLOCK ? FIRST_INDEXED_BLOCK : storedBlock;

    // Limit blocks per invocation to avoid timeout
    const targetBlock =
      startBlock + MAX_BLOCKS_PER_CALL > latestBlock ? latestBlock : startBlock + MAX_BLOCKS_PER_CALL;

    console.log(`Syncing from block ${startBlock} to ${targetBlock} (latest: ${latestBlock})`);

    const proposalCreatedEvent = getAbiItem({
      abi: TOKEN_VOTING_ABI,
      name: 'ProposalCreated',
    });

    const allLogs: Array<any> = [];
    let currentBlock = startBlock;
    let errorCount = 0;
    const maxErrors = 10;

    // Query logs in chunks of 1000 blocks (Ankr Public tier limit)
    while (currentBlock < targetBlock && errorCount < maxErrors) {
      const toBlock =
        currentBlock + BLOCK_CHUNK_SIZE > targetBlock ? targetBlock : currentBlock + BLOCK_CHUNK_SIZE;

      try {
        // One request covers every track plugin
        const logs = await publicClient.getLogs({
          address: [...TRACK_PLUGIN_ADDRESSES],
          event: proposalCreatedEvent,
          fromBlock: currentBlock,
          toBlock,
          strict: true,
        });

        if (logs.length > 0) {
          console.log(`Found ${logs.length} ProposalCreated events in blocks ${currentBlock}-${toBlock}`);
          allLogs.push(...logs);
        }

        errorCount = 0; // Reset on success
      } catch (e: any) {
        console.error(`Error querying blocks ${currentBlock}-${toBlock}:`, e.message || e);
        errorCount++;

        // Add delay before retry on error
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue; // Retry same block range
      }

      currentBlock = toBlock + BigInt(1);

      // Small delay between requests to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(`Found ${allLogs.length} ProposalCreated events`);

    // Oldest first, so display indexes follow creation order (PAT-1, PAT-2, ...)
    allLogs.sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber),
    );

    const nextDisplayIndex = await loadNextDisplayIndexes(supabase);
    const minParticipationByPlugin = await loadMinParticipation(publicClient);

    // Process new proposals
    const newProposals: Array<ProposalData> = [];
    // First proposal that could not be read: indexing stops there so the
    // next run retries it, instead of skipping it for good and shifting the
    // display indexes of every later proposal on the same track
    let failedProposal: { proposalId: string; blockNumber: bigint; reason: string } | null = null;

    for (const log of allLogs) {
      const pluginAddress = (log.address as string).toLowerCase();
      // Keep proposalId as BigInt for contract calls, string for storage
      const proposalIdBigInt = log.args.proposalId as bigint;
      const proposalId = proposalIdBigInt.toString();  // String for DB storage (256-bit hash)
      const eventStartDate = Number(log.args.startDate);
      const eventEndDate = Number(log.args.endDate);
      const eventMetadata = log.args.metadata as string;
      const eventActions = log.args.actions as Array<{ to: string; value: bigint; data: string }>;

      // Check if proposal already exists
      const { data: existing } = await supabase
        .from('proposals')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('plugin_address', pluginAddress)
        .maybeSingle();

      if (existing) {
        console.log(`Proposal ${proposalId} already exists, skipping`);
        continue;
      }

      try {
        const onChain = await readProposal(publicClient, log.address, proposalIdBigInt);
        const succeeded = await readHasSucceeded(publicClient, log.address, proposalIdBigInt);
        const status = deriveStatus(onChain, succeeded, eventStartDate);

        const metadata = await decodeMetadata(eventMetadata);
        const title = metadata.title || `Proposal #${nextDisplayIndex[pluginAddress]}`;
        const description = metadata.description || `Governance proposal with ${eventActions.length} action(s)`;

        const proposalData: ProposalData = {
          proposal_id: proposalId,
          plugin_address: pluginAddress,
          plugin_type: 'TOKEN_VOTING',
          display_index: nextDisplayIndex[pluginAddress]++,
          title,
          description,
          status,
          start_date: new Date(eventStartDate * 1000).toISOString(),
          end_date: new Date(eventEndDate * 1000).toISOString(),
          executed_at: onChain.executed ? new Date().toISOString() : null,
          tally_yes: onChain.tally.yes.toString(),
          tally_no: onChain.tally.no.toString(),
          tally_abstain: onChain.tally.abstain.toString(),
          total_voting_power: '0',
          support_threshold: onChain.supportThreshold,
          min_participation: minParticipationByPlugin[pluginAddress] ?? 0,
          min_duration: eventEndDate - eventStartDate,
          // No multisig stage on the MainDao: proposals go straight to the community vote
          approvals: 0,
          min_approvals: 0,
          current_stage: 0,
          is_canceled: false,
          is_open: onChain.open,
          actions: onChain.actions.map((action) => ({
            to: action.to,
            value: action.value.toString(),
            data: action.data,
          })),
          block_number: Number(log.blockNumber),
          transaction_hash: log.transactionHash,
          creator: (log.args.creator as string).toLowerCase(),
        };

        newProposals.push(proposalData);
        console.log(`Proposal ${proposalId} on ${pluginAddress} processed (Status: ${status})`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.error(`Failed to process proposal ${proposalId}, stopping here to retry next run:`, reason);
        failedProposal = { proposalId, blockNumber: log.blockNumber as bigint, reason };
        break;
      }
    }

    // Insert new proposals
    if (newProposals.length > 0) {
      const { error: insertError } = await supabase.from('proposals').insert(newProposals);

      if (insertError) {
        console.error('Failed to insert proposals:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${newProposals.length} new proposals`);

      // Notify only for proposals people can still act on: a backfill of
      // finished proposals must not push a burst of stale notifications
      const notifiable = newProposals.filter(
        (proposal) => proposal.status === 'ACTIVE' || proposal.status === 'PENDING',
      );
      for (const proposal of notifiable) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              type: 'new_proposal',
              proposalId: proposal.proposal_id,
              title: proposal.title,
            }),
          });
        } catch (e) {
          console.error(`Failed to send notification for proposal ${proposal.proposal_id}:`, e);
        }
      }
    }

    // Refresh proposals whose outcome can still change (tallies, execution)
    const { data: openProposals } = await supabase
      .from('proposals')
      .select('proposal_id, plugin_address, start_date')
      .in('plugin_address', TRACK_PLUGIN_ADDRESSES_LOWER)
      .in('status', NON_FINAL_STATUSES);

    let updatedCount = 0;
    for (const prop of openProposals ?? []) {
      try {
        const proposalIdBigInt = BigInt(prop.proposal_id);
        const onChain = await readProposal(publicClient, prop.plugin_address, proposalIdBigInt);
        const succeeded = await readHasSucceeded(publicClient, prop.plugin_address, proposalIdBigInt);
        const startDate = Math.floor(new Date(prop.start_date).getTime() / 1000);
        const status = deriveStatus(onChain, succeeded, startDate);

        await supabase
          .from('proposals')
          .update({
            status,
            tally_yes: onChain.tally.yes.toString(),
            tally_no: onChain.tally.no.toString(),
            tally_abstain: onChain.tally.abstain.toString(),
            is_open: onChain.open,
            executed_at: onChain.executed ? new Date().toISOString() : null,
          })
          .eq('proposal_id', prop.proposal_id)
          .eq('plugin_address', prop.plugin_address);

        updatedCount++;
      } catch (e) {
        console.error(`Failed to update proposal ${prop.proposal_id}:`, e);
      }
    }

    // Update sync state with where we actually got to. If a proposal failed,
    // stop just before its block: the next run starts there again (proposals
    // already stored in that block are skipped by the "already exists" check).
    const scannedToBlock = currentBlock > startBlock ? currentBlock - BigInt(1) : startBlock;
    const syncedToBlock = failedProposal ? failedProposal.blockNumber - BigInt(1) : scannedToBlock;
    const needsMoreSync = syncedToBlock < latestBlock;

    await supabase
      .from('sync_state')
      .update({
        last_synced_block: Number(syncedToBlock),
        last_sync_at: new Date().toISOString(),
        sync_in_progress: false,
        error_message: failedProposal
          ? `Proposal ${failedProposal.proposalId} at block ${failedProposal.blockNumber} not indexed yet: ${failedProposal.reason}`.slice(0, 500)
          : null,
      })
      .eq('id', 'default');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced to block ${syncedToBlock}`,
        newProposals: newProposals.length,
        updatedProposals: updatedCount,
        retryProposalId: failedProposal?.proposalId ?? null,
        needsMoreSync,
        latestBlock: Number(latestBlock),
        blocksRemaining: Number(latestBlock - syncedToBlock),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    // Get detailed error message
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object'
        ? JSON.stringify(error)
        : String(error);
    console.error('Sync error:', errorMessage, error);

    // Try to update sync state with error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase
        .from('sync_state')
        .update({
          sync_in_progress: false,
          error_message: errorMessage.slice(0, 500),  // Truncate for DB
        })
        .eq('id', 'default');
    } catch (e) {
      console.error('Failed to update sync state with error:', e);
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
});

/**
 * Read a proposal from its track plugin
 */
async function readProposal(
  publicClient: any,
  pluginAddress: string,
  proposalId: bigint,
): Promise<OnChainProposal> {
  const result = await publicClient.readContract({
    address: pluginAddress,
    abi: TOKEN_VOTING_ABI,
    functionName: 'getProposal',
    args: [proposalId],
  });

  return {
    open: result[0],
    executed: result[1],
    supportThreshold: Number(result[2].supportThreshold),
    tally: result[3],
    actions: result[4] ?? [],
  };
}

/**
 * Whether the vote passed (support threshold and participation both met).
 * Only meaningful once the vote has closed.
 *
 * Errors are thrown, not mapped to false: a false here stores DEFEATED,
 * which is final and never refreshed, so a flaky RPC call would mark a
 * passed vote as defeated for good. Callers retry on the next run.
 */
async function readHasSucceeded(
  publicClient: any,
  pluginAddress: string,
  proposalId: bigint,
): Promise<boolean> {
  return await publicClient.readContract({
    address: pluginAddress,
    abi: TOKEN_VOTING_ABI,
    functionName: 'hasSucceeded',
    args: [proposalId],
  });
}

/**
 * Map on-chain state to the stored status.
 * Uses hasSucceeded rather than yes > no so quorum is respected.
 */
function deriveStatus(proposal: OnChainProposal, succeeded: boolean, startDate: number): string {
  if (proposal.executed) {
    return 'EXECUTED';
  }
  if (proposal.open) {
    return 'ACTIVE';
  }
  if (Date.now() < startDate * 1000) {
    return 'PENDING';
  }
  return succeeded ? 'SUCCEEDED' : 'DEFEATED';
}

/**
 * Next display index per plugin (1-based, like Aragon's PAT-1, PAT-2, ...)
 */
async function loadNextDisplayIndexes(supabase: any): Promise<Record<string, number>> {
  const next: Record<string, number> = {};
  for (const address of TRACK_PLUGIN_ADDRESSES_LOWER) {
    const { count } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('plugin_address', address);
    next[address] = (count ?? 0) + 1;
  }
  return next;
}

/**
 * minParticipation is a plugin setting (not stored on the proposal), read once per sync
 */
async function loadMinParticipation(publicClient: any): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const address of TRACK_PLUGIN_ADDRESSES) {
    try {
      const value = await publicClient.readContract({
        address,
        abi: TOKEN_VOTING_ABI,
        functionName: 'minParticipation',
      });
      result[address.toLowerCase()] = Number(value);
    } catch (e) {
      console.error(`minParticipation failed for ${address}:`, e);
    }
  }
  return result;
}

/**
 * Decode proposal metadata. Aragon stores an ipfs:// URI pointing at
 * { title, summary, description (HTML), resources }; proposals created from
 * this app store the JSON inline.
 */
async function decodeMetadata(rawHex: string): Promise<ProposalMetadata> {
  if (!rawHex || rawHex.length <= 2) {
    return { title: null, description: null };
  }

  try {
    const metadataStr = sanitizeForPostgres(hexToString(rawHex as `0x${string}`)).trim();

    if (metadataStr.startsWith('ipfs://')) {
      const json = await fetchIpfsJson(metadataStr.slice('ipfs://'.length));
      return json ? fromMetadataJson(json) : { title: null, description: metadataStr };
    }

    if (metadataStr.startsWith('{')) {
      return fromMetadataJson(JSON.parse(metadataStr));
    }

    // Plain text metadata
    return { title: metadataStr.slice(0, 100) || null, description: null };
  } catch (e) {
    console.log('Could not decode metadata:', e);
    return { title: null, description: null };
  }
}

function fromMetadataJson(json: Record<string, unknown>): ProposalMetadata {
  const title = typeof json.title === 'string' ? sanitizeForPostgres(json.title).trim() : '';
  const summary = typeof json.summary === 'string' ? htmlToText(json.summary) : '';
  const body = typeof json.description === 'string' ? htmlToText(json.description) : '';
  // The app shows one description; Aragon splits it into summary + body.
  // Skip the summary when the body already opens with it.
  const parts = body.startsWith(summary) ? [body] : [summary, body];
  const description = parts.filter((part) => part.length > 0).join('\n\n');

  return {
    title: title || null,
    description: description || null,
  };
}

async function fetchIpfsJson(cid: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${IPFS_GATEWAY}${cid}`, {
      signal: AbortSignal.timeout(IPFS_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.log(`IPFS fetch for ${cid} returned ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (e) {
    console.log(`IPFS fetch for ${cid} failed:`, e);
    return null;
  }
}

/**
 * Aragon's editor saves rich text as HTML. The app renders plain text, so
 * keep paragraph and list structure as line breaks and drop the markup.
 */
function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitizeForPostgres(text);
}

/**
 * Sanitize string for PostgreSQL text storage
 * Removes null bytes and other invalid Unicode characters
 */
function sanitizeForPostgres(str: string): string {
  return str.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
