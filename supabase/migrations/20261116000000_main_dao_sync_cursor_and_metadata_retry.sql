-- Follow-up to 20261111000000 and 20261113000000.
-- Apply BEFORE deploying the sync-proposals version that reads the 'main_dao'
-- sync_state row and writes metadata_pending_uri.

-- ----------------------------------------------------------------------------
-- 1. Separate sync cursor for the MainDao indexer
--
--    The old indexer keeps writing the 'default' row until the new one is
--    deployed. If both shared that row, any old run between the migration and
--    the deploy would move the cursor past the track plugins' blocks without
--    indexing them, and those proposals would never be picked up. The new
--    indexer reads its own row, so the deploy order no longer matters.
-- ----------------------------------------------------------------------------
INSERT INTO sync_state (id, last_synced_block, last_sync_at, sync_in_progress, error_message)
VALUES ('main_dao', 34100000, NULL, false, NULL)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Proposal metadata that could not be fetched from IPFS yet
--
--    Set when the gateway fails (rate limit, timeout) at insert time; later
--    runs retry the fetch and clear it once the real title is stored.
-- ----------------------------------------------------------------------------
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS metadata_pending_uri TEXT;

CREATE INDEX IF NOT EXISTS proposals_metadata_pending_idx
  ON proposals (metadata_pending_uri)
  WHERE metadata_pending_uri IS NOT NULL;
