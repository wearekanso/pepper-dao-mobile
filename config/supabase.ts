import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/supabase';

/**
 * Supabase Configuration for Pepper DAO
 *
 * This client is used to:
 * - Fetch cached governance proposals (fast reads)
 * - Register device push notification tokens
 * - Query sync state
 *
 * Environment Variables:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing environment variables: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // Enable session persistence for anonymous auth
    autoRefreshToken: true,
    storage: {
      getItem: (key: string) => {
        try {
          // Use synchronous MMKV storage for Supabase auth
          const { storage } = require('@/lib/storage');
          return storage.getString(key) || null;
        } catch {
          return null;
        }
      },
      setItem: (key: string, value: string) => {
        try {
          const { storage } = require('@/lib/storage');
          storage.set(key, value);
        } catch {
          // Ignore storage errors
        }
      },
      removeItem: (key: string) => {
        try {
          const { storage } = require('@/lib/storage');
          storage.delete(key);
        } catch {
          // Ignore storage errors
        }
      },
    },
  },
});

