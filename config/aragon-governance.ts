import { CHILIZ_CHAIN_ID } from './chains';

/**
 * Governance configuration for the PEPPER MainDao (Aragon OSx 1.4).
 *
 * Aragon dashboard:
 * https://app.aragon.org/dao/chiliz-mainnet/0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213/dashboard
 *
 * Every voting track is its own TokenVoting plugin (same implementation,
 * different settings). Voting power is vePEPPER: PEPPER locked in the
 * voting escrow, exposed to the plugins through an IVotes adapter.
 */
export interface AragonGovernanceConfig {
  /** The DAO contract address on Chiliz mainnet (also the Main DAO Treasury) */
  daoAddress: `0x${string}`;
  /** Network segment used in Aragon URLs and API */
  daoNetworkKey: string;
  /** Chain ID for the network */
  chainId: number;
  /** TokenVoting plugin per voting track */
  trackPlugins: Record<GovernanceTrack, `0x${string}`>;
  /** vePEPPER IVotes adapter every track reads voting power from (timestamp clock) */
  votingToken: `0x${string}`;
  /**
   * First block worth indexing: the current track plugins were installed
   * just after this block, so no ProposalCreated event exists before it.
   */
  firstIndexedBlock: number;
}

/** Voting tracks defined by the PEPPER constitution, one plugin each */
export type GovernanceTrack = 'STANDARD' | 'AGILE' | 'FAST';

export const PEPPER_DAO_GOVERNANCE_CONFIG: AragonGovernanceConfig = {
  daoAddress: '0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213',
  daoNetworkKey: 'chiliz-mainnet',
  chainId: CHILIZ_CHAIN_ID,
  trackPlugins: {
    // Standard Track (pst): 7 days, 51% support, 10% participation
    STANDARD: '0xD17B92BD293942A071CDbF3A6e57A790c7FAAD67',
    // Agile Track (pat): 3 days, 51% support, 15% participation
    AGILE: '0xA80Bb5fc5B8CE2e84d31338579954e8e37d7f802',
    // Fast Track (pft): 48 hours, 66% support, 30% participation, early execution
    FAST: '0xf544833da4f7Eb68A50b636b3eB5895310780137',
  },
  votingToken: '0xC7D6ac37161De5928f9CC43a8cb88A71eCD12Fd2',
  firstIndexedBlock: 34_100_000,
};

/** vePEPPER voting escrow: holds every PEPPER locked for voting power */
export const VEPEPPER_ESCROW_ADDRESS = '0x7770aA967Bd18d64A23c86DFB01efFCE67919C1C';

/** The DAO on Aragon, where PEPPER is locked as vePEPPER until the in-app flow ships */
export const ARAGON_DAO_URL = `https://app.aragon.org/dao/${PEPPER_DAO_GOVERNANCE_CONFIG.daoNetworkKey}/${PEPPER_DAO_GOVERNANCE_CONFIG.daoAddress}/dashboard`;

/** Track plugin addresses, for indexing and lookups */
export const GOVERNANCE_TRACK_PLUGIN_ADDRESSES: Array<`0x${string}`> = Object.values(
  PEPPER_DAO_GOVERNANCE_CONFIG.trackPlugins,
);

/** Resolves which track a plugin address belongs to (case-insensitive) */
export function getTrackForPlugin(pluginAddress: string): GovernanceTrack | null {
  const needle = pluginAddress.toLowerCase();
  const entry = Object.entries(PEPPER_DAO_GOVERNANCE_CONFIG.trackPlugins).find(
    ([, address]) => address.toLowerCase() === needle,
  );
  return entry ? (entry[0] as GovernanceTrack) : null;
}

/** What a track is for and what it takes to pass, for the UI */
export interface GovernanceTrackRules {
  label: string;
  duration: string;
  /** YES share of yes + no needed to pass, in percent */
  supportPercent: number;
  /** Share of all vePEPPER that must vote, in percent */
  participationPercent: number;
  /** vePEPPER needed to open a proposal on the track, as shown to users */
  minProposerPower: string;
  useCase: string;
}

/**
 * Track settings as read on-chain on 2026-11-13 (supportThreshold,
 * minParticipation, minDuration, minProposerVotingPower). Eligibility is
 * still checked against the live contract; this is display copy.
 */
export const GOVERNANCE_TRACK_RULES: Record<GovernanceTrack, GovernanceTrackRules> = {
  STANDARD: {
    label: 'STANDARD',
    duration: '7 DAYS',
    supportPercent: 51,
    participationPercent: 10,
    minProposerPower: '1T',
    useCase: 'Big spending, protocol changes, elections',
  },
  AGILE: {
    label: 'AGILE',
    duration: '3 DAYS',
    supportPercent: 51,
    participationPercent: 15,
    minProposerPower: '1T',
    useCase: 'Community initiatives, small adjustments',
  },
  FAST: {
    label: 'FAST',
    duration: '48 HOURS',
    supportPercent: 66,
    participationPercent: 30,
    minProposerPower: '10T',
    useCase: 'Urgent fixes, time-critical spending',
  },
};

/** Tracks in the order they are offered */
export const GOVERNANCE_TRACKS: Array<GovernanceTrack> = ['STANDARD', 'AGILE', 'FAST'];

/** Proposal key prefix per track, matching Aragon's plugin slugs (PST-2, PAT-20, PFT-1) */
export const TRACK_KEY_PREFIX: Record<GovernanceTrack, string> = {
  STANDARD: 'PST',
  AGILE: 'PAT',
  FAST: 'PFT',
};
