-- Run the sync-proposals indexer on a schedule.
--
-- Until now it was only run by hand, so new MainDao proposals never showed up
-- on their own. sync-proposals is deployed with --no-verify-jwt and refuses
-- runs closer than 60s apart, so every 2 minutes stays clear of its rate limit.
-- Each run scans up to 100k blocks, so a fresh project catches up on its own.
--
-- The URL points at the production project (ggehypjsdpouiklchate). Change it
-- if this migration is applied to another project.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Re-running replaces the job instead of adding a second one
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-proposals';

SELECT cron.schedule(
  'sync-proposals',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ggehypjsdpouiklchate.supabase.co/functions/v1/sync-proposals',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
