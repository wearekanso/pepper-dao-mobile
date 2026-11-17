-- Drop the STAKING_BONUS event type (issue #12, PRO-1710)
--
-- The weekly staking REP bonus was promised in the app but never awarded:
-- nothing ever wrote a STAKING_BONUS activity. The promise is removed from
-- the app, so the event type goes too. Re-adding the check fails if a
-- STAKING_BONUS row exists, so no data is dropped silently.

ALTER TABLE public.activities DROP CONSTRAINT activities_event_type_check;

ALTER TABLE public.activities ADD CONSTRAINT activities_event_type_check CHECK ((event_type = ANY (ARRAY[
  'WALLET_CONNECTED'::text,
  'FIRST_VOTE'::text,
  'VOTE'::text,
  'PROPOSAL_SUBMITTED'::text,
  'PROPOSAL_ENGAGED'::text,
  'PROPOSAL_PASSED'::text,
  'PROPOSAL_EXECUTED'::text,
  'STREAK_MILESTONE'::text,
  'STREAK_BROKEN'::text,
  'RANK_UP'::text,
  'DELEGATION_RECEIVED'::text
])));
