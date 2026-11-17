import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createPublicClient, getAddress, http, isAddress } from 'npm:viem@2.38.6';
import { chiliz } from 'npm:viem@2.38.6/chains';

/**
 * Link Wallet Edge Function
 *
 * Links a wallet to the caller's profile and awards the WALLET_CONNECTED
 * reputation, on the server. Clients can no longer write to profiles or
 * activities (migration 20261117300000), so this is the only way a
 * wallet_address, points or a rank change gets written.
 *
 * A new link needs a signature of LINK_MESSAGE from the wallet. That stops
 * anyone from claiming someone else's address. If the address is already
 * linked to another profile (for example after a reinstall, which creates a
 * new anonymous user), the signature proves ownership and the address moves
 * to the caller's profile.
 *
 * Calling it for the wallet already on the profile needs no signature; it
 * only recalculates the rank.
 *
 * Deployment: supabase functions deploy link-wallet
 * (verify_jwt = false in config.toml; the caller's JWT is checked here, which
 * works with both legacy and new Supabase signing keys)
 *
 * Request:  POST { address, message?, signature? } with the user's JWT
 * Response: { profile } or { error }
 */

/** Signatures older than this are rejected */
const MAX_MESSAGE_AGE_MS = 10 * 60_000;
/** Clock skew allowed for "Issued at" in the future */
const MAX_CLOCK_SKEW_MS = 60_000;

/** Must match lib/wallet-link.ts in the app */
const LINK_MESSAGE_PATTERN =
  /^Link this wallet to your Pepper DAO profile\.\n\nThis signature only proves you own the wallet\. It costs nothing and sends no transaction\.\n\nProfile: ([0-9a-f-]{36})\nWallet: (0x[0-9a-fA-F]{40})\nIssued at: (\S+)$/;

/** Must match REPUTATION_POINTS.WALLET_CONNECTED in lib/reputation.ts */
const WALLET_CONNECTED_POINTS = 10;

/** Must match RANK_ORDER / RANK_REQUIREMENTS in lib/reputation.ts */
const RANK_ORDER = ['OBSERVER', 'MEMBER', 'PARTICIPANT', 'STEWARD', 'INITIATOR', 'GOVERNOR'] as const;
type Rank = (typeof RANK_ORDER)[number];

const RANK_REQUIREMENTS: Record<Rank, {
  points: number;
  requiresWallet: boolean;
  requiresVote: boolean;
  requiresStreak: number;
  requiresEngagedProposal: boolean;
  requiresPassedProposal: boolean;
}> = {
  OBSERVER: { points: 0, requiresWallet: false, requiresVote: false, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  MEMBER: { points: 0, requiresWallet: true, requiresVote: false, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  PARTICIPANT: { points: 50, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: false },
  STEWARD: { points: 250, requiresWallet: false, requiresVote: true, requiresStreak: 4, requiresEngagedProposal: false, requiresPassedProposal: false },
  INITIATOR: { points: 500, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: true, requiresPassedProposal: false },
  GOVERNOR: { points: 1000, requiresWallet: false, requiresVote: true, requiresStreak: 0, requiresEngagedProposal: false, requiresPassedProposal: true },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Caller
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in' }, 401);

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);
  const userId = userData.user.id;

  // 2. Input
  let body: { address?: unknown; message?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.address !== 'string' || !isAddress(body.address, { strict: false })) {
    return json({ error: 'Invalid wallet address' }, 400);
  }
  const address = getAddress(body.address);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (profileError || !profile) return json({ error: 'Profile not found' }, 404);

  const alreadyLinked = profile.wallet_address?.toLowerCase() === address.toLowerCase();

  // 3. Ownership proof for a new link
  if (!alreadyLinked) {
    const proofError = await checkSignature(body.message, body.signature, userId, address);
    if (proofError) return json({ error: proofError }, 401);

    // Release the address from any other profile; the signature proves the
    // caller owns it
    const { error: releaseError } = await supabase
      .from('profiles')
      .update({ wallet_address: null })
      .ilike('wallet_address', address)
      .neq('id', userId);
    if (releaseError) return json({ error: 'Could not link wallet' }, 500);
  }

  // 4. WALLET_CONNECTED reward, once per profile
  const { count: rewardCount } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('event_type', 'WALLET_CONNECTED');
  const awardPoints = !rewardCount;

  const newTotal = profile.reputation_points + (awardPoints ? WALLET_CONNECTED_POINTS : 0);
  const currentRank = profile.rank as Rank;
  const eligible = eligibleRank({ ...profile, reputation_points: newTotal, wallet_address: address });
  // Promotions only; a rank is never taken away here
  const newRank = RANK_ORDER.indexOf(eligible) > RANK_ORDER.indexOf(currentRank) ? eligible : currentRank;
  const rankChanged = newRank !== currentRank;

  // 5. Write
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({
      wallet_address: address,
      reputation_points: newTotal,
      rank: newRank,
      ...(awardPoints || rankChanged ? { last_activity_at: new Date().toISOString() } : {}),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (updateError || !updated) return json({ error: 'Could not link wallet' }, 500);

  const activities: Array<Record<string, unknown>> = [];
  if (awardPoints) {
    activities.push({
      profile_id: userId,
      event_type: 'WALLET_CONNECTED',
      points: WALLET_CONNECTED_POINTS,
      total_after: newTotal,
      rank_before: rankChanged ? currentRank : null,
      rank_after: rankChanged ? newRank : null,
      metadata: { wallet_address: address },
    });
  }
  if (rankChanged) {
    activities.push({
      profile_id: userId,
      event_type: 'RANK_UP',
      points: 0,
      total_after: newTotal,
      rank_before: currentRank,
      rank_after: newRank,
      metadata: { promotedFrom: currentRank, promotedTo: newRank },
    });
  }
  if (activities.length) {
    const { error: activityError } = await supabase.from('activities').insert(activities);
    if (activityError) console.error('[link-wallet] Activity insert failed:', activityError);
  }

  return json({ profile: updated });
});

/**
 * Check that `signature` is the wallet's signature of a fresh link message
 * for this profile and address. Returns an error message, or null when valid.
 * Smart-contract wallets (ERC-1271 / ERC-6492) are checked on Chiliz.
 */
async function checkSignature(
  message: unknown,
  signature: unknown,
  userId: string,
  address: `0x${string}`,
): Promise<string | null> {
  if (typeof message !== 'string' || typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return 'A wallet signature is required to link this wallet';
  }

  const match = LINK_MESSAGE_PATTERN.exec(message);
  if (!match) return 'Unexpected link message';

  const [, messageProfile, messageWallet, issuedAt] = match;
  if (messageProfile !== userId) return 'The link message is for another profile';
  if (messageWallet.toLowerCase() !== address.toLowerCase()) return 'The link message is for another wallet';

  const issuedAtMs = Date.parse(issuedAt);
  const ageMs = Date.now() - issuedAtMs;
  if (Number.isNaN(issuedAtMs) || ageMs > MAX_MESSAGE_AGE_MS || ageMs < -MAX_CLOCK_SKEW_MS) {
    return 'The link message has expired, please try again';
  }

  const client = createPublicClient({
    chain: chiliz,
    transport: http(Deno.env.get('CHILIZ_RPC_URL') ?? 'https://rpc.ankr.com/chiliz'),
  });

  try {
    const valid = await client.verifyMessage({ address, message, signature: signature as `0x${string}` });
    return valid ? null : 'The signature does not match this wallet';
  } catch (error) {
    console.error('[link-wallet] Signature check failed:', error);
    return 'Could not verify the signature';
  }
}

interface RankInput {
  reputation_points: number;
  wallet_address: string | null;
  current_streak_weeks: number;
  has_voted: boolean;
  has_engaged_proposal: boolean;
  has_passed_proposal: boolean;
}

/** Highest rank the profile qualifies for; mirrors calculateEligibleRank in the app */
function eligibleRank(profile: RankInput): Rank {
  for (const rank of [...RANK_ORDER].reverse()) {
    const req = RANK_REQUIREMENTS[rank];
    if (
      profile.reputation_points >= req.points &&
      (!req.requiresWallet || !!profile.wallet_address) &&
      (profile.current_streak_weeks ?? 0) >= req.requiresStreak &&
      (!req.requiresVote || profile.has_voted) &&
      (!req.requiresEngagedProposal || profile.has_engaged_proposal) &&
      (!req.requiresPassedProposal || profile.has_passed_proposal)
    ) {
      return rank;
    }
  }
  return 'OBSERVER';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
