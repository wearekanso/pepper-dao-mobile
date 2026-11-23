/**
 * Wallet Link API
 *
 * Links the connected wallet to the user's profile through the link-wallet
 * Edge Function. Clients cannot write profiles or reputation themselves; the
 * function checks a wallet signature, then links the wallet, awards
 * WALLET_CONNECTED and updates the rank on the server.
 *
 * The server decides when a signature is needed, from its own copy of the
 * profile. The app never guesses that from its cached profile, which can be
 * stale (for example when the same wallet was linked on another device).
 */

import { BrowserProvider } from 'ethers';

import { supabase } from '@/config/supabase';
import type { Profile } from '@/types/user';

/**
 * Link `address` to the signed-in user's profile.
 *
 * Sends the address first. When the server answers `signatureRequired`, the
 * wallet signs the message the server issued (no transaction, no gas) and the
 * signed request links it, but only if `allowSignature` is true. Otherwise
 * the result says a signature is still needed and no prompt is shown.
 */
export async function linkWallet(params: LinkWalletParams): Promise<LinkWalletResult> {
  const { address, walletProvider, allowSignature } = params;

  const first = await invokeLinkWallet({ address });
  if (!first.signatureRequired) {
    return { profile: first.profile, status: 'linked' };
  }

  if (!allowSignature || !walletProvider || !first.message) {
    return { profile: first.profile, status: 'signature-required' };
  }

  const signer = await new BrowserProvider(walletProvider).getSigner(address);
  const signature = await signer.signMessage(first.message);

  const signed = await invokeLinkWallet({ address, message: first.message, signature });
  return { profile: signed.profile, status: signed.signatureRequired ? 'signature-required' : 'linked' };
}

/**
 * True when the wallet user declined the request. Those should not be
 * retried automatically. Covers EIP-1193 4001, ethers' ACTION_REJECTED,
 * WalletConnect / Reown's 5000 ("User rejected") and wallets that only say
 * so in the message.
 *
 * Not a rejection: MetaMask's -32002 ("request already pending"), which
 * Reown also wraps in 5000. It means an earlier prompt is still open in the
 * wallet, so it is retried like any other failure.
 */
export function isUserRejection(error: unknown): boolean {
  const e = error as {
    code?: unknown;
    message?: unknown;
    info?: { error?: { code?: unknown; message?: unknown } };
  } | null;
  const messages = [e?.message, e?.info?.error?.message].filter((m): m is string => typeof m === 'string');
  if (messages.some((m) => /already pending|-32002/i.test(m))) return false;

  const codes = [e?.code, e?.info?.error?.code];
  if (codes.some((code) => code === 4001 || code === 5000 || code === 'ACTION_REJECTED')) return true;

  return messages.some((m) => /user (rejected|denied|cancel)|rejected by user|request rejected|cancelled by user/i.test(m));
}

async function invokeLinkWallet(body: Record<string, unknown>): Promise<LinkWalletResponse> {
  const { data, error } = await supabase.functions.invoke<LinkWalletResponse>('link-wallet', { body });
  if (error || !data?.profile) {
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

export interface LinkWalletResult {
  profile: Profile;
  /** `signature-required`: the wallet is not linked and verified yet; ask the user to sign */
  status: 'linked' | 'signature-required';
}

interface LinkWalletParams {
  address: string;
  /** Needed to sign when the server asks for a signature */
  walletProvider?: Eip1193Provider | null;
  /** False: never open a signature prompt, just report that one is needed */
  allowSignature: boolean;
}

interface LinkWalletResponse {
  profile: Profile;
  signatureRequired?: boolean;
  message?: string;
}
