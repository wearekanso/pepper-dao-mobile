/**
 * Wallet Link API
 *
 * Links the connected wallet to the user's profile through the link-wallet
 * Edge Function. Clients cannot write profiles or reputation themselves; the
 * function checks a wallet signature, then links the wallet, awards
 * WALLET_CONNECTED and updates the rank on the server.
 */

import { BrowserProvider } from 'ethers';

import { supabase } from '@/config/supabase';
import type { Profile } from '@/types/user';

/**
 * Link `address` to the signed-in user's profile.
 *
 * When the profile already has this address and it was verified by a
 * signature (wallet_verified_at), no signature is needed and the function
 * only recalculates the rank; this must match the server. Otherwise the
 * function issues the
 * message (with server time, so the phone's clock doesn't matter) and the
 * wallet signs it (no transaction, no gas).
 */
export async function linkWallet(params: LinkWalletParams): Promise<Profile> {
  const { profile, address, walletProvider } = params;

  const verifiedAndLinked =
    !!profile.wallet_verified_at && profile.wallet_address?.toLowerCase() === address.toLowerCase();

  let proof: { message: string; signature: string } | Record<string, never> = {};
  if (!verifiedAndLinked) {
    if (!walletProvider) throw new Error('Wallet is not ready to sign');

    const { message } = await invokeLinkWallet<{ message: string }>({ address, challenge: true });
    const signer = await new BrowserProvider(walletProvider).getSigner(address);
    const signature = await signer.signMessage(message);
    proof = { message, signature };
  }

  const { profile: linked } = await invokeLinkWallet<{ profile: Profile }>({ address, ...proof });
  return linked;
}

/**
 * True when the wallet user declined the request. Those should not be
 * retried automatically. Covers EIP-1193 4001, ethers' ACTION_REJECTED,
 * WalletConnect / Reown's 5000 ("User rejected") and wallets that only say
 * so in the message.
 */
export function isUserRejection(error: unknown): boolean {
  const e = error as {
    code?: unknown;
    message?: unknown;
    info?: { error?: { code?: unknown; message?: unknown } };
  } | null;
  const codes = [e?.code, e?.info?.error?.code];
  if (codes.some((code) => code === 4001 || code === 5000 || code === 'ACTION_REJECTED')) return true;

  const messages = [e?.message, e?.info?.error?.message].filter((m): m is string => typeof m === 'string');
  return messages.some((m) => /user (rejected|denied|cancel)|rejected by user|request rejected|cancelled by user/i.test(m));
}

async function invokeLinkWallet<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('link-wallet', { body });
  if (error || !data) {
    throw new Error((await readFunctionError(error)) ?? 'Could not link wallet');
  }
  return data;
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

/** EIP-1193 provider from Reown AppKit */
export interface Eip1193Provider {
  request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

interface LinkWalletParams {
  profile: Pick<Profile, 'id' | 'wallet_address' | 'wallet_verified_at'>;
  address: string;
  /** Needed unless the address is already linked */
  walletProvider?: Eip1193Provider | null;
}
