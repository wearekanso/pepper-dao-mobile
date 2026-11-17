import { useProvider } from '@reown/appkit-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { isUserRejection } from '@/services/wallet-link-api';

/**
 * Wallet Profile Linker
 *
 * Links the connected wallet to the user's profile through the link-wallet
 * function, once per address per app session. The server decides whether a
 * signature is needed (a new wallet, or one linked before signatures
 * existed); the app does not guess from its cached profile. The same call
 * recalculates the rank, so there is no separate rank step.
 *
 * Signature prompts:
 * - A declined signature is remembered on the device for that address, so
 *   the prompt does not come back on every launch. Disconnecting the wallet
 *   clears it; the next connect asks again.
 * - Other failures (network, RPC) are retried a few times with a growing
 *   delay, then the user is told.
 * This component should be rendered inside both UserProvider and WalletProvider.
 */
export function WalletProfileLinker({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useWallet();
  const { profile, updateWalletAddress } = useUser();
  const { provider: walletProvider } = useProvider();
  // Address already handled in this session (linked, declined or given up)
  const attemptedAddressRef = useRef<string | undefined>(undefined);
  // Last address connected in this session, to clear its decline on disconnect
  const connectedAddressRef = useRef<string | undefined>(undefined);
  const failedAttemptsRef = useRef(new Map<string, number>());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAddressRef = useRef(address);
  const [retryTick, setRetryTick] = useState(0);

  // Retries belong to one address; start fresh when the address changes
  useEffect(() => {
    latestAddressRef.current = address;
    clearRetryTimer(retryTimerRef);
    failedAttemptsRef.current.clear();
  }, [address]);

  useEffect(() => {
    async function linkWallet() {
      if (!isConnected || !address) {
        if (!isConnected) {
          // An explicit disconnect: the next connect may ask to sign again
          if (connectedAddressRef.current) clearDeclined(connectedAddressRef.current);
          connectedAddressRef.current = undefined;
          attemptedAddressRef.current = undefined;
          failedAttemptsRef.current.clear();
          clearRetryTimer(retryTimerRef);
        }
        return;
      }
      connectedAddressRef.current = address;

      // Once per address per session; the provider is needed in case the
      // server asks for a signature
      if (!profile || !walletProvider || attemptedAddressRef.current === address) return;
      attemptedAddressRef.current = address;

      const attemptAddress = address;
      const allowSignature = !isDeclined(attemptAddress);
      console.log('[WalletProfileLinker] Linking wallet:', attemptAddress, allowSignature ? '' : '(signature declined before)');

      try {
        const status = await updateWalletAddress(attemptAddress, walletProvider, { allowSignature });
        failedAttemptsRef.current.delete(attemptAddress);
        console.log('[WalletProfileLinker] Link result:', status);
      } catch (error) {
        console.error('[WalletProfileLinker] Failed to link wallet:', error);

        // The user said no: remember it, so it is not asked on every launch
        if (isUserRejection(error)) {
          markDeclined(attemptAddress);
          return;
        }

        // A failure for an address that is no longer connected: nothing to retry
        if (latestAddressRef.current !== attemptAddress) return;

        const failures = (failedAttemptsRef.current.get(attemptAddress) ?? 0) + 1;
        failedAttemptsRef.current.set(attemptAddress, failures);
        if (failures > MAX_RETRIES) {
          Alert.alert(
            'Wallet not linked',
            'We could not link your wallet to your profile. Reconnect your wallet to try again.',
          );
          return;
        }

        // Allow another attempt after a growing delay
        clearRetryTimer(retryTimerRef);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (latestAddressRef.current !== attemptAddress) return;
          attemptedAddressRef.current = undefined;
          setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS * failures);
      }
    }

    linkWallet();
  }, [address, isConnected, profile, updateWalletAddress, walletProvider, retryTick]);

  useEffect(() => () => clearRetryTimer(retryTimerRef), []);

  return <>{children}</>;
}

function clearRetryTimer(timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function declinedKey(address: string): string {
  return `${STORAGE_KEYS.WALLET_LINK_DECLINED_PREFIX}${address.toLowerCase()}`;
}

function isDeclined(address: string): boolean {
  return StorageService.getBoolean(declinedKey(address)) === true;
}

function markDeclined(address: string): void {
  StorageService.setBoolean(declinedKey(address), true);
}

function clearDeclined(address: string): void {
  StorageService.remove(declinedKey(address));
}

/** Automatic retries after a failed link that the user did not decline */
const MAX_RETRIES = 3;
/** Delay before the first retry; each further retry waits one step longer */
const RETRY_DELAY_MS = 5_000;
