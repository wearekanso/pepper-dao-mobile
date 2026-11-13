-- Migrate governance indexing to the PEPPER MainDao
-- DAO: 0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213 (chiliz-mainnet)
--
-- The old DAO (0xDedD0A73…, SPP + lockToVote + multisig) is retired and its
-- proposals are removed, not archived. The new DAO has one TokenVoting plugin
-- per voting track (Standard / Agile / Fast).
--
-- Written to be safe against the live schema, which has drifted from earlier
-- migration files (proposal_id is TEXT there, display_index exists, ...).

-- ----------------------------------------------------------------------------
-- 1. Schema: 256-bit proposal ids and the TOKEN_VOTING plugin type
-- ----------------------------------------------------------------------------
ALTER TABLE proposals ALTER COLUMN proposal_id TYPE TEXT USING proposal_id::text;
ALTER TABLE notification_history ALTER COLUMN proposal_id TYPE TEXT USING proposal_id::text;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS display_index INTEGER;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS creator TEXT;

ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_plugin_type_check;
ALTER TABLE proposals
  ADD CONSTRAINT proposals_plugin_type_check
  CHECK (plugin_type IN ('TOKEN_VOTING', 'SPP', 'MULTISIG', 'ADMIN'));

-- ----------------------------------------------------------------------------
-- 2. Remove everything from the old DAO
-- ----------------------------------------------------------------------------
DELETE FROM notification_history
WHERE proposal_id IN (
  SELECT proposal_id FROM proposals
  WHERE plugin_address NOT IN (
    '0xd17b92bd293942a071cdbf3a6e57a790c7faad67', -- Standard Track
    '0xa80bb5fc5b8ce2e84d31338579954e8e37d7f802', -- Agile Track
    '0xf544833da4f7eb68a50b636b3eb5895310780137'  -- Fast Track
  )
);

DELETE FROM proposals
WHERE plugin_address NOT IN (
  '0xd17b92bd293942a071cdbf3a6e57a790c7faad67',
  '0xa80bb5fc5b8ce2e84d31338579954e8e37d7f802',
  '0xf544833da4f7eb68a50b636b3eb5895310780137'
);

-- ----------------------------------------------------------------------------
-- 3. Re-index from just before the track plugins were installed
-- ----------------------------------------------------------------------------
UPDATE sync_state
SET last_synced_block = 34100000,
    last_sync_at = NULL,
    sync_in_progress = false,
    error_message = NULL
WHERE id = 'default';
