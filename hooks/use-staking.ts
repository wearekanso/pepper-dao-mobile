/**
 * Staking Hook
 *
 * React hook for PEPPER token staking operations.
 * Integrates with Reown AppKit for wallet provider access and
 * uses react-query for data fetching and caching.
 */

import { useProvider } from '@reown/appkit-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ACTIVE_CHAIN_ID } from '@/config/chains';
import { STAKING_DEPOSITS_ENABLED } from '@/config/features';
import { type StakingData, type TransactionStatus } from '@/config/staking';
import { useWallet } from '@/contexts/wallet-context';
import { telemetry } from '@/lib/telemetry';
import {
  approveTokens,
  claimRewards,
  fetchStakingData,
  formatTokenAmount,
  hasAllowance,
  hasStakedBalance,
  hasWalletBalance,
  stakeTokens,
  unstakeTokens,
} from '@/services/staking-api';

import { ProtectedActionError, useProtectedAction } from './use-protected-action';

/**
 * Staking operation result
 */
interface StakingOperationResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Staking hook return type
 */
interface UseStakingReturn {
  // Data
  stakingData: StakingData | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;

  // Formatted balances
  formattedWalletBalance: string;
  formattedStakedBalance: string;
  formattedEarnedRewards: string;
  formattedAllowance: string;
  formattedTotalStaked: string;

  // Transaction state
  txStatus: TransactionStatus;
  txError: string | null;

  // Validation
  canStake: (amount: string) => boolean;
  canUnstake: (amount: string) => boolean;
  canClaim: () => boolean;
  needsApproval: (amount: string) => boolean;

  // Actions
  approve: (amount: string, useMax?: boolean) => Promise<StakingOperationResult>;
  stake: (amount: string) => Promise<StakingOperationResult>;
  unstake: (amount: string) => Promise<StakingOperationResult>;
  claim: () => Promise<StakingOperationResult>;

  // Utilities
  refetch: () => void;
  isReady: boolean;
}

/**
 * Query key for staking data
 */
function getStakingQueryKey(address: string | undefined) {
  return ['staking', address, ACTIVE_CHAIN_ID] as const;
}

/**
 * Hook for PEPPER token staking operations
 */
export function useStaking(): UseStakingReturn {
  // Use wallet context for address/connection state (consistent with rest of app)
  const { address, isConnected } = useWallet();
  // Use AppKit's useProvider for the wallet provider
  const { provider: walletProvider } = useProvider();
  const { executeProtected, isReady } = useProtectedAction();
  const queryClient = useQueryClient();

  // Transaction state
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);

  // Fetch staking data
  const {
    data: stakingData,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: getStakingQueryKey(address),
    queryFn: () => fetchStakingData(address!),
    enabled: !!address && isConnected,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  });

  // Format balances for display
  const formattedWalletBalance = stakingData
    ? formatTokenAmount(stakingData.walletBalance, stakingData.decimals)
    : '0';
  const formattedStakedBalance = stakingData
    ? formatTokenAmount(stakingData.stakedBalance, stakingData.decimals)
    : '0';
  const formattedEarnedRewards = stakingData
    ? formatTokenAmount(stakingData.earnedRewards, stakingData.decimals)
    : '0';
  const formattedAllowance = stakingData
    ? formatTokenAmount(stakingData.allowance, stakingData.decimals)
    : '0';
  const formattedTotalStaked = stakingData
    ? formatTokenAmount(stakingData.totalStaked, stakingData.decimals)
    : '0';

  // Validation helpers
  const canStake = useCallback(
    (amount: string): boolean => {
      if (!stakingData || !amount || parseFloat(amount) <= 0) return false;
      return (
        hasWalletBalance(stakingData.walletBalance, amount) &&
        hasAllowance(stakingData.allowance, amount)
      );
    },
    [stakingData]
  );

  const canUnstake = useCallback(
    (amount: string): boolean => {
      if (!stakingData || !amount || parseFloat(amount) <= 0) return false;
      return hasStakedBalance(stakingData.stakedBalance, amount);
    },
    [stakingData]
  );

  const canClaim = useCallback((): boolean => {
    if (!stakingData) return false;
    return stakingData.earnedRewards > BigInt(0);
  }, [stakingData]);

  const needsApproval = useCallback(
    (amount: string): boolean => {
      if (!stakingData || !amount || parseFloat(amount) <= 0) return false;
      return !hasAllowance(stakingData.allowance, amount);
    },
    [stakingData]
  );

  // Invalidate and refetch staking data
  const invalidateStakingData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getStakingQueryKey(address) });
  }, [queryClient, address]);

  // Approve tokens
  const approve = useCallback(
    async (amount: string, useMax = false): Promise<StakingOperationResult> => {
      setTxStatus('pending');
      setTxError(null);

      try {
        const result = await executeProtected(async () => {
          if (!walletProvider) {
            throw new Error('Wallet provider not available');
          }

          telemetry.track('approve_initiated', { amount, useMax });
          
          const txResult = await approveTokens(walletProvider, amount, useMax);
          
          if (txResult.status === 'error') {
            throw new Error(txResult.error);
          }
          
          return txResult;
        });

        setTxStatus('success');
        telemetry.track('approve_success', { amount, txHash: result.txHash });
        
        // Refetch data after successful approval
        invalidateStakingData();

        return { success: true, txHash: result.txHash };
      } catch (err) {
        const errorMessage =
          err instanceof ProtectedActionError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Approval failed';
        
        setTxStatus('error');
        setTxError(errorMessage);
        telemetry.track('approve_failure', { amount, error: errorMessage });
        
        return { success: false, error: errorMessage };
      }
    },
    [executeProtected, walletProvider, invalidateStakingData]
  );

  // Stake tokens
  const stake = useCallback(
    async (amount: string): Promise<StakingOperationResult> => {
      // Safety net behind the hidden UI: never send PEPPER to the retired contract
      if (!STAKING_DEPOSITS_ENABLED) {
        setTxStatus('error');
        setTxError(STAKING_CLOSED_MESSAGE);
        return { success: false, error: STAKING_CLOSED_MESSAGE };
      }

      setTxStatus('pending');
      setTxError(null);

      try {
        const result = await executeProtected(async () => {
          if (!walletProvider) {
            throw new Error('Wallet provider not available');
          }

          telemetry.track('stake_initiated', { amount });
          
          const txResult = await stakeTokens(walletProvider, amount);
          
          if (txResult.status === 'error') {
            throw new Error(txResult.error);
          }
          
          return txResult;
        });

        setTxStatus('success');
        telemetry.track('stake_success', { amount, txHash: result.txHash });
        
        // Refetch data after successful stake
        invalidateStakingData();

        return { success: true, txHash: result.txHash };
      } catch (err) {
        const errorMessage =
          err instanceof ProtectedActionError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Stake failed';
        
        setTxStatus('error');
        setTxError(errorMessage);
        telemetry.track('stake_failure', { amount, error: errorMessage });
        
        return { success: false, error: errorMessage };
      }
    },
    [executeProtected, walletProvider, invalidateStakingData]
  );

  // Unstake tokens
  const unstake = useCallback(
    async (amount: string): Promise<StakingOperationResult> => {
      setTxStatus('pending');
      setTxError(null);

      try {
        const result = await executeProtected(async () => {
          if (!walletProvider) {
            throw new Error('Wallet provider not available');
          }

          telemetry.track('unstake_initiated', { amount });
          
          const txResult = await unstakeTokens(walletProvider, amount);
          
          if (txResult.status === 'error') {
            throw new Error(txResult.error);
          }
          
          return txResult;
        });

        setTxStatus('success');
        telemetry.track('unstake_success', { amount, txHash: result.txHash });
        
        // Refetch data after successful unstake
        invalidateStakingData();

        return { success: true, txHash: result.txHash };
      } catch (err) {
        const errorMessage =
          err instanceof ProtectedActionError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unstake failed';
        
        setTxStatus('error');
        setTxError(errorMessage);
        telemetry.track('unstake_failure', { amount, error: errorMessage });
        
        return { success: false, error: errorMessage };
      }
    },
    [executeProtected, walletProvider, invalidateStakingData]
  );

  // Claim rewards
  const claim = useCallback(async (): Promise<StakingOperationResult> => {
    setTxStatus('pending');
    setTxError(null);

    try {
      const result = await executeProtected(async () => {
        if (!walletProvider) {
          throw new Error('Wallet provider not available');
        }

        telemetry.track('claim_initiated', {});
        
        const txResult = await claimRewards(walletProvider);
        
        if (txResult.status === 'error') {
          throw new Error(txResult.error);
        }
        
        return txResult;
      });

      setTxStatus('success');
      telemetry.track('claim_success', { txHash: result.txHash });
      
      // Refetch data after successful claim
      invalidateStakingData();

      return { success: true, txHash: result.txHash };
    } catch (err) {
      const errorMessage =
        err instanceof ProtectedActionError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Claim failed';
      
      setTxStatus('error');
      setTxError(errorMessage);
      telemetry.track('claim_failure', { error: errorMessage });
      
      return { success: false, error: errorMessage };
    }
  }, [executeProtected, walletProvider, invalidateStakingData]);

  return {
    // Data
    stakingData,
    isLoading,
    isRefetching,
    error: error as Error | null,

    // Formatted balances
    formattedWalletBalance,
    formattedStakedBalance,
    formattedEarnedRewards,
    formattedAllowance,
    formattedTotalStaked,

    // Transaction state
    txStatus,
    txError,

    // Validation
    canStake,
    canUnstake,
    canClaim,
    needsApproval,

    // Actions
    approve,
    stake,
    unstake,
    claim,

    // Utilities
    refetch,
    isReady,
  };
}


const STAKING_CLOSED_MESSAGE =
  'Staking has moved to vePEPPER. Lock your PEPPER on Aragon to get voting power.';
