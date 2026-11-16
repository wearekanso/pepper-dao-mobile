/**
 * vePEPPER Hook
 *
 * Reads the connected wallet's locks, queued exits and voting power, and
 * runs the lock / exit transactions in the order the contracts need
 * (see config/vepepper.ts).
 */

import { useProvider } from '@reown/appkit-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { parseUnits } from 'viem';

import { ACTIVE_CHAIN_ID } from '@/config/chains';
import { PEPPER_DECIMALS } from '@/config/staking';
import { useWallet } from '@/contexts/wallet-context';
import { telemetry } from '@/lib/telemetry';
import {
  approveLockForExit,
  approvePepperForLock,
  beginWithdrawal,
  cancelWithdrawal,
  createLock,
  delegateToSelf,
  fetchVePepperAccount,
  readLockState,
  withdrawLock,
  type VePepperAccount,
  type VePepperLock,
  type VePepperLockState,
  type VePepperTransactionResult,
} from '@/services/vepepper-api';

import { ProtectedActionError, useProtectedAction } from './use-protected-action';

/**
 * @param options.enabled Read the account only while a screen shows it
 *   (the sheets stay mounted while closed, so this stops the minute poll)
 */
export function useVePepper(options: UseVePepperOptions = {}): UseVePepperReturn {
  const { enabled = true } = options;
  const { address, isConnected } = useWallet();
  const { provider: walletProvider } = useProvider();
  const { executeProtected, isReady } = useProtectedAction();
  const queryClient = useQueryClient();

  const [txStatus, setTxStatus] = useState<VePepperTxStatus>('idle');
  const [txStep, setTxStep] = useState<VePepperStep | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: getVePepperQueryKey(address),
    queryFn: () => fetchVePepperAccount(address as string),
    enabled: enabled && Boolean(address) && isConnected,
    staleTime: 30_000,
    // Exit fees fall every second; a minute keeps the shown fee close enough
    refetchInterval: 60_000,
  });
  const account = query.data;

  const getLockSteps = useCallback(
    (amount: bigint): Array<VePepperStep> => (account ? lockSteps(account, address, amount) : []),
    [account, address],
  );

  /**
   * Runs `steps` one wallet prompt at a time; stops at the first failure.
   * Returns the last transaction's hash.
   */
  const run = useCallback(
    async (
      name: string,
      steps: Array<{ step: VePepperStep; send: () => Promise<VePepperTransactionResult> }>,
    ): Promise<VePepperOperationResult> => {
      setTxStatus('pending');
      setTxError(null);
      telemetry.track(`vepepper_${name}_initiated`, {});

      try {
        const txHash = await executeProtected(async () => {
          let lastHash: string | undefined;
          for (const { step, send } of steps) {
            setTxStep(step);
            const result = await send();
            if (result.status === 'error') throw new Error(result.error);
            lastHash = result.txHash;
          }
          return lastHash;
        });

        setTxStatus('success');
        telemetry.track(`vepepper_${name}_success`, { txHash });
        return { success: true, txHash };
      } catch (err) {
        const message =
          err instanceof ProtectedActionError || err instanceof Error ? err.message : 'Transaction failed';
        setTxStatus('error');
        setTxError(message);
        telemetry.track(`vepepper_${name}_failure`, { error: message });
        return { success: false, error: message };
      } finally {
        setTxStep(null);
        // Earlier steps may have gone through even if a later one failed
        void queryClient.invalidateQueries({ queryKey: VEPEPPER_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ['staking'] });
        void queryClient.invalidateQueries({ queryKey: ['voting-power'] });
        void queryClient.invalidateQueries({ queryKey: ['can-vote'] });
      }
    },
    [executeProtected, queryClient],
  );

  /** Lock `amount` whole PEPPER: delegate (first lock only), approve, lock */
  const lock = useCallback(
    async (amount: string) => {
      if (!walletProvider || !account || !address) return notReady();
      const value = parseUnits(amount, PEPPER_DECIMALS);
      // The cached account may predate the last lock; decide the steps on fresh values
      let state: VePepperLockState;
      try {
        state = await readLockState(address);
      } catch {
        return { success: false, error: 'Unable to reach the Chiliz network. Please try again.' };
      }
      const steps = lockSteps({ ...account, ...state }, address, value).map((step) => ({
        step,
        send: () => {
          if (step === 'DELEGATE') return delegateToSelf(walletProvider, address);
          if (step === 'APPROVE') return approvePepperForLock(walletProvider, value);
          return createLock(walletProvider, value);
        },
      }));
      return run('lock', steps);
    },
    [walletProvider, account, address, run],
  );

  /** Delegate to self, for a wallet whose locks give no votes yet */
  const activateVotes = useCallback(() => {
    if (!walletProvider || !address) return Promise.resolve(notReady());
    return run('delegate', [{ step: 'DELEGATE', send: () => delegateToSelf(walletProvider, address) }]);
  }, [walletProvider, address, run]);

  /** Queue a lock for exit, approving its NFT to the escrow first if needed */
  const beginExit = useCallback(
    (lockToExit: VePepperLock) => {
      if (!walletProvider) return Promise.resolve(notReady());
      const steps: Array<{ step: VePepperStep; send: () => Promise<VePepperTransactionResult> }> = [];
      if (lockToExit.needsExitApproval) {
        steps.push({ step: 'APPROVE_LOCK', send: () => approveLockForExit(walletProvider, lockToExit.tokenId) });
      }
      steps.push({ step: 'EXIT', send: () => beginWithdrawal(walletProvider, lockToExit.tokenId) });
      return run('begin_exit', steps);
    },
    [walletProvider, run],
  );

  const cancelExit = useCallback(
    (tokenId: bigint) => {
      if (!walletProvider) return Promise.resolve(notReady());
      return run('cancel_exit', [{ step: 'CANCEL', send: () => cancelWithdrawal(walletProvider, tokenId) }]);
    },
    [walletProvider, run],
  );

  const withdraw = useCallback(
    (tokenId: bigint) => {
      if (!walletProvider) return Promise.resolve(notReady());
      return run('withdraw', [{ step: 'WITHDRAW', send: () => withdrawLock(walletProvider, tokenId) }]);
    },
    [walletProvider, run],
  );

  const resetTx = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return {
    account,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    txStatus,
    txStep,
    txError,
    getLockSteps,
    lock,
    activateVotes,
    beginExit,
    cancelExit,
    withdraw,
    resetTx,
    isReady,
  };
}

/** Wallet prompts a lock of `amount` needs, in order */
function lockSteps(account: VePepperAccount, address: string | undefined, amount: bigint): Array<VePepperStep> {
  const steps: Array<VePepperStep> = [];
  // Without a delegatee the new lock would give no votes. A wallet that
  // delegated to someone else keeps that choice: the lock follows it.
  if (account.delegatee === null && address) steps.push('DELEGATE');
  if (account.allowance < amount) steps.push('APPROVE');
  steps.push('LOCK');
  return steps;
}

function notReady(): VePepperOperationResult {
  return { success: false, error: 'Wallet not ready. Please reconnect and try again.' };
}

function getVePepperQueryKey(address: string | undefined) {
  return [...VEPEPPER_QUERY_KEY, address?.toLowerCase(), ACTIVE_CHAIN_ID] as const;
}

const VEPEPPER_QUERY_KEY = ['vepepper'] as const;

/** One wallet prompt in a lock or exit */
export type VePepperStep = 'DELEGATE' | 'APPROVE' | 'LOCK' | 'APPROVE_LOCK' | 'EXIT' | 'CANCEL' | 'WITHDRAW';

type VePepperTxStatus = 'idle' | 'pending' | 'success' | 'error';

interface UseVePepperOptions {
  enabled?: boolean;
}

interface VePepperOperationResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface UseVePepperReturn {
  account: VePepperAccount | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  txStatus: VePepperTxStatus;
  /** The wallet prompt in progress, while txStatus is pending */
  txStep: VePepperStep | null;
  txError: string | null;
  getLockSteps: (amount: bigint) => Array<VePepperStep>;
  lock: (amount: string) => Promise<VePepperOperationResult>;
  activateVotes: () => Promise<VePepperOperationResult>;
  beginExit: (lock: VePepperLock) => Promise<VePepperOperationResult>;
  cancelExit: (tokenId: bigint) => Promise<VePepperOperationResult>;
  withdraw: (tokenId: bigint) => Promise<VePepperOperationResult>;
  resetTx: () => void;
  isReady: boolean;
}
