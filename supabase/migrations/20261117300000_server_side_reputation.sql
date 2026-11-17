-- Second review follow-up to 20261117200000
--
-- 1. Reputation is written by the server only. Clients could update their own
--    profile row (points, rank, has_* flags, any wallet_address) and insert
--    activities and votes. Wallet linking and the WALLET_CONNECTED reward now
--    go through the link-wallet Edge Function, which checks a wallet
--    signature and writes with the service role. Clients keep read access and
--    can still create their own empty profile row (id only).
-- 2. device_tokens: registration goes through register_device_token(), which
--    takes over a token row from a previous anonymous user on the same device
--    (reinstall). Users can delete their own rows.
-- 3. sync_state: drop the service_role policy; the service role bypasses RLS.
-- 4. One updated_at trigger function instead of two, with a pinned
--    search_path.
-- 5. Cron sends the shared secret (Vault: sync_proposals_secret) that
--    sync-proposals now requires.

-- ----------------------------------------------------------------------------
-- 1. Reputation tables: server-side writes only
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own activities" ON public.activities;
DROP POLICY IF EXISTS "Users can insert their own votes" ON public.votes;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.activities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.votes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.streaks FROM anon, authenticated;

-- The app creates its own profile when the auth trigger has not run yet;
-- only the id can be set, everything else takes its default
GRANT INSERT (id) ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. device_tokens
-- ----------------------------------------------------------------------------
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

  -- A push token identifies the device. After a reinstall the device gets a
  -- new anonymous user but keeps its token, so the newest user takes it over.
  INSERT INTO public.device_tokens
    (expo_push_token, platform, device_name, wallet_address, user_id, is_active, last_used_at)
  VALUES
    (p_expo_push_token, p_platform, p_device_name, lower(p_wallet_address), auth.uid(), true, now())
  ON CONFLICT (expo_push_token) DO UPDATE SET
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    wallet_address = EXCLUDED.wallet_address,
    user_id = EXCLUDED.user_id,
    is_active = true,
    last_used_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_device_token(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text, text) TO authenticated;

CREATE POLICY "Users can delete their own device tokens"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. sync_state
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sync state readable by service role" ON public.sync_state;

-- ----------------------------------------------------------------------------
-- 4. updated_at triggers
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.update_updated_at() SET search_path = '';

DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON public.device_tokens;
DROP TRIGGER IF EXISTS update_proposals_updated_at ON public.proposals;
DROP TRIGGER IF EXISTS update_sync_state_updated_at ON public.sync_state;

CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON public.sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. sync-proposals cron with the shared secret
--
-- Both Vault secrets must exist on a remote project (see supabase/README.md).
-- Without them (a local `supabase start`) the job does nothing.
-- ----------------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-proposals';

SELECT cron.schedule(
  'sync-proposals',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := u.decrypted_secret,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  )
  FROM vault.decrypted_secrets u, vault.decrypted_secrets s
  WHERE u.name = 'sync_proposals_url' AND s.name = 'sync_proposals_secret';
  $$
);
