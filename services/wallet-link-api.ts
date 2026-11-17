/**
 * Wallet Link API
 *
 * Links the connected wallet to the user's profile through the link-wallet
 * Edge Function. Clients cannot write profiles or reputation themselves; the
 * function checks a wallet signature, then sets wallet_address, awards
 * WALLET_CONNECTED and updates the rank on the server.
 */

import { BrowserProvider } from 'ethers';

import { supabase } from '@/config/supabase';
import type { Profile } from '@/types/user';

/**
 * Link `address` to the signed-in user's profile.
 *
 * When the profile already has this address, no signature is needed and the
 * function only recalculates the rank. Otherwise the wallet is asked to sign
 * a short message (no transaction, no gas).
 */
export async function linkWallet(params: LinkWalletParams): Promise<Profile> {
  const { profile, address, walletProvider } = params;

  const alreadyLinked = profile.wallet_address?.toLowerCase() === address.toLowerCase();

  let proof: { message: string; signature: string } | Record<string, never> = {};
  if (!alreadyLinked) {
    if (!walletProvider) throw new Error('Wallet is not ready to sign');

    const message = buildLinkMessage(profile.id, address, new Date());
    const signer = await new BrowserProvider(walletProvider).getSigner(address);
    const signature = await signer.signMessage(message);
    proof = { message, signature };
  }

  const { data, error } = await supabase.functions.invoke<{ profile: Profile }>('link-wallet', {
    body: { address, ...proof },
  });

  if (error || !data?.profile) {
    throw new Error(await readFunctionError(error) ?? 'Could not link wallet');
  }

  return data.profile;
}

/**
 * The message the wallet signs. Must match LINK_MESSAGE_PATTERN in
 * supabase/functions/link-wallet/index.ts.
 */
export function buildLinkMessage(profileId: string, address: string, issuedAt: Date): string {
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

/** The function's `{ error }` body, when the invoke error carries a response */
async function readFunctionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

interface Eip1193Provider {
  request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

interface LinkWalletParams {
  profile: Pick<Profile, 'id' | 'wallet_address'>;
  address: string;
  /** EIP-1193 provider from Reown AppKit; needed unless the address is already linked */
  walletProvider?: Eip1193Provider | null;
}
