/**
 * Activity Service
 *
 * Records user activities and handles reputation/rank updates.
 */

import { supabase } from '@/config/supabase';
import { RANK_ORDER, RANK_REQUIREMENTS, REPUTATION_POINTS } from '@/lib/reputation';
import type { EventType, Rank } from '@/types/user';

interface RecordActivityParams {
  profileId: string;
  eventType: EventType;
  /** On-chain proposal id (256-bit, keep as string) */
  proposalId?: string;
  streakId?: string;
  metadata?: Record<string, unknown>;
}

interface RecordActivityResult {
  success: boolean;
  newRank?: Rank;
  error?: string;
}

interface ProfileForRankCalculation {
  reputation_points: number;
  wallet_address: string | null;
  current_streak_weeks: number;
  hasVoted?: boolean;
  has_voted?: boolean;
  hasEngagedProposal?: boolean;
  has_engaged_proposal?: boolean;
  hasPassedProposal?: boolean;
  has_passed_proposal?: boolean;
}

/**
 * Calculate highest eligible rank based on profile state
 */
export function calculateEligibleRank(profile: ProfileForRankCalculation): Rank {
  const ranksHighToLow = [...RANK_ORDER].reverse();

  for (const rank of ranksHighToLow) {
    const req = RANK_REQUIREMENTS[rank];

    const meetsPoints = profile.reputation_points >= req.points;
    const meetsWallet = !req.requiresWallet || !!profile.wallet_address;
    const meetsStreak = profile.current_streak_weeks >= req.requiresStreak;
    const meetsVote = !req.requiresVote || profile.hasVoted || profile.has_voted;
    const meetsEngaged =
      !req.requiresEngagedProposal || profile.hasEngagedProposal || profile.has_engaged_proposal;
    const meetsPassed =
      !req.requiresPassedProposal || profile.hasPassedProposal || profile.has_passed_proposal;

    if (meetsPoints && meetsWallet && meetsStreak && meetsVote && meetsEngaged && meetsPassed) {
      return rank;
    }
  }

  return 'OBSERVER';
}

/**
 * Record an activity and update profile reputation/rank
 */
export async function recordActivity(
  params: RecordActivityParams
): Promise<RecordActivityResult> {
  const { profileId, eventType, proposalId, streakId, metadata } = params;

  try {
    // 1. Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      console.error('[ActivityService] Failed to fetch profile:', profileError);
      return { success: false, error: 'Unable to load your profile. Please try again.' };
    }

    // 2. Skip if WALLET_CONNECTED already recorded for this profile
    if (eventType === 'WALLET_CONNECTED') {
      const { count } = await supabase
        .from('activities')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('event_type', 'WALLET_CONNECTED');

      if (count && count > 0) {
        console.log('[ActivityService] WALLET_CONNECTED already recorded, skipping');
        return { success: true };
      }
    }

    // 3. Calculate points for this event
    const points = REPUTATION_POINTS[eventType];
    const newTotal = profile.reputation_points + points;

    // 3. Check for rank promotion
    const currentRank = profile.rank as Rank;
    const isVoteEvent = eventType === 'VOTE' || eventType === 'FIRST_VOTE';

    const newRank = calculateEligibleRank({
      ...profile,
      reputation_points: newTotal,
      hasVoted: isVoteEvent || profile.has_voted,
    });

    const rankChanged = newRank !== currentRank;

    // 4. Insert activity record
    const { error: activityError } = await supabase.from('activities').insert({
      profile_id: profileId,
      event_type: eventType,
      points,
      total_after: newTotal,
      rank_before: rankChanged ? currentRank : null,
      rank_after: rankChanged ? newRank : null,
      proposal_id: proposalId ?? null,
      streak_id: streakId ?? null,
      metadata: metadata || {},
    });

    if (activityError) {
      console.error('[ActivityService] Failed to insert activity:', activityError);
      return { success: false, error: 'Unable to record activity. Please try again.' };
    }

    // 5. Build profile updates
    const updates: Record<string, unknown> = {
      reputation_points: newTotal,
      last_activity_at: new Date().toISOString(),
    };

    if (rankChanged) {
      updates.rank = newRank;
    }

    if (isVoteEvent) {
      updates.has_voted = true;
    }

    if (eventType === 'PROPOSAL_ENGAGED') {
      updates.has_engaged_proposal = true;
    }

    if (eventType === 'PROPOSAL_PASSED') {
      updates.has_passed_proposal = true;
    }

    // 6. Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profileId);

    if (updateError) {
      console.error('[ActivityService] Failed to update profile:', updateError);
      return { success: false, error: 'Unable to update your profile. Please try again.' };
    }

    // 7. If rank changed, create a RANK_UP activity
    if (rankChanged) {
      await supabase.from('activities').insert({
        profile_id: profileId,
        event_type: 'RANK_UP',
        points: 0,
        total_after: newTotal,
        rank_before: currentRank,
        rank_after: newRank,
        metadata: { promotedFrom: currentRank, promotedTo: newRank },
      });
    }

    return { success: true, newRank: rankChanged ? newRank : undefined };
  } catch (error) {
    console.error('[ActivityService] Unexpected error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
