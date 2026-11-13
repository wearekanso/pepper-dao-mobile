import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  BUYBACK_WALLET_ADDRESS,
  PEPPER_BURN_ADDRESSES,
  PEPPER_STAKING_CONTRACT_ADDRESSES,
  PEPPER_TREASURY_WALLET_ADDRESS,
  PepperTokenMetrics,
} from '@/config/pepper-token';
import { telemetry } from '@/lib/telemetry';
import {
  fetchNativeBalances,
  fetchPepperBalances,
  fetchPepperTokenMetadata,
  fetchPepperTreasuryBalances,
  fetchTreasuryChz24hDelta,
  fetchTreasuryChzBalances,
  type NativeAddressBalance,
  type PepperAddressBalance,
} from '@/services/chiliz-api';

export function sumBalances<T extends { balance: bigint }>(
  balances: Array<T>,
): bigint {
  return balances.reduce<bigint>((sum, item) => {
    return sum + item.balance;
  }, BigInt(0));
}

export function calculateCirculatingSupply(
  totalSupply: bigint,
  burnedAmount: bigint,
  stakedAmount: bigint,
  treasuryBalance: bigint,
): bigint {
  const circulating = totalSupply - burnedAmount - stakedAmount - treasuryBalance;

  if (circulating < BigInt(0)) {
    return BigInt(0);
  }

  return circulating;
}

async function loadPepperTokenMetrics(): Promise<PepperTokenMetrics> {
  const [
    metadata,
    treasuryBalances,
    burnBalances,
    stakingBalances,
    treasuryChzBalances,
    treasuryChzDelta,
    pepperTreasuryChzBalances,
    buybackChzBalances,
  ] = await Promise.all([
    fetchPepperTokenMetadata(),
    fetchPepperTreasuryBalances(),
    fetchPepperBalances(PEPPER_BURN_ADDRESSES),
    fetchPepperBalances(PEPPER_STAKING_CONTRACT_ADDRESSES),
    fetchTreasuryChzBalances(),
    fetchTreasuryChz24hDelta(),
    fetchNativeBalances([PEPPER_TREASURY_WALLET_ADDRESS]),
    fetchNativeBalances([BUYBACK_WALLET_ADDRESS]),
  ]);

  const treasuryBalance = sumBalances<PepperAddressBalance>(treasuryBalances);
  const burnedAmount = sumBalances<PepperAddressBalance>(burnBalances);
  const stakedAmount = sumBalances<PepperAddressBalance>(stakingBalances);
  const treasuryChzBalance = sumBalances<NativeAddressBalance>(
    treasuryChzBalances,
  );
  const pepperTreasuryChzBalance = sumBalances<NativeAddressBalance>(
    pepperTreasuryChzBalances,
  );
  const buybackChzBalance = sumBalances<NativeAddressBalance>(
    buybackChzBalances,
  );

  const circulatingSupply = calculateCirculatingSupply(
    metadata.totalSupply,
    burnedAmount,
    stakedAmount,
    treasuryBalance,
  );

  return {
    totalSupply: metadata.totalSupply,
    burnedAmount,
    stakedAmount,
    treasuryBalance,
    treasuryChzBalance,
    treasuryChzDelta,
    pepperTreasuryChzBalance,
    buybackChzBalance,
    circulatingSupply,
    decimals: metadata.decimals,
    updatedAt: new Date().toISOString(),
    hasBurnData: PEPPER_BURN_ADDRESSES.length > 0,
    hasStakedData: PEPPER_STAKING_CONTRACT_ADDRESSES.length > 0,
  };
}

interface UsePepperTokenMetricsResult {
  metrics?: PepperTokenMetrics;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  lastUpdated: string | null;
  refetch: () => void;
}

export function usePepperTokenMetrics(): UsePepperTokenMetricsResult {
  const query = useQuery<PepperTokenMetrics, Error>({
    queryKey: ['pepper', 'token-metrics'],
    queryFn: loadPepperTokenMetrics,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    telemetry.trackPepperMetricsRefreshed(query.data.updatedAt);
  }, [query.data]);

  useEffect(() => {
    if (!query.error) {
      return;
    }

    telemetry.trackPepperMetricsError(query.error.message);
  }, [query.error]);

  return {
    metrics: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: () => {
      void query.refetch();
    },
    isFetching: query.isFetching,
    lastUpdated: query.data?.updatedAt ?? null,
  };
}


