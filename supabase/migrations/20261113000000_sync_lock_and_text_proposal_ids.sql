-- Follow-up to 20261111000000_migrate_to_main_dao.sql, kept separate because
-- that migration may already be applied somewhere.
-- Apply this BEFORE deploying the sync-proposals version that writes
-- sync_started_at: without the column every sync fails.

-- ----------------------------------------------------------------------------
-- 1. Reputation tables reference proposals too (a vote, a submitted proposal);
--    MainDao proposal ids are 256-bit, so they are stored as text
-- ----------------------------------------------------------------------------
ALTER TABLE votes ALTER COLUMN proposal_id TYPE TEXT USING proposal_id::text;
ALTER TABLE activities ALTER COLUMN proposal_id TYPE TEXT USING proposal_id::text;

-- ----------------------------------------------------------------------------
-- 2. Lock start time, so sync-proposals can take over a lock left behind by
--    a run that hit the edge-function time limit
-- ----------------------------------------------------------------------------
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS sync_started_at TIMESTAMPTZ;
