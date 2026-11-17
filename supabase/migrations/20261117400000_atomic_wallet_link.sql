-- Third review follow-up to 20261117300000
--
-- 1. link_wallet(): links a wallet and awards WALLET_CONNECTED in one
--    transaction, with the profile rows locked. Before this, link-wallet
--    wrote points and the activity in separate requests, so a failed activity
--    insert, a failed count query or two concurrent calls could award the
--    points twice.
--    When another profile holds the address (the owner reinstalled the app
--    and got a new anonymous user), its reputation moves with the wallet:
--    points, rank, flags, activities, streaks and votes go to the caller, and
--    the old profile is reset. The WALLET_CONNECTED activity moves too, so a
--    reinstall can't earn the reward again.
-- 2. promote_rank(): rank change plus RANK_UP activity, only if the rank is
--    still the one the caller computed from.
--    Both functions are for the service role (link-wallet) only. The rank
--    order is passed in from the shared rules file, so it is defined once.
-- 3. device_tokens: one row per (token, user) instead of one row per token.
--    register_device_token() no longer takes over someone else's row, so
--    knowing a token is not enough to hijack or delete it. send-notification
--    sends once per token.

-- ----------------------------------------------------------------------------
-- 1. link_wallet
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
BEGIN
  -- Lock the caller and every current holder of the address, in id order so
  -- concurrent calls can't deadlock
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

    UPDATE public.votes SET profile_id = p_user_id WHERE profile_id = v_prev.id;
    UPDATE public.streaks SET profile_id = p_user_id WHERE profile_id = v_prev.id;
    UPDATE public.activities SET profile_id = p_user_id WHERE profile_id = v_prev.id;

    UPDATE public.profiles SET
      wallet_address = NULL,
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

  UPDATE public.profiles SET wallet_address = p_address WHERE id = p_user_id;

  -- WALLET_CONNECTED once per profile; the row lock above serialises callers
  IF p_reward > 0 AND NOT EXISTS (
    SELECT 1 FROM public.activities
    WHERE profile_id = p_user_id AND event_type = 'WALLET_CONNECTED'
  ) THEN
    UPDATE public.profiles
    SET reputation_points = reputation_points + p_reward, last_activity_at = now()
    WHERE id = p_user_id
    RETURNING * INTO v_profile;

    INSERT INTO public.activities (profile_id, event_type, points, total_after, metadata)
    VALUES (p_user_id, 'WALLET_CONNECTED', p_reward, v_profile.reputation_points,
            jsonb_build_object('wallet_address', p_address));
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  RETURN v_profile;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. promote_rank
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_rank(
  p_user_id uuid,
  p_from text,
  p_to text
) RETURNS public.profiles
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  -- Only if nothing changed the rank since the caller read it
  UPDATE public.profiles SET rank = p_to, last_activity_at = now()
  WHERE id = p_user_id AND rank = p_from
  RETURNING * INTO v_profile;

  IF FOUND THEN
    INSERT INTO public.activities (profile_id, event_type, points, total_after, rank_before, rank_after, metadata)
    VALUES (p_user_id, 'RANK_UP', 0, v_profile.reputation_points, p_from, p_to,
            jsonb_build_object('promotedFrom', p_from, 'promotedTo', p_to));
  ELSE
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_wallet(uuid, text, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_rank(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_wallet(uuid, text, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_rank(uuid, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. device_tokens: one row per (token, user)
-- ----------------------------------------------------------------------------
ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_expo_push_token_key;
ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_token_user_key UNIQUE (expo_push_token, user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON public.device_tokens (expo_push_token);

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_expo_push_token text,
  p_platform text,
  p_device_name text DEFAULT NULL,
  p_wallet_address text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  -- Only ever the caller's own row. A reinstall adds a row for the new
  -- anonymous user; send-notification sends once per token.
  INSERT INTO public.device_tokens
    (expo_push_token, platform, device_name, wallet_address, user_id, is_active, last_used_at)
  VALUES
    (p_expo_push_token, p_platform, p_device_name, lower(p_wallet_address), auth.uid(), true, now())
  ON CONFLICT (expo_push_token, user_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    wallet_address = EXCLUDED.wallet_address,
    is_active = true,
    last_used_at = now();
END;
$$;
