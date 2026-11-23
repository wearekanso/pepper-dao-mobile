import { createPublicClient, http, type Address } from 'viem';

import { chiliz } from '../config/chains';
import {
  PEPPER_TOKEN_ADDRESS,
  DAO_TREASURY_ADDRESSES,
} from '../config/pepper-token';

export interface PepperTokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export interface PepperAddressBalance {
  address: string;
  balance: bigint;
}

export interface NativeAddressBalance {
  address: string;
  balance: bigint;
}

export interface ChilizScanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError?: string;
  /** Internal transactions only: 'call', 'delegatecall', 'create', … */
  type?: string;
}

interface ChilizScanResponse<T> {
  status: string;
  message: string;
  result: T;
}

export type TreasuryWindow = '24h' | '7d' | '30d' | '365d' | 'all';

function getSinceSecondsForWindow(window: TreasuryWindow): number {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (window === 'all') {
    return 0;
  }

  if (window === '24h') {
    return nowSeconds - 60 * 60 * 24;
  }

  if (window === '7d') {
    return nowSeconds - 60 * 60 * 24 * 7;
  }

  if (window === '30d') {
    return nowSeconds - 60 * 60 * 24 * 30;
  }

  // 365d
  return nowSeconds - 60 * 60 * 24 * 365;
}

const ERC20_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Public client for Chiliz mainnet
 * Always uses mainnet since PEPPER token and treasury contracts only exist there
 */
const publicClient = createPublicClient({
  chain: chiliz,
  transport: http(),
});

/** Chiliz Chain makes a block every 3 seconds: 24 h = 28,800 blocks */
const CHILIZ_BLOCKS_PER_DAY = BigInt(28_800);

// Chiliz uses Routescan API for Etherscan-compatible endpoints
// Chain ID 88888 = Chiliz mainnet
const CHILIZSCAN_API_URL =
  process.env.EXPO_PUBLIC_CHILIZSCAN_API_URL ??
  'https://api.routescan.io/v2/network/mainnet/evm/88888/etherscan/api';

const CHILIZSCAN_API_KEY = process.env.EXPO_PUBLIC_CHILIZSCAN_API_KEY;

/**
 * Fetch generic ERC-20 token metadata from Chiliscan.
 *
 * The exact API shape may differ between environments; this implementation
 * follows an Etherscan-compatible style and can be adapted if needed.
 */
export async function fetchTokenMetadata(
  tokenAddress: string,
): Promise<PepperTokenMetadata> {
  const [decimalsRaw, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
    }),
  ]);

  const decimals = Number(decimalsRaw);

  return {
    address: tokenAddress,
    name: 'Pepper',
    symbol: 'PEPPER',
    decimals,
    totalSupply: BigInt(totalSupply),
  };
}

/**
 * Fetch Pepper token metadata using the configured contract address.
 */
export async function fetchPepperTokenMetadata(): Promise<PepperTokenMetadata> {
  return fetchTokenMetadata(PEPPER_TOKEN_ADDRESS);
}

/**
 * Fetch the Pepper token balance for a single address.
 */
export async function fetchAddressPepperBalance(
  address: string,
): Promise<PepperAddressBalance> {
  const balance = await publicClient.readContract({
    address: PEPPER_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  return {
    address,
    balance,
  };
}

/**
 * Fetch Pepper balances for a list of addresses.
 * This is implemented as a simple Promise.all wrapper so it works even if
 * the underlying API does not support true batch calls.
 */
export async function fetchPepperBalances(
  addresses: Array<string>,
): Promise<Array<PepperAddressBalance>> {
  if (addresses.length === 0) {
    return [];
  }

  const promises = addresses.map((address) => fetchAddressPepperBalance(address));

  return Promise.all(promises);
}

export async function fetchNativeBalance(
  address: string,
): Promise<NativeAddressBalance> {
  const balance = await publicClient.getBalance({
    address: address as `0x${string}`,
  });

  return {
    address,
    balance,
  };
}

export async function fetchNativeBalances(
  addresses: Array<string>,
): Promise<Array<NativeAddressBalance>> {
  if (addresses.length === 0) {
    return [];
  }

  const promises = addresses.map((address) => fetchNativeBalance(address));

  return Promise.all(promises);
}

/**
 * Convenience helper for fetching balances of the configured DAO
 * Pepper treasury addresses.
 */
export async function fetchPepperTreasuryBalances(): Promise<
  Array<PepperAddressBalance>
> {
  return fetchPepperBalances(DAO_TREASURY_ADDRESSES);
}

export async function fetchTreasuryChzBalances(): Promise<
  Array<NativeAddressBalance>
> {
  return fetchNativeBalances(DAO_TREASURY_ADDRESSES);
}

export interface TreasuryChzTx {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  timestamp: number;
  direction: 'in' | 'out';
}

/**
 * CHZ moving in or out of the DAO treasury in `window`, newest first.
 *
 * Reads two explorer lists: `txlist` (transactions sent to or from the
 * treasury) and `txlistinternal`, because the DAO pays out through
 * execute(), so its payouts are internal `call`s that `txlist` never shows.
 * Internal `delegatecall`s are skipped: every incoming transfer lists one
 * that moves no CHZ of its own.
 */
export async function fetchTreasuryChzTxs(
  window: TreasuryWindow,
): Promise<Array<TreasuryChzTx>> {
  const sinceSeconds = getSinceSecondsForWindow(window);
  const perAddress = await Promise.all(
    DAO_TREASURY_ADDRESSES.map(async (address) => {
      const [txs, internalTxs] = await Promise.all([
        fetchExplorerTxs('txlist', address),
        fetchExplorerTxs('txlistinternal', address),
      ]);
      const payouts = internalTxs.filter((tx) => tx.type?.toLowerCase() === 'call' && tx.value !== '0');
      return [...txs, ...payouts]
        .map((tx) => toTreasuryTx(tx, address, sinceSeconds))
        .filter((tx): tx is TreasuryChzTx => tx !== null);
    }),
  );

  return perAddress.flat().sort((a, b) => b.timestamp - a.timestamp);
}

/** One explorer account list for `address`; empty (and logged) on failure */
async function fetchExplorerTxs(
  action: 'txlist' | 'txlistinternal',
  address: string,
): Promise<Array<ChilizScanTx>> {
  const params = new URLSearchParams({
    module: 'account',
    action,
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
  if (CHILIZSCAN_API_KEY) {
    params.append('apikey', CHILIZSCAN_API_KEY);
  }

  try {
    const response = await fetch(`${CHILIZSCAN_API_URL}?${params.toString()}`);
    if (!response.ok) {
      console.warn('[ChilizAPI] treasury txs non-200 response', { action, status: response.status });
      return [];
    }
    const json = (await response.json()) as ChilizScanResponse<Array<ChilizScanTx> | string>;
    // "No transactions found" comes back as an empty result, not an error
    return Array.isArray(json.result) ? json.result : [];
  } catch (error) {
    console.warn('[ChilizAPI] treasury txs request failed', { action, address, error });
    return [];
  }
}

/** The transfer as seen from the treasury, or null if it is failed, too old or not the treasury's */
function toTreasuryTx(tx: ChilizScanTx, address: string, sinceSeconds: number): TreasuryChzTx | null {
  const timestamp = Number(tx.timeStamp);
  if (Number.isNaN(timestamp) || (sinceSeconds > 0 && timestamp < sinceSeconds)) return null;
  if (tx.isError === '1') return null;

  const addressLower = address.toLowerCase();
  const isIn = tx.to.toLowerCase() === addressLower;
  if (!isIn && tx.from.toLowerCase() !== addressLower) return null;

  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: BigInt(tx.value),
    timestamp,
    direction: isIn ? 'in' : 'out',
  };
}

export async function fetchTreasuryChzTxs24h(): Promise<Array<TreasuryChzTx>> {
  return fetchTreasuryChzTxs('24h');
}

/**
 * How much the DAO treasury's CHZ balance changed over the last 24 hours.
 *
 * Read as balance now minus balance a day of blocks ago, not by summing
 * transfers: the DAO pays out through execute() (internal calls that txlist
 * does not return) and every incoming transfer also shows a delegatecall
 * entry that moves nothing, so transfer lists give the wrong sign or miss
 * payouts. Both public RPCs answer balance reads at past blocks.
 */
export async function fetchTreasuryChz24hDelta(): Promise<bigint | null> {
  try {
    const latestBlock = await publicClient.getBlockNumber();
    const dayAgoBlock = latestBlock > CHILIZ_BLOCKS_PER_DAY ? latestBlock - CHILIZ_BLOCKS_PER_DAY : BigInt(0);

    const deltas = await Promise.all(
      DAO_TREASURY_ADDRESSES.map(async (address) => {
        const [now, dayAgo] = await Promise.all([
          publicClient.getBalance({ address: address as Address, blockNumber: latestBlock }),
          publicClient.getBalance({ address: address as Address, blockNumber: dayAgoBlock }),
        ]);
        return now - dayAgo;
      }),
    );

    return deltas.reduce((total, delta) => total + delta, BigInt(0));
  } catch (error) {
    console.error('[ChilizAPI] Failed to fetch treasury 24h CHZ delta', error);
    return null;
  }
}


