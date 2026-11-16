import { defineChain } from 'viem';

/**
 * Chiliz Chain (chainId: 88888)
 * The official blockchain for Pepper DAO (Production)
 */
export const chiliz = defineChain({
  id: 88888,
  name: 'Chiliz Chain',
  nativeCurrency: {
    name: 'Chiliz',
    symbol: 'CHZ',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ankr.com/chiliz'],
      webSocket: ['wss://rpc.ankr.com/chiliz/ws'],
    },
    public: {
      http: ['https://rpc.ankr.com/chiliz'],
      webSocket: ['wss://rpc.ankr.com/chiliz/ws'],
    },
  },
  // Multicall3 at its standard address (checked on-chain): batches reads into one RPC call
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
  blockExplorers: {
    default: {
      name: 'Chiliscan',
      url: 'https://chiliscan.com',
    },
  },
  testnet: false,
});

/**
 * Chiliz Spicy Testnet (chainId: 88882)
 * Used for development and testing
 */
export const chilizSpicy = defineChain({
  id: 88882,
  name: 'Chiliz Spicy Testnet',
  nativeCurrency: {
    name: 'Chiliz',
    symbol: 'CHZ',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://spicy-rpc.chiliz.com/'],
      webSocket: ['wss://spicy-rpc-ws.chiliz.com/'],
    },
    public: {
      http: ['https://chiliz-spicy.publicnode.com'],
      webSocket: ['wss://chiliz-spicy.publicnode.com'],
    },
  },
  // Multicall3 at its standard address (checked on-chain): batches reads into one RPC call
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
  blockExplorers: {
    default: {
      name: 'Chiliscan Testnet',
      url: 'https://testnet.chiliscan.com',
    },
  },
  testnet: true,
});

/**
 * Chain ID constants for easy reference
 */
export const CHILIZ_CHAIN_ID = 88888;
export const CHILIZ_SPICY_CHAIN_ID = 88882;

/**
 * Active chain ID based on environment
 * Currently forced to mainnet for debugging
 */
export const ACTIVE_CHAIN_ID = CHILIZ_CHAIN_ID;

/**
 * Active chain configuration based on environment
 * Currently forced to mainnet for debugging
 */
export const ACTIVE_CHAIN = chiliz;

/**
 * Supported chains for Pepper DAO
 * Currently forced to mainnet for debugging
 */
export const SUPPORTED_CHAINS = [chiliz] as const;

/**
 * Primary chain for the app (always mainnet)
 * Used by features that require mainnet contracts (e.g., Pepper dashboard)
 * For environment-aware chain, use ACTIVE_CHAIN instead
 */
export const PRIMARY_CHAIN = chiliz;

/**
 * Get the block explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string): string {
  const baseUrl = ACTIVE_CHAIN.blockExplorers.default.url;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for an address
 */
export function getExplorerAddressUrl(address: string): string {
  const baseUrl = ACTIVE_CHAIN.blockExplorers.default.url;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get the RPC URL for the active chain
 */
export function getActiveRpcUrl(): string {
  return ACTIVE_CHAIN.rpcUrls.default.http[0];
}

