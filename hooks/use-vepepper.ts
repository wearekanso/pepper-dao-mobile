/**
 * vePEPPER Hook
 *
 * Reads the connected wallet's locks, queued exits and voting power, and
 * runs the lock / exit transactions in the order the contracts need
 * (see config/vepepper.ts).
 */

import { useProvider } from '@reown/appkit-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
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
  fetchVePepperVotes,
  readLockState,
  withdrawLock,
  type VePepperAccount,
  type VePepperLock,
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
  // State updates land a render later; the ref stops a double tap in between
  const isRunningRef = useRef(false);

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
   * Runs the steps `buildSteps` returns, one wallet prompt at a time, and
   * stops at the first failure. The sheet is pending from the first moment,
   * including while buildSteps reads the chain, and every failure (wallet
   * not ready, RPC down, rejected prompt) ends up in txError.
   */
  const run = useCallback(
    async (name: string, buildSteps: () => Promise<Array<TxStep>> | Array<TxStep>): Promise<VePepperOperationResult> => {
      if (isRunningRef.current) return { success: false, error: 'A transaction is already in progress' };
      isRunningRef.current = true;
      setTxStatus('pending');
      setTxError(null);
      telemetry.track(`vepepper_${name}_initiated`, {});

      try {
        const txHash = await executeProtected(async () => {
          const steps = await buildSteps();
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
        isRunningRef.current = false;
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
    (amount: string) =>
      run('lock', async () => {
        if (!walletProvider || !account || !address) throw new Error(WALLET_NOT_READY);
        const value = parseUnits(amount, PEPPER_DECIMALS);
        // The cached account may predate the last lock; decide the steps on fresh values
        const state = await readLockState(address).catch(() => {
          throw new Error('Unable to reach the Chiliz network. Please try again.');
        });
        return lockSteps({ ...account, ...state }, address, value).map((step) => ({
          step,
          send: () => {
            if (step === 'DELEGATE') return delegateToSelf(walletProvider, address);
            if (step === 'APPROVE') return approvePepperForLock(walletProvider, value);
            return createLock(walletProvider, value);
          },
        }));
      }),
    [walletProvider, account, address, run],
  );

  /** Delegate to self, for a wallet whose locks give no votes yet */
  const activateVotes = useCallback(
    () =>
      run('delegate', () => {
        if (!walletProvider || !address) throw new Error(WALLET_NOT_READY);
        return [{ step: 'DELEGATE', send: () => delegateToSelf(walletProvider, address) }];
      }),
    [walletProvider, address, run],
  );

  /** Queue a lock for exit, approving its NFT to the escrow first if needed */
  const beginExit = useCallback(
    (lockToExit: VePepperLock) =>
      run('begin_exit', () => {
        if (!walletProvider) throw new Error(WALLET_NOT_READY);
        const steps: Array<TxStep> = [];
        if (lockToExit.needsExitApproval) {
          steps.push({ step: 'APPROVE_LOCK', send: () => approveLockForExit(walletProvider, lockToExit.tokenId) });
        }
        steps.push({ step: 'EXIT', send: () => beginWithdrawal(walletProvider, lockToExit.tokenId) });
        return steps;
      }),
    [walletProvider, run],
  );

  const cancelExit = useCallback(
    (tokenId: bigint) =>
      run('cancel_exit', () => {
        if (!walletProvider) throw new Error(WALLET_NOT_READY);
        return [{ step: 'CANCEL', send: () => cancelWithdrawal(walletProvider, tokenId) }];
      }),
    [walletProvider, run],
  );

  const withdraw = useCallback(
    (tokenId: bigint) =>
      run('withdraw', () => {
        if (!walletProvider) throw new Error(WALLET_NOT_READY);
        return [{ step: 'WITHDRAW', send: () => withdrawLock(walletProvider, tokenId) }];
      }),
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

/**
 * Just the wallet's vePEPPER votes, for screens that show the number only
 * (one getVotes call instead of the full account read with its exit scan)
 */
export function useVePepperVotes(options: UseVePepperOptions = {}) {
  const { enabled = true } = options;
  const { address, isConnected } = useWallet();

  return useQuery({
    // Under ['vepepper'], so a finished lock or exit refreshes it too
    queryKey: [...VEPEPPER_QUERY_KEY, 'votes', address?.toLowerCase(), ACTIVE_CHAIN_ID],
    queryFn: () => fetchVePepperVotes(address as string),
    enabled: enabled && Boolean(address) && isConnected,
    staleTime: 30_000,
  });
}

/** Wallet prompts a lock of `amount` needs, in order */
function lockSteps(
  state: Pick<VePepperAccount, 'allowance' | 'delegatee'>,
  address: string | undefined,
  amount: bigint,
): Array<VePepperStep> {
  const steps: Array<VePepperStep> = [];
  // Without a delegatee the new lock would give no votes. A wallet that
  // delegated to someone else keeps that choice: the lock follows it.
  if (state.delegatee === null && address) steps.push('DELEGATE');
  if (state.allowance < amount) steps.push('APPROVE');
  steps.push('LOCK');
  return steps;
}

function getVePepperQueryKey(address: string | undefined) {
  return [...VEPEPPER_QUERY_KEY, address?.toLowerCase(), ACTIVE_CHAIN_ID] as const;
}

const VEPEPPER_QUERY_KEY = ['vepepper'] as const;

const WALLET_NOT_READY = 'Wallet not ready. Please reconnect and try again.';

/** One wallet prompt in a lock or exit */
export type VePepperStep = 'DELEGATE' | 'APPROVE' | 'LOCK' | 'APPROVE_LOCK' | 'EXIT' | 'CANCEL' | 'WITHDRAW';

type VePepperTxStatus = 'idle' | 'pending' | 'success' | 'error';

interface TxStep {
  step: VePepperStep;
  send: () => Promise<VePepperTransactionResult>;
}

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
