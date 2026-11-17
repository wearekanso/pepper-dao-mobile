import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';

import { supabase } from '@/config/supabase';
import { linkWallet, type Eip1193Provider, type LinkWalletResult } from '@/services/wallet-link-api';
import type { Profile, UserState } from '@/types/user';

/**
 * User Context Value
 */
interface UserContextValue extends UserState {
  refreshProfile: () => Promise<void>;
  /**
   * Link a wallet through the link-wallet function. The server says when a
   * signature is needed; the wallet is only asked when `allowSignature` is true.
   */
  updateWalletAddress: (
    address: string,
    walletProvider: Eip1193Provider | null | undefined,
    options: { allowSignature: boolean },
  ) => Promise<LinkWalletResult['status'] | null>;
  signOut: () => Promise<void>;
}

/**
 * User Action Types
 */
type UserAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTHENTICATED'; payload: { profile: Profile } }
  | { type: 'SET_PROFILE'; payload: Profile }
  | { type: 'SET_ERROR'; payload: Error }
  | { type: 'SIGN_OUT' };

/**
 * Initial state
 */
const initialState: UserState = {
  isLoading: true,
  isAuthenticated: false,
  profile: null,
  error: null,
};

/**
 * User reducer
 */
function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_AUTHENTICATED':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        profile: action.payload.profile,
        error: null,
      };
    case 'SET_PROFILE':
      return { ...state, profile: action.payload };
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'SIGN_OUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

/**
 * Fetch user profile from Supabase
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[UserContext] Error fetching profile:', error);
    return null;
  }

  return data as Profile;
}

/**
 * User Provider Component
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(userReducer, initialState);
  const queryClient = useQueryClient();

  /**
   * Initialize auth - check for existing session or sign in anonymously
   */
  useEffect(() => {
    async function initAuth() {
      try {
        // Check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[UserContext] Session error:', sessionError);
          throw sessionError;
        }

        if (session?.user) {
          // Existing session found - fetch profile
          console.log('[UserContext] Existing session found:', session.user.id);
          const profile = await fetchProfile(session.user.id);

          if (profile) {
            dispatch({ type: 'SET_AUTHENTICATED', payload: { profile } });
          } else {
            // Profile doesn't exist yet (shouldn't happen with trigger, but handle it)
            console.log('[UserContext] Profile not found, creating...');
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({ id: session.user.id });

            if (insertError && insertError.code !== '23505') {
              throw insertError;
            }

            const newProfile = await fetchProfile(session.user.id);
            if (newProfile) {
              dispatch({ type: 'SET_AUTHENTICATED', payload: { profile: newProfile } });
            }
          }
        } else {
          // No session - sign in anonymously
          console.log('[UserContext] No session, signing in anonymously...');
          const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();

          if (signInError) {
            throw signInError;
          }

          if (signInData.user) {
            // Wait a moment for the trigger to create the profile
            await new Promise(resolve => setTimeout(resolve, 500));

            const profile = await fetchProfile(signInData.user.id);
            if (profile) {
              dispatch({ type: 'SET_AUTHENTICATED', payload: { profile } });
            } else {
              // Create profile manually if trigger didn't work
              const { error: insertError } = await supabase
                .from('profiles')
                .insert({ id: signInData.user.id });

              if (insertError && insertError.code !== '23505') {
                throw insertError;
              }

              const newProfile = await fetchProfile(signInData.user.id);
              if (newProfile) {
                dispatch({ type: 'SET_AUTHENTICATED', payload: { profile: newProfile } });
              }
            }
          }
        }
      } catch (error) {
        console.error('[UserContext] Auth initialization error:', error);
        dispatch({ type: 'SET_ERROR', payload: error as Error });
      }
    }

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[UserContext] Auth state change:', event);

      if (event === 'SIGNED_OUT') {
        dispatch({ type: 'SIGN_OUT' });
      } else if (event === 'SIGNED_IN' && session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          dispatch({ type: 'SET_AUTHENTICATED', payload: { profile } });
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Refresh profile data from Supabase
   */
  const refreshProfile = useCallback(async () => {
    if (!state.profile?.id) return;

    try {
      const profile = await fetchProfile(state.profile.id);
      if (profile) {
        dispatch({ type: 'SET_PROFILE', payload: profile });
      }
    } catch (error) {
      console.error('[UserContext] Error refreshing profile:', error);
    }
  }, [state.profile?.id]);

  /**
   * Link a wallet to the profile. The server checks the wallet signature,
   * awards WALLET_CONNECTED and updates the rank; clients cannot write
   * reputation themselves.
   */
  const updateWalletAddress = useCallback(
    async (
      address: string,
      walletProvider: Eip1193Provider | null | undefined,
      options: { allowSignature: boolean },
    ) => {
      if (!state.profile) return null;

      try {
        const { profile, status } = await linkWallet({
          address,
          walletProvider,
          allowSignature: options.allowSignature,
        });
        dispatch({ type: 'SET_PROFILE', payload: profile });
        // Linking can add activities and move streaks from an older profile
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['activities'] }),
          queryClient.invalidateQueries({ queryKey: ['streaks'] }),
        ]);
        return status;
      } catch (error) {
        console.error('[UserContext] Error linking wallet:', error);
        throw error;
      }
    },
    [state.profile, queryClient],
  );

  /**
   * Sign out user
   */
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      dispatch({ type: 'SIGN_OUT' });
    } catch (error) {
      console.error('[UserContext] Error signing out:', error);
    }
  }, []);

  const value: UserContextValue = {
    ...state,
    refreshProfile,
    updateWalletAddress,
    signOut,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access user context
 */
export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
