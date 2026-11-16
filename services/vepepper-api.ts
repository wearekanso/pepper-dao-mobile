/**
 * vePEPPER API Service
 *
 * Lock PEPPER as vePEPPER, exit locks, and read a wallet's locks, queued
 * exits and voting power. Reads go through viem (Multicall3), transactions
 * are signed with ethers via the Reown AppKit provider, like voting-api.
 * Contract behaviour is described in config/vepepper.ts.
 */

import { BrowserProvider, Contract, id, type InterfaceAbi } from 'ethers';
import { createPublicClient, erc20Abi, http, zeroAddress, type Address } from 'viem';

import { VEPEPPER_CONTRACTS } from '@/config/aragon-governance';
import { chiliz } from '@/config/chains';
import { PEPPER_TOKEN_ADDRESS } from '@/config/pepper-token';
import {
  VEPEPPER_CURVE_ABI,
  VEPEPPER_ESCROW_ABI,
  VEPEPPER_ESCROW_ABI_HUMAN,
  VEPEPPER_ESCROW_ERRORS,
  VEPEPPER_EXIT_QUEUE_ABI,
  VEPEPPER_LOCK_NFT_ABI,
  VEPEPPER_LOCK_NFT_ABI_HUMAN,
  VEPEPPER_VOTES_ADAPTER_ABI,
  VEPEPPER_VOTES_ADAPTER_ABI_HUMAN,
} from '@/config/vepepper';

const publicClient = createPublicClient({
  chain: chiliz,
  transport: http(),
});

const ESCROW = VEPEPPER_CONTRACTS.escrow as Address;
const LOCK_NFT = VEPEPPER_CONTRACTS.lockNFT as Address;
const EXIT_QUEUE = VEPEPPER_CONTRACTS.exitQueue as Address;
const CURVE = VEPEPPER_CONTRACTS.curve as Address;
const VOTES_ADAPTER = VEPEPPER_CONTRACTS.votesAdapter as Address;
const PEPPER = PEPPER_TOKEN_ADDRESS as Address;

/**
 * Read everything the lock screens need for one wallet
 */
export async function fetchVePepperAccount(userAddress: string): Promise<VePepperAccount> {
  const user = userAddress as Address;

  const [walletBalance, allowance, minDeposit, delegatee, votes, ownedTokens, lastLockId, feePercent, cooldown, maxTime] =
    await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: PEPPER, abi: erc20Abi, functionName: 'balanceOf', args: [user] },
        { address: PEPPER, abi: erc20Abi, functionName: 'allowance', args: [user, ESCROW] },
        { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'minDeposit' },
        { address: VOTES_ADAPTER, abi: VEPEPPER_VOTES_ADAPTER_ABI, functionName: 'delegates', args: [user] },
        { address: VOTES_ADAPTER, abi: VEPEPPER_VOTES_ADAPTER_ABI, functionName: 'getVotes', args: [user] },
        { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'ownedTokens', args: [user] },
        { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'lastLockId' },
        { address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'feePercent' },
        { address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'cooldown' },
        { address: CURVE, abi: VEPEPPER_CURVE_ABI, functionName: 'maxTime' },
      ],
    });

  const [locks, exits] = await Promise.all([readLocks(ownedTokens), readExits(user, lastLockId)]);

  return {
    walletBalance,
    allowance,
    minDeposit,
    delegatee: delegatee === zeroAddress ? null : delegatee.toLowerCase(),
    votes,
    locks,
    exits,
    exitFeeBasisPoints: Number(feePercent),
    exitCooldown: Number(cooldown),
    maxLockAge: Number(maxTime),
  };
}

/**
 * Voting power a new lock of `amount` would have now and once fully aged
 */
export async function previewVotingPower(amount: bigint): Promise<VotingPowerPreview> {
  const [atStart, atMax, maxTime] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: CURVE, abi: VEPEPPER_CURVE_ABI, functionName: 'getBias', args: [BigInt(0), amount] },
      { address: CURVE, abi: VEPEPPER_CURVE_ABI, functionName: 'previewMaxBias', args: [amount] },
      { address: CURVE, abi: VEPEPPER_CURVE_ABI, functionName: 'maxTime' },
    ],
  });
  return { atStart, atMax, maxTime: Number(maxTime) };
}

/**
 * Point the wallet's votes at itself. Needed once before the first lock:
 * without a delegatee a new lock gives no votes.
 */
export function delegateToSelf(walletProvider: Eip1193Provider, userAddress: string) {
  return sendTransaction(walletProvider, VOTES_ADAPTER, VEPEPPER_VOTES_ADAPTER_ABI_HUMAN, 'delegate', [userAddress], 'delegate');
}

/** Let the escrow pull exactly `amount` PEPPER for the next lock */
export function approvePepperForLock(walletProvider: Eip1193Provider, amount: bigint) {
  return sendTransaction(walletProvider, PEPPER, ERC20_APPROVE_ABI_HUMAN, 'approve', [ESCROW, amount], 'approve PEPPER');
}

/** Lock `amount` PEPPER; mints a vePEPPER NFT to the wallet */
export function createLock(walletProvider: Eip1193Provider, amount: bigint) {
  return sendTransaction(walletProvider, ESCROW, VEPEPPER_ESCROW_ABI_HUMAN, 'createLock', [amount], 'createLock');
}

/** Let the escrow take the lock NFT when the exit starts */
export function approveLockForExit(walletProvider: Eip1193Provider, tokenId: bigint) {
  return sendTransaction(walletProvider, LOCK_NFT, VEPEPPER_LOCK_NFT_ABI_HUMAN, 'approve', [ESCROW, tokenId], 'approve lock');
}

/** Queue a lock for exit; its voting power stops right away */
export function beginWithdrawal(walletProvider: Eip1193Provider, tokenId: bigint) {
  return sendTransaction(walletProvider, ESCROW, VEPEPPER_ESCROW_ABI_HUMAN, 'beginWithdrawal', [tokenId], 'beginWithdrawal');
}

/** Take a queued lock back; it votes again */
export function cancelWithdrawal(walletProvider: Eip1193Provider, tokenId: bigint) {
  return sendTransaction(walletProvider, ESCROW, VEPEPPER_ESCROW_ABI_HUMAN, 'cancelWithdrawalRequest', [tokenId], 'cancel exit');
}

/** Burn a queued lock and send its PEPPER, minus the current fee, to the wallet */
export function withdrawLock(walletProvider: Eip1193Provider, tokenId: bigint) {
  return sendTransaction(walletProvider, ESCROW, VEPEPPER_ESCROW_ABI_HUMAN, 'withdraw', [tokenId], 'withdraw');
}

/**
 * Turn wallet and contract errors into messages for the lock screens.
 * The escrow reverts with bare custom errors (4-byte selectors), so those
 * are matched on the revert data; wallet and PEPPER token errors are text.
 */
export function parseVePepperError(error: unknown): string {
  const revertData = findRevertData(error);
  const selector = revertData?.slice(0, 10).toLowerCase();
  const byCustomError = selector ? ERROR_MESSAGES_BY_SELECTOR[selector] : undefined;
  if (byCustomError) return byCustomError;

  const message = error instanceof Error ? error.message : String(error);
  const byText = Object.entries(TEXT_ERROR_MESSAGES).find(([needle]) => message.toLowerCase().includes(needle));
  if (byText) return byText[1];
  return 'Transaction failed. Please try again.';
}

/** Locks still in the wallet, with what exiting each one needs */
async function readLocks(tokenIds: ReadonlyArray<bigint>): Promise<Array<VePepperLock>> {
  if (tokenIds.length === 0) return [];

  const results = await publicClient.multicall({
    allowFailure: false,
    contracts: tokenIds.flatMap((tokenId) => [
      { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'locked', args: [tokenId] } as const,
      { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'votingPower', args: [tokenId] } as const,
      { address: LOCK_NFT, abi: VEPEPPER_LOCK_NFT_ABI, functionName: 'getApproved', args: [tokenId] } as const,
    ]),
  });

  return tokenIds.map((tokenId, index) => {
    const locked = results[index * 3] as { amount: bigint; start: number };
    const votingPower = results[index * 3 + 1] as bigint;
    const approved = results[index * 3 + 2] as Address;
    return {
      tokenId,
      amount: locked.amount,
      start: Number(locked.start),
      votingPower,
      needsExitApproval: approved.toLowerCase() !== ESCROW.toLowerCase(),
    };
  });
}

/**
 * Locks this wallet queued for exit. Queued NFTs sit in the escrow and the
 * queue keeps no per-holder list, so this asks for the ticket holder of
 * every lock id, in chunks. Fine for the current few dozen locks; once
 * there are thousands, index ExitQueuedV2 events (e.g. in sync-proposals)
 * instead of scanning.
 */
async function readExits(user: Address, lastLockId: bigint): Promise<Array<VePepperExit>> {
  const ids = Array.from({ length: Number(lastLockId) }, (_, index) => BigInt(index + 1));
  if (ids.length === 0) return [];

  const queuedIds: Array<bigint> = [];
  for (let start = 0; start < ids.length; start += TICKET_SCAN_CHUNK) {
    const chunk = ids.slice(start, start + TICKET_SCAN_CHUNK);
    const holders = await publicClient.multicall({
      // A burned or odd id must not fail the whole read
      allowFailure: true,
      contracts: chunk.map(
        (tokenId) =>
          ({ address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'ticketHolder', args: [tokenId] }) as const,
      ),
    });
    chunk.forEach((tokenId, index) => {
      const holder = holders[index];
      if (holder.status === 'success' && holder.result.toLowerCase() === user.toLowerCase()) queuedIds.push(tokenId);
    });
  }
  if (queuedIds.length === 0) return [];

  const results = await publicClient.multicall({
    allowFailure: false,
    contracts: queuedIds.flatMap((tokenId) => [
      { address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'queue', args: [tokenId] } as const,
      { address: ESCROW, abi: VEPEPPER_ESCROW_ABI, functionName: 'locked', args: [tokenId] } as const,
      { address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'calculateFee', args: [tokenId] } as const,
      { address: EXIT_QUEUE, abi: VEPEPPER_EXIT_QUEUE_ABI, functionName: 'canExit', args: [tokenId] } as const,
    ]),
  });

  return queuedIds.map((tokenId, index) => {
    const ticket = results[index * 4] as { queuedAt: number; cooldown: number };
    const locked = results[index * 4 + 1] as { amount: bigint };
    return {
      tokenId,
      amount: locked.amount,
      queuedAt: Number(ticket.queuedAt),
      cooldown: Number(ticket.cooldown),
      currentFee: results[index * 4 + 2] as bigint,
      canWithdraw: results[index * 4 + 3] as boolean,
    };
  });
}

async function sendTransaction(
  walletProvider: Eip1193Provider,
  address: string,
  abi: InterfaceAbi,
  method: string,
  args: Array<unknown>,
  label: string,
): Promise<VePepperTransactionResult> {
  try {
    const signer = await new BrowserProvider(walletProvider).getSigner();
    const contract = new Contract(address, abi, signer);
    const tx = await contract.getFunction(method)(...args);
    console.log(`[VePepperAPI] ${label} tx submitted:`, tx.hash);
    const receipt = await tx.wait();
    return { status: 'success', txHash: receipt?.hash ?? tx.hash };
  } catch (error) {
    console.error(`[VePepperAPI] ${label} failed:`, error);
    return { status: 'error', error: parseVePepperError(error) };
  }
}

/**
 * Revert data from an ethers / wallet error. Where it sits depends on who
 * failed (gas estimation, the RPC, the wallet), so check the usual places.
 */
function findRevertData(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== 'object' || depth > 4) return null;
  const record = error as Record<string, unknown>;
  const data = record.data;
  if (typeof data === 'string' && /^0x[0-9a-fA-F]{8}/.test(data)) return data;
  for (const key of ['error', 'info', 'cause', 'data']) {
    const found = findRevertData(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** 4-byte selector of each escrow custom error → message */
const ERROR_MESSAGES_BY_SELECTOR: Record<string, string> = Object.fromEntries(
  Object.entries(VEPEPPER_ESCROW_ERRORS).map(([signature, message]) => [id(signature).slice(0, 10), message]),
);

/** Lower-case substring of the error message → message */
const TEXT_ERROR_MESSAGES: Record<string, string> = {
  'user rejected': 'Transaction was cancelled',
  'user denied': 'Transaction was cancelled',
  action_rejected: 'Transaction was cancelled',
  // PEPPER is an OpenZeppelin v4 ERC-20: plain "ERC20: ..." reasons
  'insufficient allowance': 'Approve PEPPER first, then lock',
  'transfer amount exceeds balance': 'Not enough PEPPER in your wallet',
  'insufficient funds': 'Not enough CHZ to pay the network fee',
  'network changed': 'Please switch your wallet to Chiliz Chain (88888)',
};

const ERC20_APPROVE_ABI_HUMAN = ['function approve(address spender, uint256 amount) returns (bool)'] as const;

/** Wallets read in one ticketHolder multicall when scanning for exits */
const TICKET_SCAN_CHUNK = 500;

/**
 * EIP-1193 compatible provider interface
 */
interface Eip1193Provider {
  request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

export interface VePepperTransactionResult {
  status: 'success' | 'error';
  txHash?: string;
  error?: string;
}

/** A lock held in the wallet */
export interface VePepperLock {
  tokenId: bigint;
  /** PEPPER locked (18 decimals) */
  amount: bigint;
  /** When voting power started counting (unix seconds) */
  start: number;
  /** Current voting power of this lock (18 decimals) */
  votingPower: bigint;
  /** Exiting needs an NFT approval to the escrow first */
  needsExitApproval: boolean;
}

/** A lock queued for exit; the escrow holds its NFT until withdraw or cancel */
export interface VePepperExit {
  tokenId: bigint;
  amount: bigint;
  /** When the exit was started (unix seconds) */
  queuedAt: number;
  /** Seconds after queuedAt when the fee reaches its minimum */
  cooldown: number;
  /** Fee if withdrawn now (18 decimals) */
  currentFee: bigint;
  canWithdraw: boolean;
}

export interface VePepperAccount {
  walletBalance: bigint;
  /** PEPPER the escrow may pull for createLock */
  allowance: bigint;
  minDeposit: bigint;
  /** Who the wallet's locks vote through; null until delegate is called once */
  delegatee: string | null;
  /** Voting power the track plugins see for this wallet */
  votes: bigint;
  locks: Array<VePepperLock>;
  exits: Array<VePepperExit>;
  /** Exit fee for a new exit, in basis points (500 = 5%) */
  exitFeeBasisPoints: number;
  /** Seconds until a new exit's fee reaches its minimum */
  exitCooldown: number;
  /** Seconds until a lock's voting power reaches its cap (curve maxTime) */
  maxLockAge: number;
}

export interface VotingPowerPreview {
  /** Voting power right after locking */
  atStart: bigint;
  /** Voting power once the lock has aged maxTime */
  atMax: bigint;
  /** Seconds until atMax */
  maxTime: number;
}
