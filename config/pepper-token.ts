/**
 * Pepper token configuration and domain interfaces.
 *
 * Centralizes contract addresses and shared types used by
 * the Pepper token dashboard and related features.
 */

/**
 * Pepper ERC-20 token contract on Chiliz Chain.
 * Source: https://scan.chiliz.com/token/0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67
 */
export const PEPPER_TOKEN_ADDRESS = '0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67';

/**
 * Original Pepper token supply in whole tokens (before applying decimals).
 *
 * Some explorers derive burned amount as (originalSupply - currentTotalSupply).
 * We store the original supply as an integer token amount (no decimals) and
 * convert on the fly when comparing with on-chain totalSupply.
 *
 * Human-readable: 8,888,888,888,000,000 PEPPER
 */
export const PEPPER_ORIGINAL_SUPPLY = BigInt(
  '8888888888000000',
);

/**
 * Main DAO Treasury: the PEPPER MainDao contract itself holds the funds
 * the community votes on (Aragon DAO 0x26Ed…9213).
 */
export const MAIN_DAO_TREASURY_ADDRESS = '0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213';

/**
 * DAO treasury addresses (the "Treasury" card: balances, 24h delta, activity).
 *
 * This array is intentionally designed to support multiple
 * addresses so new vaults can be added without changing
 * the data fetching logic.
 */
export const DAO_TREASURY_ADDRESSES: Array<string> = [
  MAIN_DAO_TREASURY_ADDRESS,
];

/**
 * Canonical burn and staking sources will be populated in a
 * follow-up once the DAO confirms the relevant addresses.
 * For now, these are left empty but exported so that the
 * aggregation logic can depend on a stable shape.
 */
export const PEPPER_BURN_ADDRESSES: Array<string> = [];

export const PEPPER_STAKING_CONTRACT_ADDRESSES: Array<string> = [
  '0x5cA4C88339D89B2547a001003Cca84F62F557A72', // This is the staking contract address
];

/** Staking contract shown in the dashboard's Staked info sheet */
export const PEPPER_STAKING_CONTRACT_ADDRESS = PEPPER_STAKING_CONTRACT_ADDRESSES[0];

/**
 * Pepper Treasury wallet: holds the funds shown on peppercoin.com.
 * (Previously shown in the app as the "CEX Fund".)
 */
export const PEPPER_TREASURY_WALLET_ADDRESS = '0x0ECAB88E26f7eA29D0DcB4aBcF060A5Ae09a1C2B';

/** Wallet the daily PEPPER buyback runs from */
export const BUYBACK_WALLET_ADDRESS = '0xd8f2CAD881757Fe40FC617edad2699CC7fC715bC';

/**
 * Core Pepper token metrics used by the home dashboard.
 *
 * All numeric quantities are expressed in raw token units
 * (i.e. before applying decimals) to avoid precision loss.
 */
export interface PepperTokenMetrics {
  totalSupply: bigint;
  burnedAmount: bigint;
  stakedAmount: bigint;
  treasuryBalance: bigint;
  treasuryChzBalance: bigint;
  treasuryChzDelta: bigint | null;
  /** CHZ held by the Pepper Treasury wallet */
  pepperTreasuryChzBalance: bigint;
  /** CHZ held by the daily buyback wallet */
  buybackChzBalance: bigint;
  circulatingSupply: bigint;
  decimals: number;
  updatedAt: string;
  hasBurnData: boolean;
  hasStakedData: boolean;
}

/**
 * Optional segmentation of treasury holdings, modelled after
 * the Treasury Snapshot specification. This is not strictly
 * required for the initial dashboard but keeps the domain
 * model ready for future segmented views.
 */
export interface PepperTreasurySegment {
  id: string;
  label: string;
  addresses: Array<string>;
}


