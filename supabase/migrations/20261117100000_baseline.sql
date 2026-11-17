-- Baseline: the production schema (project ggehypjsdpouiklchate) as of 2026-11-17
--
-- Replaces the earlier migration files, which had drifted from the live
-- database (the old project's history even listed migrations that were never
-- in this repo). Generated with pg_dump from production, then trimmed of
-- session settings and of default privileges Supabase already sets.
--
-- Contents, in order:
--   1. public schema: tables, functions, triggers, RLS policies, grants
--   2. auth.users trigger that creates a profile for every new user
--   3. sync cursor for the MainDao indexer
--
-- The sync-proposals cron job is set up in 20261117200000.
--
-- New migrations go in new files after this one; do not edit it.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. public schema
-- ----------------------------------------------------------------------------
--
--

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: create_profile_for_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_profile_for_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    event_type text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    total_after integer NOT NULL,
    rank_before text,
    rank_after text,
    proposal_id text,
    streak_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT activities_event_type_check CHECK ((event_type = ANY (ARRAY['WALLET_CONNECTED'::text, 'FIRST_VOTE'::text, 'VOTE'::text, 'PROPOSAL_SUBMITTED'::text, 'PROPOSAL_ENGAGED'::text, 'PROPOSAL_PASSED'::text, 'PROPOSAL_EXECUTED'::text, 'STREAK_MILESTONE'::text, 'STREAK_BROKEN'::text, 'RANK_UP'::text, 'STAKING_BONUS'::text, 'DELEGATION_RECEIVED'::text])))
);

--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    expo_push_token text NOT NULL,
    wallet_address text,
    platform text,
    device_name text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now(),
    CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);

--
-- Name: notification_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    proposal_id text NOT NULL,
    notification_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    recipients_count integer DEFAULT 0,
    CONSTRAINT notification_history_notification_type_check CHECK ((notification_type = ANY (ARRAY['new_proposal'::text, 'vote_reminder'::text, 'proposal_ended'::text, 'proposal_executed'::text])))
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    wallet_address text,
    reputation_points integer DEFAULT 0,
    rank text DEFAULT 'OBSERVER'::text,
    current_streak_weeks integer DEFAULT 0,
    longest_streak_weeks integer DEFAULT 0,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    has_voted boolean DEFAULT false,
    has_engaged_proposal boolean DEFAULT false,
    has_passed_proposal boolean DEFAULT false,
    CONSTRAINT profiles_rank_check CHECK ((rank = ANY (ARRAY['OBSERVER'::text, 'MEMBER'::text, 'PARTICIPANT'::text, 'STEWARD'::text, 'INITIATOR'::text, 'GOVERNOR'::text])))
);

--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    proposal_id text NOT NULL,
    plugin_address text NOT NULL,
    plugin_type text NOT NULL,
    title text NOT NULL,
    description text,
    status text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tally_yes text DEFAULT '0'::text,
    tally_no text DEFAULT '0'::text,
    tally_abstain text DEFAULT '0'::text,
    total_voting_power text DEFAULT '0'::text,
    support_threshold integer,
    min_participation integer,
    min_duration integer,
    approvals integer DEFAULT 0,
    min_approvals integer DEFAULT 0,
    current_stage integer,
    is_canceled boolean DEFAULT false,
    is_open boolean DEFAULT false,
    actions jsonb DEFAULT '[]'::jsonb,
    block_number bigint,
    transaction_hash text,
    display_index integer,
    creator text,
    metadata_pending_uri text,
    metadata_attempts integer DEFAULT 0 NOT NULL,
    metadata_attempted_at timestamp with time zone,
    CONSTRAINT proposals_plugin_type_check CHECK ((plugin_type = ANY (ARRAY['TOKEN_VOTING'::text, 'SPP'::text, 'MULTISIG'::text, 'ADMIN'::text]))),
    CONSTRAINT proposals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUCCEEDED'::text, 'DEFEATED'::text, 'EXECUTED'::text, 'CANCELED'::text])))
);

--
-- Name: streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streaks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    streak_type text DEFAULT 'GOVERNANCE'::text,
    start_date date NOT NULL,
    end_date date,
    length_weeks integer DEFAULT 1,
    is_active boolean DEFAULT true,
    broken_reason text,
    activities_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT streaks_broken_reason_check CHECK ((broken_reason = ANY (ARRAY['MISSED_PERIOD'::text, 'MANUAL_RESET'::text, NULL::text]))),
    CONSTRAINT streaks_streak_type_check CHECK ((streak_type = ANY (ARRAY['GOVERNANCE'::text, 'VOTING'::text, 'STAKING'::text])))
);

--
-- Name: sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_state (
    id text DEFAULT 'default'::text NOT NULL,
    last_synced_block bigint DEFAULT 10000000 NOT NULL,
    last_sync_at timestamp with time zone DEFAULT now(),
    sync_in_progress boolean DEFAULT false,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sync_started_at timestamp with time zone
);

--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    proposal_id text NOT NULL,
    vote_type text NOT NULL,
    transaction_hash text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['YES'::text, 'NO'::text, 'ABSTAIN'::text])))
);

--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

--
-- Name: device_tokens device_tokens_expo_push_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_expo_push_token_key UNIQUE (expo_push_token);

--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);

--
-- Name: notification_history notification_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_history
    ADD CONSTRAINT notification_history_pkey PRIMARY KEY (id);

--
-- Name: notification_history notification_history_proposal_id_notification_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_history
    ADD CONSTRAINT notification_history_proposal_id_notification_type_key UNIQUE (proposal_id, notification_type);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_wallet_address_key UNIQUE (wallet_address);

--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);

--
-- Name: proposals proposals_proposal_id_plugin_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_proposal_id_plugin_address_key UNIQUE (proposal_id, plugin_address);

--
-- Name: streaks streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streaks
    ADD CONSTRAINT streaks_pkey PRIMARY KEY (id);

--
-- Name: sync_state sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_state
    ADD CONSTRAINT sync_state_pkey PRIMARY KEY (id);

--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);

--
-- Name: votes votes_profile_id_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_profile_id_proposal_id_key UNIQUE (profile_id, proposal_id);

--
-- Name: idx_activities_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_profile ON public.activities USING btree (profile_id, created_at DESC);

--
-- Name: idx_device_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_active ON public.device_tokens USING btree (is_active) WHERE (is_active = true);

--
-- Name: idx_device_tokens_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_wallet ON public.device_tokens USING btree (wallet_address);

--
-- Name: idx_notification_history_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_history_proposal ON public.notification_history USING btree (proposal_id);

--
-- Name: idx_profiles_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_wallet ON public.profiles USING btree (wallet_address);

--
-- Name: idx_proposals_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_created_at ON public.proposals USING btree (created_at DESC);

--
-- Name: idx_proposals_plugin_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_plugin_type ON public.proposals USING btree (plugin_type);

--
-- Name: idx_proposals_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_start_date ON public.proposals USING btree (start_date DESC);

--
-- Name: idx_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_status ON public.proposals USING btree (status);

--
-- Name: idx_streaks_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streaks_dates ON public.streaks USING btree (start_date, end_date);

--
-- Name: idx_streaks_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streaks_profile ON public.streaks USING btree (profile_id, is_active);

--
-- Name: idx_votes_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votes_profile ON public.votes USING btree (profile_id);

--
-- Name: idx_votes_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votes_proposal ON public.votes USING btree (proposal_id);

--
-- Name: proposals_metadata_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposals_metadata_pending_idx ON public.proposals USING btree (metadata_attempted_at NULLS FIRST) WHERE (metadata_pending_uri IS NOT NULL);

--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

--
-- Name: streaks streaks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER streaks_updated_at BEFORE UPDATE ON public.streaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

--
-- Name: device_tokens update_device_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON public.device_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: proposals update_proposals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: sync_state update_sync_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON public.sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: activities activities_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: activities activities_streak_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_streak_id_fkey FOREIGN KEY (streak_id) REFERENCES public.streaks(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: streaks streaks_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streaks
    ADD CONSTRAINT streaks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: votes votes_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: device_tokens Anyone can register device tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can register device tokens" ON public.device_tokens FOR INSERT WITH CHECK (true);

--
-- Name: device_tokens Device tokens can be updated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Device tokens can be updated" ON public.device_tokens FOR UPDATE USING (true);

--
-- Name: notification_history Notification history readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notification history readable" ON public.notification_history FOR SELECT USING (true);

--
-- Name: profiles Profiles are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are publicly readable" ON public.profiles FOR SELECT TO authenticated USING (true);

--
-- Name: proposals Proposals are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Proposals are publicly readable" ON public.proposals FOR SELECT USING (true);

--
-- Name: activities Service role can manage activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage activities" ON public.activities TO service_role USING (true) WITH CHECK (true);

--
-- Name: profiles Service role can manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage profiles" ON public.profiles TO service_role USING (true) WITH CHECK (true);

--
-- Name: streaks Service role can manage streaks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage streaks" ON public.streaks TO service_role USING (true) WITH CHECK (true);

--
-- Name: votes Service role can manage votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage votes" ON public.votes TO service_role USING (true) WITH CHECK (true);

--
-- Name: streaks Streaks are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Streaks are publicly readable" ON public.streaks FOR SELECT TO authenticated USING (true);

--
-- Name: sync_state Sync state readable by service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sync state readable by service role" ON public.sync_state FOR SELECT USING (true);

--
-- Name: activities Users can insert their own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own activities" ON public.activities FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));

--
-- Name: votes Users can insert their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own votes" ON public.votes FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

--
-- Name: activities Users can read their own activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own activities" ON public.activities FOR SELECT TO authenticated USING ((profile_id = auth.uid()));

--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

--
-- Name: votes Votes are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Votes are publicly readable" ON public.votes FOR SELECT TO authenticated USING (true);

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: streaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

--
-- Name: FUNCTION create_profile_for_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_profile_for_user() TO anon;
GRANT ALL ON FUNCTION public.create_profile_for_user() TO authenticated;
GRANT ALL ON FUNCTION public.create_profile_for_user() TO service_role;

--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;

--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;

--
-- Name: TABLE activities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activities TO anon;
GRANT ALL ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;

--
-- Name: TABLE device_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_tokens TO anon;
GRANT ALL ON TABLE public.device_tokens TO authenticated;
GRANT ALL ON TABLE public.device_tokens TO service_role;

--
-- Name: TABLE notification_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_history TO anon;
GRANT ALL ON TABLE public.notification_history TO authenticated;
GRANT ALL ON TABLE public.notification_history TO service_role;

--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposals TO anon;
GRANT ALL ON TABLE public.proposals TO authenticated;
GRANT ALL ON TABLE public.proposals TO service_role;

--
-- Name: TABLE streaks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.streaks TO anon;
GRANT ALL ON TABLE public.streaks TO authenticated;
GRANT ALL ON TABLE public.streaks TO service_role;

--
-- Name: TABLE sync_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sync_state TO anon;
GRANT ALL ON TABLE public.sync_state TO authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;

--
-- Name: TABLE votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.votes TO anon;
GRANT ALL ON TABLE public.votes TO authenticated;
GRANT ALL ON TABLE public.votes TO service_role;

--
--

-- ----------------------------------------------------------------------------
-- 2. Profile for every new auth user (the app signs users in anonymously)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();

-- ----------------------------------------------------------------------------
-- 3. MainDao indexer cursor: the track plugins were deployed at block
--    34,113,649 or later, so scanning starts just before that
-- ----------------------------------------------------------------------------
INSERT INTO public.sync_state (id, last_synced_block, last_sync_at, sync_in_progress, error_message)
VALUES ('main_dao', 34100000, NULL, false, NULL)
ON CONFLICT (id) DO NOTHING;
