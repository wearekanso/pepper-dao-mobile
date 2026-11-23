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
│   ├── link-wallet/         # Links a signed wallet, awards reputation
│   │   └── index.ts
│   └── _shared/             # Shared by the functions
│       ├── auth.ts               # service-role / shared-secret checks
│       ├── http.ts               # JSON + CORS helpers
│       └── reputation-rules.ts   # points and ranks; the app imports it too
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
| `wallet_rewards` | Wallets that have been paid WALLET_CONNECTED (server-only) |
| `chain_votes` | Every VoteCast of the track plugins (server-only) |
| `reward_grants` | Vote, streak and proposal rewards paid, one row per wallet and reward (server-only) |

### Who can write what

Clients only read reputation data. `profiles`, `activities`, `streaks` and
`votes` are written by Edge Functions with the service role; the one client
write is creating an empty profile (`id` only) if the auth trigger has not run.
Wallets are linked through `link-wallet`, which checks a wallet signature, so
nobody can set their own points or rank or claim someone else's address.

Points, streak rules and rank requirements live in
`functions/_shared/reputation-rules.ts`, which the app (`lib/reputation.ts`,
`lib/streaks.ts`) and the server import, so the UI never promises what the
server doesn't pay.

### Rewards

- `WALLET_CONNECTED`: `link-wallet`, once per wallet (`wallet_rewards`).
- Votes, streaks, proposals: `sync-proposals` indexes every `VoteCast` into
  `chain_votes`; the reward engine (`functions/_shared/rewards.ts`) turns a
  wallet's votes and proposals into grants and `apply_rewards()` pays them.
  Only verified wallets earn; `reward_grants` pays each reward key once per
  wallet, so re-runs, reinstalls and moved wallets never pay twice.
  - First vote +20, each other proposal voted +10.
  - Streak: two-week periods; a vote in each period with an open proposal
    keeps it (periods without an open proposal are skipped). Bonuses at 2, 4,
    8 and 12 weeks, then every 4 weeks.
  - Proposals you created: turnout reached the track's minimum participation
    +25, passed +75, executed +100.
- When paid: voters seen in a sync run at once; every verified wallet is
  re-checked hourly (ended streaks, passed proposals); a newly linked wallet
  in `link-wallet`. Nothing is paid until the vote index has reached the chain
  head, so first votes and streaks are never computed from partial history.

Push tokens are registered with the `register_device_token()` RPC. There is
one row per (token, user): a reinstall adds a row for the new anonymous user,
and nobody can take over or delete another user's row, even knowing the token.
`send-notification` sends once per token. `sync_state` is server-only.

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

Indexes `ProposalCreated` events from the MainDao track plugins, then
`VoteCast` events and rewards (see Rewards).

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

**Flow** (`services/wallet-link-api.ts`):
1. `{ "address", "challenge": true }` returns `{ "message" }`, built with the
   server clock (profile id, address, time; valid for 10 minutes), so a phone
   with a wrong clock can still link.
2. The wallet signs it; `{ "address", "message", "signature" }` links.

For an address that is already on the profile **and** was verified by a
signature (`profiles.wallet_verified_at`), only `address` is needed: the rank
is recalculated and nothing moves. Wallets written before verification
existed (while clients could still update profiles) are unproven, so their
owners sign once.

The write is the `link_wallet()` SQL function: one transaction, serialised
per wallet with an advisory lock, with the profile rows locked.
WALLET_CONNECTED is paid **once per wallet, ever** (`wallet_rewards`), so
moving wallets between profiles earns nothing; total reward points can never
exceed 10 x the number of distinct wallets. If another profile holds the
address (the owner reinstalled), its reputation (points, rank, flags,
activities, streaks, votes) moves with the wallet, one active streak per type
is kept (the longer one) and the old profile is reset. Rank changes go through
`promote_rank()`. `wallet_address` is unique case-insensitively.

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
- `CHILIZ_LOGS_RPC_URL` (optional) - RPC that sync-proposals reads `VoteCast`
  logs from in 100,000-block ranges; defaults to `https://rpc.chiliz.com`

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
**before** running `supabase db push` (the migration warns if they are
missing; without them the job is silently idle and nothing gets indexed), with
the same random value for the secret on both sides:

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

