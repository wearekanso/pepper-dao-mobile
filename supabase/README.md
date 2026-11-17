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
│   ├── 20261117100000_baseline.sql   # production schema baseline
│   └── ...                           # changes after the baseline
├── functions/               # Edge Functions
│   ├── sync-proposals/      # Indexes blockchain events
│   │   └── index.ts
│   ├── send-notification/   # Sends push notifications
│   │   └── index.ts
│   └── link-wallet/         # Links a signed wallet, awards reputation
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
| `profiles` | One per (anonymous) user: wallet, reputation points, rank |
| `activities` | Reputation history (points awarded, rank-ups) |
| `streaks`, `votes` | Reputation inputs |

### Who can write what

Clients only read reputation data. `profiles`, `activities`, `streaks` and
`votes` are written by Edge Functions with the service role; the one client
write is creating an empty profile (`id` only) if the auth trigger has not run.
Wallets are linked through `link-wallet`, which checks a wallet signature, so
nobody can set their own points or rank or claim someone else's address.

Push tokens are registered with the `register_device_token()` RPC, which hands
a token row to the current user after a reinstall. Users can read, update and
delete only their own `device_tokens` rows. `sync_state` is server-only.

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

**Access**: needs the `x-sync-secret` header (equal to the
`SYNC_PROPOSALS_SECRET` function secret) or the service role key; everything
else gets 403. The cron job sends the header.

**Deploy**:
```bash
supabase functions deploy sync-proposals   # verify_jwt = false in config.toml
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

**Access**: service role key only (sync-proposals calls it). Every app user
has a JWT through anonymous sign-in, so a JWT alone is refused with 403.

**Deploy**:
```bash
supabase functions deploy send-notification   # verify_jwt = false in config.toml
```

### link-wallet

Links the connected wallet to the caller's profile, awards WALLET_CONNECTED
(once per profile) and promotes the rank, all on the server.

**Endpoint**: `POST /functions/v1/link-wallet` with the user's JWT

**Body**: `{ "address", "message", "signature" }`. The wallet signs the message
built by `buildLinkMessage` in `services/wallet-link-api.ts` (profile id,
address, time; valid for 10 minutes). For the address already on the profile,
only `address` is needed and the rank is recalculated. A valid signature for an
address held by another profile moves the address to the caller.

**Deploy**:
```bash
supabase functions deploy link-wallet   # verify_jwt = false; the JWT is checked in the function
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

# Deploy specific function (JWT settings come from config.toml)
supabase functions deploy sync-proposals
supabase functions deploy send-notification
supabase functions deploy link-wallet

# View logs
supabase functions logs sync-proposals
supabase functions logs send-notification
```

## Environment Variables

The Edge Functions use these environment variables (auto-injected by Supabase):

- `SUPABASE_URL` - Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)

Set by hand once per project:

- `SYNC_PROPOSALS_SECRET` - shared secret for sync-proposals; must equal the
  Vault secret `sync_proposals_secret` (see Cron Job)
- `CHILIZ_RPC_URL` (optional) - RPC that link-wallet uses for smart-wallet
  signatures; defaults to `https://rpc.ankr.com/chiliz`

For the mobile app, add to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://ggehypjsdpouiklchate.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key, sb_publishable_...>
```

## Cron Job

`sync-proposals` runs every 2 minutes through pg_cron + pg_net. The job is
created by `migrations/20261117300000_server_side_reputation.sql` and reads two
Vault secrets: the function URL (`sync_proposals_url`) and the shared secret it
sends in `x-sync-secret` (`sync_proposals_secret`). Without them the job does
nothing, so a local `supabase start` never calls production.

The production project already has both. On a new remote project, create them
once with the same random value for the secret on both sides:

```bash
SECRET=$(openssl rand -hex 32)
supabase secrets set SYNC_PROPOSALS_SECRET="$SECRET"
```

```sql
SELECT vault.create_secret('https://<project-ref>.supabase.co/functions/v1/sync-proposals', 'sync_proposals_url');
SELECT vault.create_secret('<same value as SYNC_PROPOSALS_SECRET>', 'sync_proposals_secret');
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

