// Crypto polyfill must be imported first for Web3 libraries
import 'react-native-get-random-values';
import 'react-native-reanimated';
import '../global.css';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as SplashScreen from 'expo-splash-screen';

import { Stack, useRouter } from 'expo-router';

import { QueryClientProvider } from '@tanstack/react-query';
import type { EventSubscription } from 'expo-notifications';

import { OnboardingGate } from '@/components/onboarding';
import { IS_THERMAL, pickDesign } from '@/config/design';
import { HQ_COLORS } from '@/designs/hq/theme';
import { RankUpProvider } from '@/designs/thermal/components/rank-up-overlay';
import { WalletPickerProvider } from '@/designs/thermal/components/wallet-picker';
import { THERMAL_COLORS } from '@/designs/thermal/theme';
import { WalletProfileLinker } from '@/components/wallet';
import { OnboardingProvider } from '@/contexts/onboarding-context';
import { UserProvider } from '@/contexts/user-context';
import { WalletProvider } from '@/contexts/wallet-context';

import { loadFontsAsync } from '@/lib/fonts';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
// Push notifications module is currently disabled (fully commented out).
// Import individual exports defensively – they will be undefined until re-enabled.
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getLastNotificationResponse,
  registerPushToken,
  setupNotificationChannel,
  type PushNotificationData,
} from '@/lib/push-notifications';
import { queryClient, useAppStateListener } from '@/lib/query-client';

// Import AppKit configuration and component
// This must be imported to initialize AppKit
import { appKit, AppKit } from '@/config/appkit';
import { AppKitProvider } from '@reown/appkit-react-native';

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const router = useRouter();

  // Refs for notification listeners
  const notificationReceivedRef = useRef<EventSubscription>();
  const notificationResponseRef = useRef<EventSubscription>();

  // Ref for deep link timeout cleanup
  const deepLinkTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Setup app state listener for query refetching
  useAppStateListener();

  /**
   * Handle push notification navigation
   */
  function handleNotificationNavigation(data: PushNotificationData) {
    console.log('[Layout] Handling notification:', data);

    if (data.type === 'new_proposal' && data.proposalId) {
      // Navigate to the specific proposal
      router.push(`/governance/${data.proposalId}`);
    } else if (data.screen === 'governance') {
      // Navigate to governance tab
      router.push('/(tabs)/governance');
    }
  }

  /**
   * Initialize push notifications
   */
  useEffect(() => {
    async function initPushNotifications() {
      // Push notifications module is currently disabled – skip gracefully
      if (typeof setupNotificationChannel !== 'function') {
        console.log('[Layout] Push notifications module disabled, skipping init');
        return;
      }

      try {
        // Setup Android notification channel
        await setupNotificationChannel();

        // Register push token with Supabase
        await registerPushToken();

        // Check if app was launched from a notification
        const lastResponse = await getLastNotificationResponse();
        if (lastResponse) {
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            handleNotificationNavigation(lastResponse);
          }, 500);
        }

        // Listen for notifications received while app is in foreground
        notificationReceivedRef.current = addNotificationReceivedListener(
          (notification) => {
            console.log('[Layout] Notification received in foreground:', notification);
            // Optionally invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['governance', 'proposals'] });
          },
        );

        // Listen for notification responses (when user taps notification)
        notificationResponseRef.current = addNotificationResponseListener(
          handleNotificationNavigation,
        );

        console.log('[Layout] Push notifications initialized');
      } catch (error) {
        console.error('[Layout] Failed to initialize push notifications:', error);
      }
    }

    initPushNotifications();

    // Cleanup listeners on unmount
    return () => {
      notificationReceivedRef.current?.remove();
      notificationResponseRef.current?.remove();
    };
  }, []);

  /**
   * Handle deep link returns from wallet apps (e.g., MetaMask)
   * Restores the active tab when returning from wallet
   */
  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      const url = event.url;

      // Bare scheme or WalletConnect callback = returning from wallet
      if (url === 'pepperdao://' || url === 'pepperdao:///' || url.startsWith('pepperdao://wc')) {
        const savedTab = StorageService.getString(STORAGE_KEYS.ACTIVE_TAB);
        if (savedTab && savedTab !== '/') {
          // Clear any existing timeout
          if (deepLinkTimeoutRef.current) {
            clearTimeout(deepLinkTimeoutRef.current);
          }
          deepLinkTimeoutRef.current = setTimeout(() => {
            router.replace(savedTab as any);
          }, 100);
        }
      }
    }

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => {
      subscription.remove();
      if (deepLinkTimeoutRef.current) {
        clearTimeout(deepLinkTimeoutRef.current);
      }
    };
  }, [router]);

  useEffect(() => {
    async function prepare() {
      try {
        await loadFontsAsync();
      } catch (e) {
        console.warn('Error loading fonts:', e);
      } finally {
        setFontsLoaded(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppKitProvider instance={appKit}>
        <QueryClientProvider client={queryClient}>
          <UserProvider>
            <OnboardingProvider>
              <WalletProvider>
                <WalletProfileLinker>
                  {/* Outside the gate so the thermal wallet picker also works during onboarding */}
                  <DesignProvider>
                    <OnboardingGate>
                      <Stack
                        screenOptions={
                          SCREEN_BACKGROUND ? { contentStyle: { backgroundColor: SCREEN_BACKGROUND } } : undefined
                        }
                      >
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                        <Stack.Screen
                          name="governance/[proposalId]"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="governance/create"
                          options={{
                            presentation: 'modal',
                            headerShown: false,
                          }}
                        />
                        <Stack.Screen
                          name="rulebook"
                          options={{ headerShown: false, animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="floor/[floor]"
                          options={{ headerShown: false, animation: 'slide_from_bottom' }}
                        />
                      </Stack>
                    </OnboardingGate>
                  </DesignProvider>
                  <StatusBar style={SCREEN_BACKGROUND ? 'light' : 'dark'} />

                  {/* AppKit Modal - Android requires absolute positioning with Expo Router */}
                  {Platform.OS === 'android' ? (
                    <View style={{ position: 'absolute', height: '100%', width: '100%' }}>
                      <AppKit />
                    </View>
                  ) : (
                    <AppKit />
                  )}
                </WalletProfileLinker>
              </WalletProvider>
            </OnboardingProvider>
          </UserProvider>
        </QueryClientProvider>
      </AppKitProvider>
    </SafeAreaProvider>
  );
}

/** Dark designs paint every stack screen; legacy keeps the default */
const SCREEN_BACKGROUND = pickDesign<string | null>({
  legacy: null,
  thermal: THERMAL_COLORS.void,
  hq: HQ_COLORS.bg,
});

/** Design-specific global providers (thermal: rank-up celebrations, thermal wallet picker) */
function DesignProvider({ children }: { children: ReactNode }) {
  if (!IS_THERMAL) return <>{children}</>;
  return (
    <RankUpProvider>
      <WalletPickerProvider>{children}</WalletPickerProvider>
    </RankUpProvider>
  );
}
