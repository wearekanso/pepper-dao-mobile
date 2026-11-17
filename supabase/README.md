# Supabase Backend

This directory contains the Supabase configuration, migrations, and Edge Functions for the Pepper DAO Mobile app.

## Project Info

- **Project ID**: `ggehypjsdpouiklchate`
- **Project URL**: `https://ggehypjsdpouiklchate.supabase.co`
- **Region**: Oceania (Sydney), `ap-southeast-2`

## Directory Structure

```
supabase/
├── config.toml              # Supabase local config
├── migrations/              # Database migrations
│   └── 20261117100000_baseline.sql   # production schema baseline
├── functions/               # Edge Functions
│   ├── sync-proposals/      # Indexes blockchain events
│   │   └── index.ts
│   └── send-notification/   # Sends push notifications
│       └── index.ts
└── README.md
```

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `proposals` | Indexed governance proposals from Aragon SPP |
| `device_tokens` | Expo push notification tokens |
| `sync_state` | Blockchain sync progress tracking |
| `notification_history` | Sent notification deduplication |

### Entity Relationship

```
proposals
├── proposal_id (int)
├── plugin_address (text)
├── status (ACTIVE/SUCCEEDED/DEFEATED/EXECUTED/CANCELED)
├── tally_yes/no/abstain (text - BigInt)
├── current_stage (int)
└── actions (jsonb)

device_tokens
├── expo_push_token (text, unique)
├── user_id (uuid, owner; RLS: users only see and change their own rows)
├── wallet_address (text, optional)
├── platform (ios/android/web)
└── is_active (boolean)

sync_state
├── id ('main_dao'; 'default' is the retired old-DAO indexer)
├── last_synced_block (int)
└── sync_in_progress (boolean)

notification_history
├── proposal_id (int)
├── notification_type (new_proposal/vote_reminder/...)
└── recipients_count (int)
```

## Edge Functions

### sync-proposals

Indexes `ProposalCreated` events from the Aragon Staged Processor contract.

**Endpoint**: `POST /functions/v1/sync-proposals`

**Features**:
- Queries events in 1,000 block chunks (Ankr Public tier limit)
- Rate limited to 1 sync per 60 seconds
- Only indexes Stage 1+ proposals (passed Spicy Ministers)
- Updates vote tallies for active proposals
- Triggers push notifications for new proposals

**Deploy**:
```bash
supabase functions deploy sync-proposals --no-verify-jwt
```

### send-notification

Sends push notifications via Expo Push API.

**Endpoint**: `POST /functions/v1/send-notification`

**Body**:
```json
{
  "type": "new_proposal",
  "proposalId": 1,
  "title": "PEP Proposal #1"
}
```

**Notification Types**:
- `new_proposal` - New proposal created
- `vote_reminder` - Reminder to vote
- `proposal_ended` - Voting ended
- `proposal_executed` - Proposal executed

**Deploy**:
```bash
supabase functions deploy send-notification
```

## Setup

### Prerequisites

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login
```

### Link to Project

```bash
supabase link --project-ref ggehypjsdpouiklchate
```

### Run Migrations

```bash
# Apply migrations to remote
supabase db push

# Generate types
# types/supabase.ts is hand-written; this writes types/supabase.generated.ts
npm run supabase:types
```

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy sync-proposals --no-verify-jwt
supabase functions deploy send-notification

# View logs
supabase functions logs sync-proposals
supabase functions logs send-notification
```

## Environment Variables

The Edge Functions use these environment variables (auto-injected by Supabase):

- `SUPABASE_URL` - Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)

For the mobile app, add to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://ggehypjsdpouiklchate.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key, sb_publishable_...>
```

## Cron Job

`sync-proposals` runs every 2 minutes through pg_cron + pg_net. The job is
created by `migrations/20261117200000_tighten_rls_and_cron.sql` and reads the
function URL from the Vault secret `sync_proposals_url`. Without the secret the
job does nothing, so a local `supabase start` never calls production.

The production project already has the secret. On a new remote project,
create it once:

```sql
SELECT vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/sync-proposals',
  'sync_proposals_url'
);
```

`sync-proposals` must stay deployed without JWT checks (`verify_jwt = false`
in `config.toml`), because the cron request carries no JWT.

```sql
-- Check the job and its recent runs
SELECT jobname, schedule, active FROM cron.job;
SELECT status, start_time, return_message
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Migrations Baseline

`20261117100000_baseline.sql` is the production schema as of 2026-11-17. It
replaced the older migration files, which had drifted from production. The
production migration history lists only the baseline and the migrations after
it, so `supabase db push` applies new files normally.

On a brand-new project, `supabase db push` applies the baseline from scratch.
To point the CLI at a database that already has this schema (for example a
restored copy), mark the baseline as applied instead of running it:

```bash
supabase migration repair --status applied 20261117100000
```

## Ankr RPC Limits

Using Ankr Public tier (`https://rpc.ankr.com/chiliz`):

| Limit | Value |
|-------|-------|
| Max block range | 1,000 blocks |
| Rate limit | ~1,800 req/min |
| WebSocket | Not available |

Reference: https://www.ankr.com/docs/rpc-service/service-plans/

## Troubleshooting

### Sync stuck (sync_in_progress = true)

```sql
UPDATE sync_state SET sync_in_progress = false, sync_started_at = NULL WHERE id = 'main_dao';
```

### Reset sync to specific block

```sql
-- The track plugins were deployed at block 34,113,649 or later
UPDATE sync_state SET last_synced_block = 34100000 WHERE id = 'main_dao';
```

### Check sync status

```sql
SELECT * FROM sync_state;
SELECT COUNT(*) as total, status FROM proposals GROUP BY status;
```

