import { createMMKV } from 'react-native-mmkv';
/**
 * MMKV storage instance for secure, fast key-value storage
 * Used for wallet session persistence and app state
 */
export const storage = createMMKV({
  id: 'pepper-dao-storage',
  encryptionKey: 'pepper-dao-secure-key-v1',
});

/**
 * Storage keys used throughout the app
 */
export const STORAGE_KEYS = {
  WALLET_SESSION: 'wallet:session',
  WALLET_PROVIDER_TYPE: 'wallet:provider_type',
  WALLET_CONNECTED_AT: 'wallet:connected_at',
  /** Prefix; + lowercase address. The user declined the wallet-link signature for that wallet */
  WALLET_LINK_DECLINED_PREFIX: 'wallet:link_declined:',
  USER_PREFERENCES: 'user:preferences',
  ONBOARDING_COMPLETED: 'onboarding:completed',
  ONBOARDING_DISMISSED: 'onboarding:dismissed',
  ACTIVE_TAB: '@pepper:active_tab',
  STAKING_MODAL_OPEN: '@pepper:staking_modal_open',
} as const;

/**
 * Type-safe storage operations
 */
export const StorageService = {
  /**
   * Get a value from storage
   */
  getString(key: string): string | undefined {
    return storage.getString(key);
  },

  /**
   * Get a parsed JSON value from storage
   */
  getObject<T>(key: string): T | undefined {
    const value = storage.getString(key);
    if (!value) return undefined;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse storage key "${key}":`, error);
      return undefined;
    }
  },

  /**
   * Get a boolean value from storage
   */
  getBoolean(key: string): boolean | undefined {
    return storage.getBoolean(key);
  },

  /**
   * Get a number value from storage
   */
  getNumber(key: string): number | undefined {
    return storage.getNumber(key);
  },

  /**
   * Set a string value in storage
   */
  setString(key: string, value: string): void {
    storage.set(key, value);
  },

  /**
   * Set an object value in storage (automatically stringified)
   */
  setObject<T>(key: string, value: T): void {
    storage.set(key, JSON.stringify(value));
  },

  /**
   * Set a boolean value in storage
   */
  setBoolean(key: string, value: boolean): void {
    storage.set(key, value);
  },

  /**
   * Set a number value in storage
   */
  setNumber(key: string, value: number): void {
    storage.set(key, value);
  },

  /**
   * Remove a key from storage
   */
  remove(key: string): void {
    storage.remove(key);
  },

  /**
   * Remove multiple keys from storage
   */
  removeMultiple(keys: string[]): void {
    keys.forEach((key) => storage.remove(key));
  },

  /**
   * Clear all storage
   */
  clearAll(): void {
    storage.clearAll();
  },

  /**
   * Check if a key exists in storage
   */
  contains(key: string): boolean {
    return storage.contains(key);
  },

  /**
   * Get all keys in storage
   */
  getAllKeys(): string[] {
    return storage.getAllKeys();
  },
};

