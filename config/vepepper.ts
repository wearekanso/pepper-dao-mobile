import { parseAbi } from 'viem';

/**
 * Minimal ABIs for the vePEPPER contracts (addresses: VEPEPPER_CONTRACTS in
 * config/aragon-governance.ts). Human-readable, so ethers can sign with the
 * same strings viem reads with.
 *
 * How the contracts fit together (checked against the verified sources):
 * - createLock pulls PEPPER from the wallet (ERC-20 approve to the escrow first)
 *   and mints one vePEPPER NFT per lock.
 * - Votes only count delegated locks. A new lock is delegated automatically
 *   when the owner already has a delegatee; otherwise the owner calls
 *   adapter.delegate(self) once. It works with no locks, so it goes first.
 * - beginWithdrawal moves the NFT into the escrow (the NFT must be approved
 *   to the escrow) and queues it. Withdraw is possible right away; the fee
 *   starts at the queue's feePercent and falls to 0 over its cooldown.
 */

export const VEPEPPER_ESCROW_ABI_HUMAN = [
  'function createLock(uint256 _value) returns (uint256)',
  'function beginWithdrawal(uint256 _tokenId)',
  'function cancelWithdrawalRequest(uint256 _tokenId)',
  'function withdraw(uint256 _tokenId)',
  'function minDeposit() view returns (uint256)',
  'function lastLockId() view returns (uint256)',
  'function ownedTokens(address _owner) view returns (uint256[])',
  'function locked(uint256 _tokenId) view returns ((uint208 amount, uint48 start))',
  'function votingPower(uint256 _tokenId) view returns (uint256)',
] as const;

export const VEPEPPER_LOCK_NFT_ABI_HUMAN = [
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
] as const;

export const VEPEPPER_EXIT_QUEUE_ABI_HUMAN = [
  'function ticketHolder(uint256 _tokenId) view returns (address)',
  'function queue(uint256 _tokenId) view returns ((address holder, uint48 queuedAt, uint16 feePercent, uint16 minFeePercent, uint48 cooldown, uint48 minCooldown, uint256 slope))',
  'function calculateFee(uint256 _tokenId) view returns (uint256)',
  'function canExit(uint256 _tokenId) view returns (bool)',
  'function feePercent() view returns (uint256)',
  'function cooldown() view returns (uint48)',
] as const;

export const VEPEPPER_CURVE_ABI_HUMAN = [
  'function getBias(uint256 timeElapsed, uint256 amount) view returns (uint256)',
  'function previewMaxBias(uint256 amount) view returns (uint256)',
  'function maxTime() view returns (uint256)',
] as const;

export const VEPEPPER_VOTES_ADAPTER_ABI_HUMAN = [
  'function delegate(address _delegatee)',
  'function delegates(address _account) view returns (address)',
  'function getVotes(address _account) view returns (uint256)',
] as const;

export const VEPEPPER_ESCROW_ABI = parseAbi(VEPEPPER_ESCROW_ABI_HUMAN);
export const VEPEPPER_LOCK_NFT_ABI = parseAbi(VEPEPPER_LOCK_NFT_ABI_HUMAN);
export const VEPEPPER_EXIT_QUEUE_ABI = parseAbi(VEPEPPER_EXIT_QUEUE_ABI_HUMAN);
export const VEPEPPER_CURVE_ABI = parseAbi(VEPEPPER_CURVE_ABI_HUMAN);
export const VEPEPPER_VOTES_ADAPTER_ABI = parseAbi(VEPEPPER_VOTES_ADAPTER_ABI_HUMAN);

/** Exit fee percents are in basis points (500 = 5%) */
export const EXIT_FEE_BASIS_POINTS = 10_000;

/**
 * Custom errors the escrow can revert with (its own and the exit queue's,
 * which bubble up through it), with the message to show. They come back as
 * bare 4-byte selectors, so services/vepepper-api.ts matches on those.
 */
export const VEPEPPER_ESCROW_ERRORS: Record<string, string> = {
  'AmountTooSmall()': 'Below the minimum lock amount',
  'ZeroAmount()': 'Enter an amount to lock',
  'CannotExit()': 'This lock cannot exit right now',
  'CannotWithdrawInSameBlock()': 'Wait a moment before exiting a lock you just created',
  'NotTicketHolder()': 'This exit belongs to another wallet',
  'MinLockNotReached(uint256,uint48,uint48)': 'This lock is too new to exit yet',
  'AlreadyQueued()': 'This lock is already exiting',
};
