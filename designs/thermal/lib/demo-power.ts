import type { VePepperAccount } from '@/services/vepepper-api';
import type { Activity, Profile } from '@/types/user';

import { DEMO_VOTE_ENABLED } from './demo-vote';

/**
 * Demo heat — dev-only sandbox for seeing the connected Power screen (streak,
 * next level, heat log) without a wallet. Open `pepperdao://power?demo=1`.
 * Shares the demo vote's dev-only switch, so release builds ignore it.
 */
export function isDemoPower(param: string | Array<string> | undefined): boolean {
  return DEMO_VOTE_ENABLED && param === '1';
}

/** Dev-only wallet state for Pulse: `pepperdao://?demo=wrongnetwork` */
export function isDemoWrongNetwork(param: string | Array<string> | undefined): boolean {
  return DEMO_VOTE_ENABLED && param === 'wrongnetwork';
}

/** Chain the demo wallet pretends to be on when it's on the wrong network */
export const DEMO_WRONG_CHAIN_ID = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the demo wallet chip and YOUR WALLET sheet show */
/** Demo wallet's PEPPER still in the retired staking contract, for the OLD STAKING tab */
export const DEMO_OLD_STAKED = 20_000_000_000;

export const DEMO_WALLET = {
  address: '0xcA93b4E1F2c3d4e5F6a7B8c9D0e1F2a3B4c5F310',
  walletName: 'Socios.com',
  pepper: 12_400_000_000,
  chz: 230.5,
};
const DEMO_PROFILE_ID = 'demo-heat';

export function createDemoProfile(): Profile {
  const now = Date.now();
  return {
    id: DEMO_PROFILE_ID,
    wallet_address: '0x000000000000000000000000000000000000dEaD',
    reputation_points: 40,
    rank: 'MEMBER',
    current_streak_weeks: 3,
    longest_streak_weeks: 3,
    last_activity_at: new Date(now - 2 * DAY_MS).toISOString(),
    has_voted: true,
    has_engaged_proposal: false,
    has_passed_proposal: false,
    created_at: new Date(now - 30 * DAY_MS).toISOString(),
    updated_at: new Date(now - 2 * DAY_MS).toISOString(),
  };
}

/** Newest first, like the activities feed; same rows as the Figma Power frame */
export function createDemoActivities(): Array<Activity> {
  const entries: Array<[Activity['event_type'], number, number]> = [
    ['RANK_UP', 0, 2],
    ['STREAK_MILESTONE', 30, 2],
    ['FIRST_VOTE', 20, 16],
    ['WALLET_CONNECTED', 10, 24],
  ];
  const now = Date.now();
  let total = 40;
  return entries.map(([eventType, points, daysAgo], index) => {
    const activity: Activity = {
      id: `${DEMO_PROFILE_ID}-${index}`,
      profile_id: DEMO_PROFILE_ID,
      event_type: eventType,
      points,
      total_after: total,
      rank_before: eventType === 'RANK_UP' ? 'OBSERVER' : null,
      rank_after: eventType === 'RANK_UP' ? 'MEMBER' : null,
      proposal_id: eventType === 'FIRST_VOTE' ? '1' : null,
      streak_id: null,
      metadata: eventType === 'STREAK_MILESTONE' ? { weeks: 2 } : {},
      created_at: new Date(now - daysAgo * DAY_MS).toISOString(),
    };
    total -= points;
    return activity;
  });
}

/** Demo wallet's vePEPPER: two locks and one exit three days in, for the MY LOCKS tab */
export function createDemoVePepperAccount(): VePepperAccount {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const pepper = (value: number) => BigInt(value) * BigInt(10) ** BigInt(18);
  return {
    walletBalance: pepper(DEMO_WALLET.pepper),
    allowance: BigInt(0),
    minDeposit: pepper(8_888_888_888),
    delegatee: DEMO_WALLET.address.toLowerCase(),
    votes: pepper(34_000_000_000),
    locks: [
      { tokenId: BigInt(7), amount: pepper(10_000_000_000), start: nowSeconds - 120 * 86_400, votingPower: pepper(16_600_000_000), needsExitApproval: true },
      { tokenId: BigInt(12), amount: pepper(15_000_000_000), start: nowSeconds - 30 * 86_400, votingPower: pepper(17_400_000_000), needsExitApproval: true },
    ],
    exits: [
      { tokenId: BigInt(3), amount: pepper(9_000_000_000), queuedAt: nowSeconds - 3 * 86_400, cooldown: 7 * 86_400, currentFee: pepper(257_142_857), canWithdraw: true },
    ],
    exitFeeBasisPoints: 500,
    exitCooldown: 7 * 86_400,
    maxLockAge: 364 * 86_400,
  };
}
