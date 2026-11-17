import { useProvider } from '@reown/appkit-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { isUserRejection } from '@/services/wallet-link-api';

/**
 * Wallet Profile Linker
 *
 * Automatically links wallet address to user profile when connected.
 * A new address, or the profile's own address when it was never proven
 * (wallet_verified_at is null, e.g. linked before signatures existed), is
 * linked through the link-wallet function, which asks the wallet for a
 * signature (no transaction) to prove ownership.
 * Also handles rank recalculation for profiles with a verified wallet.
 *
 * Retries: a declined signature is not asked again until the wallet
 * reconnects. Other failures (network, RPC) are retried a few times with a
 * growing delay, then the user is told.
 * This component should be rendered inside both UserProvider and WalletProvider.
 */
export function WalletProfileLinker({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useWallet();
  const { profile, updateWalletAddress } = useUser();
  const { provider: walletProvider } = useProvider();
  const previousAddressRef = useRef<string | undefined>(undefined);
  const hasRecalculatedRankRef = useRef(false);
  // Failed attempts per address, so a late failure for an old address can't
  // use up the retries of the current one
  const failedAttemptsRef = useRef(new Map<string, number>());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAddressRef = useRef(address);
  const [retryTick, setRetryTick] = useState(0);

  // A retry belongs to one address; drop it when the connected address changes
  useEffect(() => {
    latestAddressRef.current = address;
    clearRetryTimer(retryTimerRef);
  }, [address]);

  useEffect(() => {
    async function linkWallet() {
      if (!isConnected || !address || !profile) {
        // Clear references when disconnected
        if (!isConnected) {
          previousAddressRef.current = undefined;
          hasRecalculatedRankRef.current = false;
          failedAttemptsRef.current.clear();
          clearRetryTimer(retryTimerRef);
        }
        return;
      }

      // The server stores checksummed addresses; compare case-insensitively
      const linkedAddress = profile.wallet_address?.toLowerCase();
      const connectedAddress = address.toLowerCase();

      // Must match the server: only a verified wallet skips the signature
      const isVerifiedLink = linkedAddress === connectedAddress && !!profile.wallet_verified_at;

      // Case 1: a different wallet, or this wallet but never proven - signed
      // link (once per address, so the prompt is not shown again in a loop)
      const needsSignedLink = !isVerifiedLink && previousAddressRef.current !== address;

      // Case 2: verified wallet but rank is OBSERVER (needs recalculation)
      // This handles profiles created before rank promotion was implemented
      const needsRankRecalculation =
        isVerifiedLink &&
        profile.rank === 'OBSERVER' &&
        !hasRecalculatedRankRef.current;

      // Signing needs the wallet provider; wait for it
      if (needsSignedLink && !walletProvider) return;

      if (needsSignedLink || needsRankRecalculation) {
        const reason = needsSignedLink ? 'signed link' : 'rank recalculation';
        console.log(`[WalletProfileLinker] Updating wallet (${reason}):`, address);

        previousAddressRef.current = address;
        if (needsRankRecalculation) {
          hasRecalculatedRankRef.current = true;
        }

        const attemptAddress = address;
        try {
          await updateWalletAddress(attemptAddress, walletProvider);
          failedAttemptsRef.current.delete(attemptAddress);
          console.log('[WalletProfileLinker] Wallet updated successfully');
        } catch (error) {
          console.error('[WalletProfileLinker] Failed to update wallet:', error);

          // The user said no; don't ask again until they reconnect
          if (isUserRejection(error)) return;

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
            // Only retry for the address that failed
            if (previousAddressRef.current !== attemptAddress) return;
            previousAddressRef.current = undefined;
            hasRecalculatedRankRef.current = false;
            setRetryTick((tick) => tick + 1);
          }, RETRY_DELAY_MS * failures);
        }
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

/** Automatic retries after a failed link that the user did not decline */
const MAX_RETRIES = 3;
/** Delay before the first retry; each further retry waits one step longer */
const RETRY_DELAY_MS = 5_000;
