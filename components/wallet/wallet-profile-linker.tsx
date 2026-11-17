import { useProvider } from '@reown/appkit-react-native';
import { useEffect, useRef } from 'react';

import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';

/**
 * Wallet Profile Linker
 *
 * Automatically links wallet address to user profile when connected.
 * A new address is linked through the link-wallet function, which asks the
 * wallet for a signature (no transaction) to prove ownership.
 * Also handles rank recalculation for profiles that already have a wallet.
 * This component should be rendered inside both UserProvider and WalletProvider.
 */
export function WalletProfileLinker({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useWallet();
  const { profile, updateWalletAddress } = useUser();
  const { provider: walletProvider } = useProvider();
  const previousAddressRef = useRef<string | undefined>(undefined);
  const hasRecalculatedRankRef = useRef(false);

  useEffect(() => {
    async function linkWallet() {
      if (!isConnected || !address || !profile) {
        // Clear references when disconnected
        if (!isConnected) {
          previousAddressRef.current = undefined;
          hasRecalculatedRankRef.current = false;
        }
        return;
      }

      // The server stores checksummed addresses; compare case-insensitively
      const linkedAddress = profile.wallet_address?.toLowerCase();
      const connectedAddress = address.toLowerCase();

      // Case 1: New wallet address - link it (once per address, so a rejected
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
          console.log('[WalletProfileLinker] Wallet updated successfully');
        } catch (error) {
          console.error('[WalletProfileLinker] Failed to update wallet:', error);
        }
      }
    }

    linkWallet();
  }, [address, isConnected, profile, updateWalletAddress, walletProvider]);

  return <>{children}</>;
}
