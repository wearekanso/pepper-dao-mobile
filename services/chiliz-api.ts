import { createPublicClient, http } from 'viem';

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

async function fetchAccountChz24hDelta(address: string): Promise<bigint> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sinceSeconds = nowSeconds - 60 * 60 * 24;

  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });

  if (CHILIZSCAN_API_KEY) {
    params.append('apikey', CHILIZSCAN_API_KEY);
  }

  const response = await fetch(`${CHILIZSCAN_API_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(
      `[ChilizAPI] Failed to fetch transactions for ${address}: ${response.status}`,
    );
  }

  const json = (await response.json()) as ChilizScanResponse<
    Array<ChilizScanTx> | string
  >;

  if (!Array.isArray(json.result)) {
    return BigInt(0);
  }

  const addressLower = address.toLowerCase();

  return json.result.reduce<bigint>((total, tx) => {
    const timestamp = Number(tx.timeStamp);

    if (Number.isNaN(timestamp) || timestamp < sinceSeconds) {
      return total;
    }

    if (tx.isError === '1') {
      return total;
    }

    const value = BigInt(tx.value);
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();

    if (toLower === addressLower) {
      return total + value;
    }

    if (fromLower === addressLower) {
      return total - value;
    }

    return total;
  }, BigInt(0));
}

export interface TreasuryChzTx {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  timestamp: number;
  direction: 'in' | 'out';
}

export async function fetchTreasuryChzTxs(
  window: TreasuryWindow,
): Promise<Array<TreasuryChzTx>> {
  const sinceSeconds = getSinceSecondsForWindow(window);

  const allTxs: Array<TreasuryChzTx> = [];

  for (const address of DAO_TREASURY_ADDRESSES) {
    // Use Etherscan-compatible RPC API format (Blockscout standard)
    const params = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: '0',
      endblock: '99999999',
      sort: 'desc',
    });

    if (CHILIZSCAN_API_KEY) {
      params.append('apikey', CHILIZSCAN_API_KEY);
    }

    const url = `${CHILIZSCAN_API_URL}?${params.toString()}`;

    console.log('[ChilizAPI] fetchTreasuryChzTxs request', {
      address,
      url,
    });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(
          '[ChilizAPI] fetchTreasuryChzTxs non-200 response',
          response.status,
        );
        continue;
      }

      const json = (await response.json()) as ChilizScanResponse<
        Array<ChilizScanTx> | string
      >;

      console.log('[ChilizAPI] fetchTreasuryChzTxs raw response', {
        status: json.status,
        message: json.message,
        resultType: typeof json.result,
        isArray: Array.isArray(json.result),
      });

      if (!Array.isArray(json.result)) {
        console.warn(
          '[ChilizAPI] fetchTreasuryChzTxs unexpected result shape',
          json.message,
        );
        continue;
      }

      const addressLower = address.toLowerCase();

      const filtered = json.result
        .filter((tx) => {
          const timestamp = Number(tx.timeStamp);

          if (Number.isNaN(timestamp)) {
            return false;
          }

          if (sinceSeconds > 0 && timestamp < sinceSeconds) {
            return false;
          }

          if (tx.isError === '1') {
            return false;
          }

          const fromLower = tx.from.toLowerCase();
          const toLower = tx.to.toLowerCase();

          return fromLower === addressLower || toLower === addressLower;
        })
        .map<TreasuryChzTx>((tx) => {
          const value = BigInt(tx.value);
          const timestamp = Number(tx.timeStamp);
          const toLower = tx.to.toLowerCase();
          const direction: 'in' | 'out' =
            toLower === addressLower ? 'in' : 'out';

          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value,
            timestamp,
            direction,
          };
        });

      console.log('[ChilizAPI] fetchTreasuryChzTxs response', {
        address,
        count: filtered.length,
      });

      allTxs.push(...filtered);
    } catch (error) {
      console.error('[ChilizAPI] fetchTreasuryChzTxs error', {
        address,
        error,
      });
      continue;
    }
  }

  allTxs.sort((a, b) => b.timestamp - a.timestamp);

  return allTxs;
}

export async function fetchTreasuryChzTxs24h(): Promise<Array<TreasuryChzTx>> {
  return fetchTreasuryChzTxs('24h');
}

export async function fetchTreasuryChz24hDelta(): Promise<bigint | null> {
  try {
    let totalDelta = BigInt(0);

    for (const address of DAO_TREASURY_ADDRESSES) {
      // const delta = await fetchAccountChz24hDelta(address);
      // totalDelta += delta;
    }

    return totalDelta;
  } catch (error) {
    console.error('[ChilizAPI] Failed to fetch treasury 24h CHZ delta', error);
    return null;
  }
}


