-- Review follow-ups to the baseline (20261117100000)
--
-- 1. device_tokens: rows belong to the user who registered them. Before this,
--    anyone with the publishable key could insert any row and update every
--    row (point a token at another wallet, or deactivate other people's
--    tokens). Push registration in the app is still commented out, so no
--    client depends on the old behaviour; the table was empty when this ran.
-- 2. sync_state: only the service role reads it (the indexer). The policy
--    was named "service role" but applied to every role.
-- 3. create_profile_for_user: SECURITY DEFINER, so pin search_path and stop
--    anon / authenticated from calling it directly. It runs as a trigger, which
--    does not need EXECUTE at fire time.
-- 4. Drop idx_profiles_wallet; the UNIQUE constraint on wallet_address already
--    has an index on the same column.
-- 5. sync-proposals cron reads the function URL from Vault instead of having
--    it in the migration. Without the secret (a local `supabase start`) the
--    job does nothing. On a remote project, create the secret once:
--      SELECT vault.create_secret(
--        'https://<project-ref>.supabase.co/functions/v1/sync-proposals',
--        'sync_proposals_url');

-- ----------------------------------------------------------------------------
-- 1. device_tokens
-- ----------------------------------------------------------------------------
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid()
  REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens (user_id);

DROP POLICY IF EXISTS "Anyone can register device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Device tokens can be updated" ON public.device_tokens;

CREATE POLICY "Users can read their own device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can register their own device tokens"
  ON public.device_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own device tokens"
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.device_tokens FROM anon;

-- ----------------------------------------------------------------------------
-- 2. sync_state
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sync state readable by service role" ON public.sync_state;

CREATE POLICY "Sync state readable by service role"
  ON public.sync_state FOR SELECT TO service_role
  USING (true);

REVOKE ALL ON public.sync_state FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. create_profile_for_user
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.create_profile_for_user() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_profile_for_user() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Duplicate index
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_profiles_wallet;

-- ----------------------------------------------------------------------------
-- 5. sync-proposals cron, URL from Vault
--
-- Every 2 minutes; the function refuses runs less than 60s apart and holds a
-- lock while it runs, so overlapping requests are skipped, not doubled.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-proposals';

SELECT cron.schedule(
  'sync-proposals',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := s.decrypted_secret,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'sync_proposals_url';
  $$
);
