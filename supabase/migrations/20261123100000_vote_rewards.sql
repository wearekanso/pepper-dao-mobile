-- Vote, streak and proposal rewards
--
-- The app promised REP for voting, streaks and proposals, but only
-- WALLET_CONNECTED was ever paid. sync-proposals now indexes every VoteCast
-- of the track plugins into chain_votes, and the reward engine
-- (functions/_shared/rewards.ts) turns a wallet's votes and proposals into
-- grants that apply_rewards() pays.
--
-- Safety:
-- - Only a verified wallet (signed link) on the profile earns anything.
-- - reward_grants pays each reward key once per wallet, ever, like
--   wallet_rewards: re-runs, reinstalls and wallets moved between profiles
--   never pay twice. Grant keys are listed in rewards.ts.
-- - Both tables are server-only. Clients keep reading profiles, activities
--   and streaks as before.

-- ----------------------------------------------------------------------------
-- 1. chain_votes: every vote cast on a track plugin
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chain_votes (
  plugin_address text NOT NULL CHECK (plugin_address = lower(plugin_address)),
  proposal_id text NOT NULL,
  voter text NOT NULL CHECK (voter = lower(voter)),
  -- IMajorityVoting.VoteOption: 1 abstain, 2 yes, 3 no
  vote_option smallint NOT NULL,
  voting_power text NOT NULL,
  block_number bigint NOT NULL,
  transaction_hash text NOT NULL,
  voted_at timestamptz NOT NULL,
  PRIMARY KEY (plugin_address, proposal_id, voter)
);
CREATE INDEX IF NOT EXISTS chain_votes_voter_idx ON public.chain_votes (voter);

ALTER TABLE public.chain_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chain_votes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chain_votes TO service_role;

-- ----------------------------------------------------------------------------
-- 2. reward_grants: what each wallet has been paid
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_grants (
  address text NOT NULL CHECK (address = lower(address)),
  reward_key text NOT NULL,
  event_type text NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, reward_key)
);

ALTER TABLE public.reward_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_grants TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Vote indexing cursor (sync-proposals), separate from the proposal one so
--    the whole vote history is read once from the plugins' first block
-- ----------------------------------------------------------------------------
INSERT INTO public.sync_state (id, last_synced_block)
VALUES ('main_dao_votes', 34100000)
ON CONFLICT (id) DO NOTHING;

-- When every verified wallet was last re-checked (streaks that ended,
-- proposals that passed); last_synced_block is unused for this row
INSERT INTO public.sync_state (id, last_synced_block, last_sync_at)
VALUES ('rewards', 0, 'epoch')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. apply_rewards
--
-- p_grants: [{ key, event_type, points, proposal_label, metadata }], in the
--           order they were earned
-- p_state:  { has_voted, has_engaged_proposal, has_passed_proposal,
--             current_streak_weeks, longest_streak_weeks,
--             streak_start (date or null), streak_votes, last_vote_at }
--
-- Pays the grants this wallet has not been paid yet, then writes the profile
-- flags and the GOVERNANCE streak. Does nothing unless the profile still
-- holds the wallet as a verified link. Rank changes stay with promote_rank().
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_rewards(
  p_user_id uuid,
  p_address text,
  p_grants jsonb,
  p_state jsonb
) RETURNS public.profiles
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles;
  v_grant jsonb;
  v_points integer;
  v_inserted integer;
  v_streak_id uuid;
  v_streak_start date;
  v_new_start date;
BEGIN
  -- Same lock as link_wallet(): a wallet is never rewarded while it moves
  PERFORM pg_advisory_xact_lock(hashtextextended('link_wallet:' || lower(p_address), 0));

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;
  IF lower(coalesce(v_profile.wallet_address, '')) <> lower(p_address) OR v_profile.wallet_verified_at IS NULL THEN
    RETURN v_profile;
  END IF;

  FOR v_grant IN SELECT value FROM jsonb_array_elements(p_grants) WITH ORDINALITY AS g(value, n) ORDER BY n LOOP
    v_points := (v_grant->>'points')::integer;

    INSERT INTO public.reward_grants (address, reward_key, event_type, points)
    VALUES (lower(p_address), v_grant->>'key', v_grant->>'event_type', v_points)
    ON CONFLICT (address, reward_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      UPDATE public.profiles SET reputation_points = reputation_points + v_points
      WHERE id = p_user_id
      RETURNING * INTO v_profile;

      -- clock_timestamp(): grants paid in one call keep their order
      INSERT INTO public.activities (profile_id, event_type, points, total_after, proposal_id, metadata, created_at)
      VALUES (
        p_user_id,
        v_grant->>'event_type',
        v_points,
        v_profile.reputation_points,
        v_grant->>'proposal_label',
        coalesce(v_grant->'metadata', '{}'::jsonb)
          || jsonb_build_object('reward_key', v_grant->>'key', 'wallet_address', lower(p_address)),
        clock_timestamp()
      );
    END IF;
  END LOOP;

  UPDATE public.profiles SET
    has_voted = coalesce(has_voted, false) OR coalesce((p_state->>'has_voted')::boolean, false),
    has_engaged_proposal = coalesce(has_engaged_proposal, false) OR coalesce((p_state->>'has_engaged_proposal')::boolean, false),
    has_passed_proposal = coalesce(has_passed_proposal, false) OR coalesce((p_state->>'has_passed_proposal')::boolean, false),
    current_streak_weeks = coalesce((p_state->>'current_streak_weeks')::integer, 0),
    longest_streak_weeks = GREATEST(coalesce(longest_streak_weeks, 0), coalesce((p_state->>'longest_streak_weeks')::integer, 0)),
    last_activity_at = GREATEST(last_activity_at, (p_state->>'last_vote_at')::timestamptz),
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  -- GOVERNANCE streak: one active row that follows the computed streak
  v_new_start := (p_state->>'streak_start')::date;

  SELECT id, start_date INTO v_streak_id, v_streak_start
  FROM public.streaks
  WHERE profile_id = p_user_id AND is_active AND streak_type = 'GOVERNANCE'
  ORDER BY length_weeks DESC, id
  LIMIT 1
  FOR UPDATE;

  IF v_streak_id IS NOT NULL AND (v_new_start IS NULL OR v_streak_start <> v_new_start) THEN
    -- The streak it tracked has ended (or a merge left extra active rows)
    UPDATE public.streaks
    SET is_active = false, end_date = current_date, broken_reason = 'MISSED_PERIOD', updated_at = now()
    WHERE profile_id = p_user_id AND is_active AND streak_type = 'GOVERNANCE';
    v_streak_id := NULL;
  END IF;

  IF v_new_start IS NOT NULL THEN
    IF v_streak_id IS NULL THEN
      INSERT INTO public.streaks (profile_id, streak_type, start_date, length_weeks, is_active, activities_count)
      VALUES (p_user_id, 'GOVERNANCE', v_new_start,
              coalesce((p_state->>'current_streak_weeks')::integer, 0),
              true,
              coalesce((p_state->>'streak_votes')::integer, 0));
    ELSE
      UPDATE public.streaks SET
        length_weeks = coalesce((p_state->>'current_streak_weeks')::integer, 0),
        activities_count = coalesce((p_state->>'streak_votes')::integer, 0),
        updated_at = now()
      WHERE id = v_streak_id;
    END IF;
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_rewards(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rewards(uuid, text, jsonb, jsonb) TO service_role;
