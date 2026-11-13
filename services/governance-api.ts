import {
  getTrackForPlugin,
  GOVERNANCE_TRACK_PLUGIN_ADDRESSES,
  PEPPER_DAO_GOVERNANCE_CONFIG,
  TRACK_KEY_PREFIX,
  type AragonGovernanceConfig,
} from '@/config/aragon-governance';
import { supabase, triggerProposalSync } from '@/config/supabase';
import {
  generateTimeLabel,
  type GovernanceProposal,
  type GovernanceProposalFilter,
  type GovernanceProposalType,
  type GovernanceStatus,
} from '@/types/governance';
import type { Proposal } from '@/types/supabase';

/**
 * Governance API - Fetches proposals from Supabase
 *
 * The proposals table is populated by the sync-proposals Edge Function
 * which indexes ProposalCreated events from the Chiliz blockchain.
 *
 * This provides:
 * - Instant loading (< 500ms vs 10-30s from chain)
 * - Offline support (cached data)
 * - Consistent data format
 */

/**
 * Plugin addresses as stored by the indexer (lowercase). Queries are scoped
 * to them so rows from the retired DAO never reach the UI.
 */
const INDEXED_PLUGIN_ADDRESSES: Array<string> = GOVERNANCE_TRACK_PLUGIN_ADDRESSES.map((address) =>
  address.toLowerCase(),
);

/**
 * Get the governance configuration
 */
export function getGovernanceConfig(): AragonGovernanceConfig {
  return PEPPER_DAO_GOVERNANCE_CONFIG;
}

/**
 * Map plugin type to GovernanceProposalType
 */
function mapPluginType(
  pluginType: Proposal['plugin_type'],
): GovernanceProposalType {
  switch (pluginType) {
    case 'ADMIN':
      return 'ADMIN';
    case 'MULTISIG':
      return 'MULTISIG';
    // Track plugins (TokenVoting) are community votes
    case 'TOKEN_VOTING':
    case 'SPP':
      return 'PEP';
    default:
      return 'OTHER';
  }
}

/**
 * Map database status to GovernanceStatus
 */
function mapStatus(status: string): GovernanceStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'EXECUTED':
      return 'EXECUTED';
    case 'PENDING':
      return 'PENDING';
    case 'DEFEATED':
      return 'REJECTED'; // Map DEFEATED to REJECTED for UI
    case 'REJECTED':
      return 'REJECTED';
    case 'SUCCEEDED':
      return 'SUCCEEDED';
    case 'CANCELED':
      return 'REJECTED'; // Map CANCELED to REJECTED for UI purposes
    default:
      return 'ACTIVE';
  }
}

/**
 * Transform a Supabase proposal to our app's GovernanceProposal type
 */
function transformProposal(proposal: Proposal): GovernanceProposal {
  const status = mapStatus(proposal.status);
  const type = mapPluginType(proposal.plugin_type);

  // All vePEPPER at the proposal's snapshot, stored by the indexer. Unknown
  // (null / '0') means participation can't be computed, so it is left out
  // and the UI hides the turnout row rather than showing 0% or 100%.
  const totalVotingPower =
    proposal.total_voting_power && /^\d+$/.test(proposal.total_voting_power) && BigInt(proposal.total_voting_power) > 0n
      ? proposal.total_voting_power
      : undefined;

  const track = getTrackForPlugin(proposal.plugin_address);

  // Human-readable key per track like Aragon shows it (PST-2, PAT-20, PFT-1),
  // falling back to the proposal type and then the raw id
  const keyPrefix = track ? TRACK_KEY_PREFIX[track] : type;
  const displayKey = proposal.display_index !== null
    ? `${keyPrefix}-${proposal.display_index}`
    : `${keyPrefix}-${proposal.proposal_id}`;

  const transformed: GovernanceProposal = {
    id: `${proposal.plugin_address}_${proposal.proposal_id}`,
    pluginProposalId: proposal.proposal_id.toString(),
    pluginAddress: proposal.plugin_address,
    track,
    key: displayKey,
    title: proposal.title,
    description: proposal.description || '',
    status,
    type,
    proposer: proposal.creator || proposal.plugin_address,
    createdAt: proposal.created_at,
    startDate: proposal.start_date,
    endDate: proposal.end_date,
    executedAt: proposal.executed_at,
    approvals: proposal.approvals || 0,
    minApprovals: proposal.min_approvals || 0,
    approvalReached: (proposal.approvals || 0) >= (proposal.min_approvals || 0),
    actions: (proposal.actions || []).map((a) => ({
      to: a.to,
      value: a.value,
      data: a.data,
    })),
    timeLabel: null,
    tally: {
      yes: proposal.tally_yes || '0',
      no: proposal.tally_no || '0',
      abstain: proposal.tally_abstain || '0',
    },
    votingSettings: {
      supportThreshold: proposal.support_threshold || 0,
      minParticipation: proposal.min_participation || 0,
      minDuration: proposal.min_duration || 604800,
      minProposerVotingPower: '0',
    },
    totalVotingPower,
    userVote: undefined,
  };

  // Generate time label
  transformed.timeLabel = generateTimeLabel({
    status: transformed.status,
    startDate: (new Date(proposal.start_date).getTime() / 1000).toString(),
    endDate: (new Date(proposal.end_date).getTime() / 1000).toString(),
    executedAt: proposal.executed_at
      ? (new Date(proposal.executed_at).getTime() / 1000).toString()
      : null,
  });

  return transformed;
}

/**
 * Filter proposals by status
 */
function filterProposals(
  proposals: Array<GovernanceProposal>,
  filter?: GovernanceProposalFilter,
): Array<GovernanceProposal> {
  if (!filter) {
    return proposals;
  }

  return proposals.filter((proposal) => {
    const matchesStatus: boolean =
      !filter.status ||
      filter.status === 'ALL' ||
      proposal.status === filter.status;

    return matchesStatus;
  });
}

/**
 * Fetch governance proposals from Supabase
 *
 * This is the primary data source for the app.
 * Data is indexed by the sync-proposals Edge Function.
 */
export async function fetchGovernanceProposals(
  filter?: GovernanceProposalFilter,
  pagination?: { first?: number; skip?: number },
): Promise<Array<GovernanceProposal>> {
  console.log('[Governance API] Fetching proposals from Supabase');
  console.log('[Governance API] Filter:', filter);
  console.log('[Governance API] Pagination:', pagination);

  try {
    // Build the query
    let query = supabase
      .from('proposals')
      .select('*')
      .in('plugin_address', INDEXED_PLUGIN_ADDRESSES)
      .order('start_date', { ascending: false });

    // Apply status filter at database level for better performance
    if (filter?.status && filter.status !== 'ALL') {
      // Map our UI status to database status (REJECTED -> DEFEATED in DB)
      const dbStatus = filter.status === 'REJECTED' ? 'DEFEATED' : filter.status;
      query = query.eq('status', dbStatus);
    }

    // Apply pagination
    if (pagination) {
      const skip = pagination.skip ?? 0;
      const first = pagination.first ?? 50;
      query = query.range(skip, skip + first - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Governance API] Supabase error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('[Governance API] No proposals found in Supabase');
      return [];
    }

    console.log('[Governance API] Proposals from Supabase:', data.length);

    // Transform all proposals
    const proposals = data.map(transformProposal);

    // Apply additional filtering (in case of complex filters)
    const filtered = filterProposals(proposals, filter);

    console.log('[Governance API] After filtering:', filtered.length);

    return filtered;
  } catch (error) {
    console.error('[Governance API] Error fetching proposals:', error);
    throw new Error('Unable to load proposals. Please check your connection and try again.');
  }
}

/**
 * Fetch a single governance proposal by ID
 *
 * Supports two ID formats:
 * - Composite ID: "0x...pluginAddress_proposalId" (from proposal list)
 * - Plain string: "58239165..." (256-bit proposal hash as string)
 */
export async function fetchGovernanceProposalById(
  id: string | number,
): Promise<GovernanceProposal | null> {
  console.log('[Governance API] Fetching proposal by ID:', id);

  try {
    let proposalId: string;

    // Handle both formats:
    // 1. Plain string (256-bit hash): "58239165368147564883577661335437827568316383161788826404648226987043626091928"
    // 2. Composite ID (from proposal list): "0x...address_58239165..."
    // Note: proposal_id is stored as TEXT because it's a 256-bit hash (too large for JS number)
    if (typeof id === 'number') {
      proposalId = id.toString();
    } else if (/^\d+$/.test(id)) {
      // Plain numeric string - keep as string (don't convert to Number, it's too large)
      proposalId = id;
    } else {
      // Composite format: extract the proposal ID after underscore
      const match = id.match(/_(\d+)$/);
      if (!match) {
        console.log('[Governance API] Invalid proposal ID format:', id);
        return null;
      }
      proposalId = match[1]; // Keep as string
    }

    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .in('plugin_address', INDEXED_PLUGIN_ADDRESSES)
      .eq('proposal_id', proposalId)
      // No row is a normal answer (not indexed yet, or a stale link), not an error
      .maybeSingle();

    if (error) {
      console.error('[Governance API] Supabase error:', error);
      throw new Error('Unable to load this proposal. Please try again.');
    }

    if (!data) {
      console.log('[Governance API] Proposal not found:', proposalId);
      return null;
    }

    return transformProposal(data);
  } catch (error) {
    console.error('[Governance API] Error fetching proposal:', error);
    throw new Error('Unable to load this proposal. Please try again.');
  }
}

/**
 * Trigger a manual sync of proposals from the blockchain
 * Rate limited to prevent abuse (60 seconds minimum between syncs)
 */
export async function refreshProposals(): Promise<{
  success: boolean;
  message: string;
  newProposals?: number;
}> {
  console.log('[Governance API] Triggering proposal sync');
  return triggerProposalSync();
}

/**
 * Get summary statistics for governance proposals
 */
export function getGovernanceSummary(proposals: Array<GovernanceProposal>): {
  total: number;
  active: number;
  executed: number;
  mostRecentLabel: string;
} {
  if (proposals.length === 0) {
    return {
      total: 0,
      active: 0,
      executed: 0,
      mostRecentLabel: 'N/A',
    };
  }

  const total: number = proposals.length;

  const active: number = proposals.filter(
    (proposal) => proposal.status === 'ACTIVE',
  ).length;

  const executed: number = proposals.filter(
    (proposal) => proposal.status === 'EXECUTED',
  ).length;

  const mostRecent: GovernanceProposal = proposals[0];
  const label: string = mostRecent.timeLabel ?? 'Most recent';

  return {
    total,
    active,
    executed,
    mostRecentLabel: label,
  };
}

/**
 * Get sync state information
 */
export async function getSyncState(): Promise<{
  lastSyncedBlock: number;
  lastSyncAt: string | null;
  syncInProgress: boolean;
} | null> {
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error || !data) {
      return null;
    }

    return {
      lastSyncedBlock: data.last_synced_block,
      lastSyncAt: data.last_sync_at,
      syncInProgress: data.sync_in_progress || false,
    };
  } catch (error) {
    console.error('[Governance API] Error fetching sync state:', error);
    return null;
  }
}
