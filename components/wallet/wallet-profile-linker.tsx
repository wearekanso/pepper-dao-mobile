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
 * A new address is linked through the link-wallet function, which asks the
 * wallet for a signature (no transaction) to prove ownership.
 * Also handles rank recalculation for profiles that already have a wallet.
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
  const failedAttemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    async function linkWallet() {
      if (!isConnected || !address || !profile) {
        // Clear references when disconnected
        if (!isConnected) {
          previousAddressRef.current = undefined;
          hasRecalculatedRankRef.current = false;
          failedAttemptsRef.current = 0;
          clearRetryTimer(retryTimerRef);
        }
        return;
      }

      // The server stores checksummed addresses; compare case-insensitively
      const linkedAddress = profile.wallet_address?.toLowerCase();
      const connectedAddress = address.toLowerCase();

      // Case 1: New wallet address - link it (once per address, so the
      // signature prompt is not shown again in a loop)
      const isNewAddress = linkedAddress !== connectedAddress && previousAddressRef.current !== address;

      // Case 2: Wallet already linked but rank is OBSERVER (needs recalculation)
      // This handles profiles created before rank promotion was implemented
      const needsRankRecalculation =
        linkedAddress === connectedAddress &&
        profile.rank === 'OBSERVER' &&
        !hasRecalculatedRankRef.current;

      // Signing needs the wallet provider; wait for it
      if (isNewAddress && !walletProvider) return;

      if (isNewAddress || needsRankRecalculation) {
        const reason = isNewAddress ? 'new address' : 'rank recalculation';
        console.log(`[WalletProfileLinker] Updating wallet (${reason}):`, address);

        previousAddressRef.current = address;
        if (needsRankRecalculation) {
          hasRecalculatedRankRef.current = true;
        }

        try {
          await updateWalletAddress(address, walletProvider);
          failedAttemptsRef.current = 0;
          console.log('[WalletProfileLinker] Wallet updated successfully');
        } catch (error) {
          console.error('[WalletProfileLinker] Failed to update wallet:', error);

          // The user said no; don't ask again until they reconnect
          if (isUserRejection(error)) return;

          failedAttemptsRef.current += 1;
          if (failedAttemptsRef.current > MAX_RETRIES) {
            Alert.alert(
              'Wallet not linked',
              'We could not link your wallet to your profile. Reconnect your wallet to try again.',
            );
            return;
          }

          // Allow another attempt after a growing delay
          clearRetryTimer(retryTimerRef);
          retryTimerRef.current = setTimeout(() => {
            previousAddressRef.current = undefined;
            hasRecalculatedRankRef.current = false;
            setRetryTick((tick) => tick + 1);
          }, RETRY_DELAY_MS * failedAttemptsRef.current);
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
