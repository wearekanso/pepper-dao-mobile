-- Follow-up to 20261116000000_main_dao_sync_cursor_and_metadata_retry.sql,
-- kept separate because that migration may already be applied somewhere.
-- Apply BEFORE deploying the sync-proposals version that reads
-- metadata_attempts / metadata_attempted_at.
--
-- Metadata retries go oldest-attempt first and stop after a fixed number of
-- attempts, so a few dead CIDs can't keep newer proposals waiting.

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS metadata_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS metadata_attempted_at TIMESTAMPTZ;

-- The retry query orders by the last attempt, not by the URI
DROP INDEX IF EXISTS proposals_metadata_pending_idx;
CREATE INDEX proposals_metadata_pending_idx
  ON proposals (metadata_attempted_at NULLS FIRST)
  WHERE metadata_pending_uri IS NOT NULL;
