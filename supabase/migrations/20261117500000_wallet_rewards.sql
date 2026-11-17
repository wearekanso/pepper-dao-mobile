-- Fourth review follow-up to 20261117400000
--
-- 1. WALLET_CONNECTED is paid once per wallet, not once per profile. With the
--    per-profile rule, moving a wallet (and its reward activity) to a new
--    profile let the emptied profile earn the reward again with another
--    wallet, over and over. wallet_rewards records every wallet that has been
--    paid; it is seeded with the wallets already rewarded.
-- 2. profiles.wallet_verified_at: set only by link_wallet(), after a valid
--    signature. Wallets written while clients could still update profiles
--    are unproven (NULL); link-wallet asks their owners to sign once.
--    link-wallet's no-signature path (rank recalculation) is only for
--    verified wallets and never moves anything.
-- 3. wallet_address is unique case-insensitively, so the same wallet can't
--    sit on two profiles in different casing.
-- 4. link_wallet() takes a per-wallet advisory lock, so two profiles linking
--    the same wallet at once run one after the other instead of failing.
--    Merging keeps one active streak per type (the longer one).

-- ----------------------------------------------------------------------------
-- 1. wallet_rewards
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_rewards (
  address text PRIMARY KEY CHECK (address = lower(address)),
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  rewarded_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only: RLS on, no policies, no client grants
ALTER TABLE public.wallet_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_rewards FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_rewards TO service_role;

INSERT INTO public.wallet_rewards (address, profile_id, rewarded_at)
SELECT lower(a.metadata->>'wallet_address'), a.profile_id, min(a.created_at)
FROM public.activities a
WHERE a.event_type = 'WALLET_CONNECTED' AND a.metadata ? 'wallet_address'
GROUP BY 1, 2
ON CONFLICT (address) DO NOTHING;

-- Linked wallets whose reward activity has no address recorded
INSERT INTO public.wallet_rewards (address, profile_id)
SELECT lower(p.wallet_address), p.id
FROM public.profiles p
WHERE p.wallet_address IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.profile_id = p.id AND a.event_type = 'WALLET_CONNECTED'
  )
ON CONFLICT (address) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2 + 3. Verified, case-insensitive wallet column
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_verified_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_wallet_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_lower_key
  ON public.profiles (lower(wallet_address));

-- ----------------------------------------------------------------------------
-- 4. link_wallet
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_wallet(
  p_user_id uuid,
  p_address text,
  p_reward integer,
  p_rank_order text[]
) RETURNS public.profiles
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_prev public.profiles;
  v_profile public.profiles;
  v_rewarded integer;
BEGIN
  -- One link per wallet at a time; held until the transaction ends
  PERFORM pg_advisory_xact_lock(hashtextextended('link_wallet:' || lower(p_address), 0));

  -- Then the caller and every current holder, in id order
  PERFORM 1 FROM public.profiles
  WHERE id = p_user_id OR lower(wallet_address) = lower(p_address)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Move reputation earned with this wallet to the caller
  FOR v_prev IN
    SELECT * FROM public.profiles
    WHERE lower(wallet_address) = lower(p_address) AND id <> p_user_id
  LOOP
    -- A vote on the same proposal from both profiles: keep the caller's
    DELETE FROM public.votes v
    WHERE v.profile_id = v_prev.id
      AND EXISTS (
        SELECT 1 FROM public.votes mine
        WHERE mine.profile_id = p_user_id AND mine.proposal_id = v.proposal_id
      );

    -- One active streak per type: keep the longer one
    UPDATE public.streaks s SET is_active = false, end_date = current_date
    WHERE s.is_active
      AND s.profile_id IN (p_user_id, v_prev.id)
      AND EXISTS (
        SELECT 1 FROM public.streaks other
        WHERE other.is_active
          AND other.streak_type = s.streak_type
          AND other.profile_id IN (p_user_id, v_prev.id)
          AND other.id <> s.id
          AND (other.length_weeks, other.id) > (s.length_weeks, s.id)
      );

    UPDATE public.votes SET profile_id = p_user_id WHERE profile_id = v_prev.id;
    UPDATE public.streaks SET profile_id = p_user_id WHERE profile_id = v_prev.id;
    UPDATE public.activities SET profile_id = p_user_id WHERE profile_id = v_prev.id;
    UPDATE public.wallet_rewards SET profile_id = p_user_id WHERE profile_id = v_prev.id;

    UPDATE public.profiles SET
      wallet_address = NULL,
      wallet_verified_at = NULL,
      reputation_points = 0,
      rank = 'OBSERVER',
      current_streak_weeks = 0,
      longest_streak_weeks = 0,
      has_voted = false,
      has_engaged_proposal = false,
      has_passed_proposal = false
    WHERE id = v_prev.id;

    UPDATE public.profiles p SET
      reputation_points = p.reputation_points + v_prev.reputation_points,
      rank = CASE
        WHEN array_position(p_rank_order, v_prev.rank) > array_position(p_rank_order, p.rank)
        THEN v_prev.rank ELSE p.rank END,
      current_streak_weeks = GREATEST(p.current_streak_weeks, v_prev.current_streak_weeks),
      longest_streak_weeks = GREATEST(p.longest_streak_weeks, v_prev.longest_streak_weeks),
      has_voted = p.has_voted OR v_prev.has_voted,
      has_engaged_proposal = p.has_engaged_proposal OR v_prev.has_engaged_proposal,
      has_passed_proposal = p.has_passed_proposal OR v_prev.has_passed_proposal,
      last_activity_at = GREATEST(p.last_activity_at, v_prev.last_activity_at)
    WHERE p.id = p_user_id;
  END LOOP;

  UPDATE public.profiles
  SET wallet_address = p_address, wallet_verified_at = now()
  WHERE id = p_user_id;

  -- WALLET_CONNECTED once per wallet, ever
  IF p_reward > 0 THEN
    INSERT INTO public.wallet_rewards (address, profile_id)
    VALUES (lower(p_address), p_user_id)
    ON CONFLICT (address) DO NOTHING;
    GET DIAGNOSTICS v_rewarded = ROW_COUNT;

    IF v_rewarded > 0 THEN
      UPDATE public.profiles
      SET reputation_points = reputation_points + p_reward, last_activity_at = now()
      WHERE id = p_user_id
      RETURNING * INTO v_profile;

      INSERT INTO public.activities (profile_id, event_type, points, total_after, metadata)
      VALUES (p_user_id, 'WALLET_CONNECTED', p_reward, v_profile.reputation_points,
              jsonb_build_object('wallet_address', p_address));
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  RETURN v_profile;
END;
$$;

-- CREATE OR REPLACE keeps the grants from 20261117400000 (service_role only)

-- ----------------------------------------------------------------------------
-- 5. Warn when the cron job's Vault secrets are missing (20261117300000)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM vault.secrets WHERE name IN ('sync_proposals_url', 'sync_proposals_secret')) < 2 THEN
    RAISE WARNING 'sync-proposals cron is idle: create the Vault secrets sync_proposals_url and sync_proposals_secret (see supabase/README.md, Cron Job)';
  END IF;
END;
$$;
