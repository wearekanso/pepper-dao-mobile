/**
 * Supabase Database Types
 *
 * Generated types for the Pepper DAO Supabase tables.
 * These should match the database schema created in migrations.
 */

import type { EventType, Rank, StreakType, VoteType, BrokenReason } from './user';

export interface Database {
  public: {
    Tables: {
      proposals: {
        Row: {
          id: string;
          /** 256-bit on-chain proposal id, stored as TEXT */
          proposal_id: string;
          plugin_address: string;
          plugin_type: 'TOKEN_VOTING' | 'MULTISIG' | 'SPP' | 'ADMIN';
          title: string;
          description: string | null;
          status: 'PENDING' | 'ACTIVE' | 'SUCCEEDED' | 'DEFEATED' | 'EXECUTED' | 'CANCELED';
          start_date: string;
          end_date: string;
          executed_at: string | null;
          created_at: string;
          updated_at: string;
          tally_yes: string | null;
          tally_no: string | null;
          tally_abstain: string | null;
          total_voting_power: string | null;
          support_threshold: number | null;
          min_participation: number | null;
          min_duration: number | null;
          approvals: number | null;
          min_approvals: number | null;
          current_stage: number | null;
          is_canceled: boolean | null;
          is_open: boolean | null;
          actions: Array<{
            to: string;
            value: string;
            data: string;
          }>;
          block_number: number | null;
          transaction_hash: string | null;
          display_index: number | null;
          creator: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['proposals']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['proposals']['Insert']>;
      };
      device_tokens: {
        Row: {
          id: string;
          expo_push_token: string;
          wallet_address: string | null;
          platform: 'ios' | 'android' | 'web' | null;
          device_name: string | null;
          is_active: boolean | null;
          created_at: string;
          updated_at: string;
          last_used_at: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['device_tokens']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['device_tokens']['Insert']>;
      };
      sync_state: {
        Row: {
          id: string;
          last_synced_block: number;
          last_sync_at: string | null;
          sync_in_progress: boolean | null;
          /** When the current lock was taken; a lock older than 10 min is taken over */
          sync_started_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['sync_state']['Row'],
          'created_at' | 'updated_at'
        > & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sync_state']['Insert']>;
      };
      notification_history: {
        Row: {
          id: string;
          proposal_id: string;
          notification_type: 'new_proposal' | 'vote_reminder' | 'proposal_ended' | 'proposal_executed';
          sent_at: string;
          recipients_count: number | null;
        };
        Insert: Omit<
          Database['public']['Tables']['notification_history']['Row'],
          'id' | 'sent_at'
        > & {
          id?: string;
          sent_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_history']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          wallet_address: string | null;
          reputation_points: number;
          rank: Rank;
          current_streak_weeks: number;
          longest_streak_weeks: number;
          last_activity_at: string | null;
          has_voted: boolean;
          has_engaged_proposal: boolean;
          has_passed_proposal: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          wallet_address?: string | null;
          reputation_points?: number;
          rank?: Rank;
          current_streak_weeks?: number;
          longest_streak_weeks?: number;
          last_activity_at?: string | null;
          has_voted?: boolean;
          has_engaged_proposal?: boolean;
          has_passed_proposal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      votes: {
        Row: {
          id: string;
          profile_id: string;
          proposal_id: string;
          vote_type: VoteType;
          transaction_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          proposal_id: string;
          vote_type: VoteType;
          transaction_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['votes']['Insert']>;
      };
      activities: {
        Row: {
          id: string;
          profile_id: string;
          event_type: EventType;
          points: number;
          total_after: number;
          rank_before: Rank | null;
          rank_after: Rank | null;
          proposal_id: string | null;
          streak_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          event_type: EventType;
          points: number;
          total_after: number;
          rank_before?: Rank | null;
          rank_after?: Rank | null;
          proposal_id?: string | null;
          streak_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
      };
      streaks: {
        Row: {
          id: string;
          profile_id: string;
          streak_type: StreakType;
          start_date: string;
          end_date: string | null;
          length_weeks: number;
          is_active: boolean;
          broken_reason: BrokenReason | null;
          activities_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          streak_type?: StreakType;
          start_date: string;
          end_date?: string | null;
          length_weeks?: number;
          is_active?: boolean;
          broken_reason?: BrokenReason | null;
          activities_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['streaks']['Insert']>;
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Helper types for easier usage
export type Proposal = Database['public']['Tables']['proposals']['Row'];
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert'];
export type DeviceToken = Database['public']['Tables']['device_tokens']['Row'];
export type DeviceTokenInsert = Database['public']['Tables']['device_tokens']['Insert'];
export type SyncState = Database['public']['Tables']['sync_state']['Row'];
export type NotificationHistory = Database['public']['Tables']['notification_history']['Row'];

// New reputation system types
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type VoteRow = Database['public']['Tables']['votes']['Row'];
export type VoteInsert = Database['public']['Tables']['votes']['Insert'];
export type ActivityRow = Database['public']['Tables']['activities']['Row'];
export type ActivityInsert = Database['public']['Tables']['activities']['Insert'];
export type StreakRow = Database['public']['Tables']['streaks']['Row'];
export type StreakInsert = Database['public']['Tables']['streaks']['Insert'];

