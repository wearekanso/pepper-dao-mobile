import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createPublicClient, getAddress, http, isAddress } from 'npm:viem@2.38.6';
import { chiliz } from 'npm:viem@2.38.6/chains';

import { bearerToken } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';
import {
  eligibleRank,
  isHigherRank,
  RANK_ORDER,
  REPUTATION_POINTS,
  type RankInput,
  type RuleRank,
} from '../_shared/reputation-rules.ts';

/**
 * Link Wallet Edge Function
 *
 * Links a wallet to the caller's profile and awards WALLET_CONNECTED on the
 * server. Clients cannot write profiles or activities (migration
 * 20261117300000), so this is the only way a wallet_address, points or a rank
 * change gets written.
 *
 * The server decides when a signature is needed; the app never guesses from
 * its (possibly stale) copy of the profile:
 * 1. `{ address }`: if the wallet is on the profile and verified, the rank is
 *    recalculated and `{ profile }` comes back. Otherwise the answer is
 *    `{ profile, signatureRequired: true, message }`; the message is built
 *    here with the server clock (profile id, address, time; valid for 10
 *    minutes), so a phone with a wrong clock can still link. A wallet that is
 *    on the profile but unverified still gets its rank recalculated.
 * 2. `{ address, message, signature }`: the wallet's signature of that
 *    message; links the wallet.
 *
 * The write itself is the link_wallet() SQL function (migrations
 * 20261117400000 and 20261117500000): one transaction, serialised per wallet,
 * with the profile rows locked. WALLET_CONNECTED is paid once per wallet
 * (wallet_rewards), so moving wallets between profiles earns nothing. If
 * another profile holds the address (the owner reinstalled the app), its
 * reputation moves with the wallet to the caller.
 *
 * Only a signed request links or moves anything. Wallets written before
 * verification existed are unverified and are asked to sign.
 *
 * Deployment: supabase functions deploy link-wallet
 * (verify_jwt = false in config.toml; the caller's JWT is checked here with
 * auth.getUser, which works with both legacy and new signing keys)
 */

/** Signatures over messages older than this are rejected */
const MAX_MESSAGE_AGE_MS = 10 * 60_000;
/** Clock difference tolerated between Edge Function instances */
const MAX_INSTANCE_SKEW_MS = 30_000;

const MESSAGE_PATTERN =
  /^Link this wallet to your Pepper DAO profile\.\n\nThis signature only proves you own the wallet\. It costs nothing and sends no transaction\.\n\nProfile: ([0-9a-f-]{36})\nWallet: (0x[0-9a-fA-F]{40})\nIssued at: (\S+)$/;

/** Reused across requests; only used for signature checks */
const chilizClient = createPublicClient({
  chain: chiliz,
  transport: http(Deno.env.get('CHILIZ_RPC_URL') ?? 'https://rpc.ankr.com/chiliz'),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Caller
  const jwt = bearerToken(req);
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

  let current: Profile = profile;

  // 3. A signed request links the wallet (link + reward, atomically)
  const hasProof = body.message !== undefined || body.signature !== undefined;
  if (hasProof && !isVerifiedLink(current, address)) {
    const proofError = await checkSignature(body.message, body.signature, userId, address);
    if (proofError) return json({ error: proofError }, 401);

    const { data, error: linkError } = await supabase.rpc('link_wallet', {
      p_user_id: userId,
      p_address: address,
      p_reward: REPUTATION_POINTS.WALLET_CONNECTED,
      p_rank_order: [...RANK_ORDER],
    });
    if (linkError || !data) {
      console.error('[link-wallet] link_wallet failed:', linkError);
      return json({ error: 'Could not link wallet' }, 500);
    }
    current = data;
  }

  // 4. Rank for the wallet on the profile (promotions only)
  if (isOnProfile(current, address)) {
    current = await promoteIfEligible(supabase, userId, current);
  }

  // 5. Anything short of a verified link needs the wallet's signature
  if (isVerifiedLink(current, address)) {
    return json({ profile: current });
  }
  return json({
    profile: current,
    signatureRequired: true,
    message: buildMessage(userId, address, new Date()),
  });
});

interface Profile extends RankInput {
  rank: string;
  wallet_verified_at: string | null;
}

function isOnProfile(profile: Profile, address: string): boolean {
  return profile.wallet_address?.toLowerCase() === address.toLowerCase();
}

/** The wallet is on the profile and was proven by a signature */
function isVerifiedLink(profile: Profile, address: string): boolean {
  return isOnProfile(profile, address) && !!profile.wallet_verified_at;
}

/** Promote to the highest eligible rank; never demotes */
async function promoteIfEligible(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  profile: Profile,
): Promise<Profile> {
  const currentRank = profile.rank as RuleRank;
  const eligible = eligibleRank(profile);
  if (!isHigherRank(eligible, currentRank)) return profile;

  // Only applies if the rank is still what we read
  const { data, error } = await supabase.rpc('promote_rank', {
    p_user_id: userId,
    p_from: currentRank,
    p_to: eligible,
  });
  if (error || !data) {
    // The rank is recalculated on the next call
    console.error('[link-wallet] promote_rank failed:', error);
    return profile;
  }
  return data as Profile;
}

function buildMessage(profileId: string, address: string, issuedAt: Date): string {
  return [
    'Link this wallet to your Pepper DAO profile.',
    '',
    'This signature only proves you own the wallet. It costs nothing and sends no transaction.',
    '',
    `Profile: ${profileId}`,
    `Wallet: ${address}`,
    `Issued at: ${issuedAt.toISOString()}`,
  ].join('\n');
}

/**
 * Check that `signature` is the wallet's signature of a link message this
 * function issued for this profile and address in the last 10 minutes.
 * Returns an error message, or null when valid. Smart-contract wallets
 * (ERC-1271 / ERC-6492) are checked on Chiliz.
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

  const match = MESSAGE_PATTERN.exec(message);
  if (!match) return 'Unexpected link message';

  const [, messageProfile, messageWallet, issuedAt] = match;
  if (messageProfile !== userId) return 'The link message is for another profile';
  if (messageWallet.toLowerCase() !== address.toLowerCase()) return 'The link message is for another wallet';

  // Issued by this function, so only server clocks are involved; allow a
  // little skew between function instances
  const issuedAtMs = Date.parse(issuedAt);
  const ageMs = Date.now() - issuedAtMs;
  if (Number.isNaN(issuedAtMs) || ageMs < -MAX_INSTANCE_SKEW_MS || ageMs > MAX_MESSAGE_AGE_MS) {
    return 'The link message has expired, please try again';
  }

  try {
    const valid = await chilizClient.verifyMessage({ address, message, signature: signature as `0x${string}` });
    return valid ? null : 'The signature does not match this wallet';
  } catch (error) {
    console.error('[link-wallet] Signature check failed:', error);
    return 'Could not verify the signature';
  }
}
