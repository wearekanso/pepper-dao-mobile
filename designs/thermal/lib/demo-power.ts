import type { ProposerEligibility } from '@/types/proposal-form';
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

/**
 * Dev-only eligibility for New Proposal: `pepperdao://governance/create?demo=noteligible`
 * (or `=eligible`) shows that state with the demo wallet's 12,000 vePEPPER.
 */
export function getDemoEligibility(param: string | Array<string> | undefined): ProposerEligibility | null {
  if (!DEMO_VOTE_ENABLED || (param !== 'noteligible' && param !== 'eligible')) return null;
  const minRequired = BigInt(param === 'eligible' ? 10_000 : 1_000_000_000_000) * WEI;
  return { userPower: BigInt(DEMO_WALLET.vePepper) * WEI, minRequired, isEligible: param === 'eligible' };
}

const WEI = BigInt(10) ** BigInt(18);

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the demo wallet chip and YOUR WALLET sheet show */
export const DEMO_WALLET = {
  address: '0xcA93b4E1F2c3d4e5F6a7B8c9D0e1F2a3B4c5F310',
  walletName: 'Socios.com',
  pepper: 12_400_000,
  vePepper: 12_000,
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
      proposal_id: eventType === 'FIRST_VOTE' ? 1 : null,
      streak_id: null,
      metadata: eventType === 'STREAK_MILESTONE' ? { weeks: 2 } : {},
      created_at: new Date(now - daysAgo * DAY_MS).toISOString(),
    };
    total -= points;
    return activity;
  });
}
