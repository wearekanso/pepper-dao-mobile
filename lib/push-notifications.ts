// import * as Device from 'expo-device';
// import * as Notifications from 'expo-notifications';
// import { Platform } from 'react-native';

// import { supabase } from '@/config/supabase';

// /**
//  * Push Notification Configuration and Helpers for Pepper DAO
//  *
//  * Handles:
//  * - Requesting notification permissions
//  * - Registering Expo push tokens with Supabase
//  * - Setting up notification handlers
//  * - Processing incoming notifications
//  */

// // Configure how notifications appear when the app is in the foreground
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

// /**
//  * Request notification permissions from the user
//  */
// export async function requestNotificationPermissions(): Promise<boolean> {
//   if (!Device.isDevice) {
//     console.log('[Push] Must use physical device for push notifications');
//     return false;
//   }

//   const { status: existingStatus } = await Notifications.getPermissionsAsync();

//   let finalStatus = existingStatus;

//   if (existingStatus !== 'granted') {
//     const { status } = await Notifications.requestPermissionsAsync();
//     finalStatus = status;
//   }

//   if (finalStatus !== 'granted') {
//     console.log('[Push] Permission not granted');
//     return false;
//   }

//   return true;
// }

// /**
//  * Get the Expo push token for this device
//  */
// export async function getExpoPushToken(): Promise<string | null> {
//   if (!Device.isDevice) {
//     console.log('[Push] Must use physical device for push notifications');
//     return null;
//   }

//   try {
//     // Check permissions first
//     const hasPermission = await requestNotificationPermissions();
//     if (!hasPermission) {
//       return null;
//     }

//     // Get project ID from app.json
//     const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;

//     const tokenData = await Notifications.getExpoPushTokenAsync({
//       projectId,
//     });

//     console.log('[Push] Expo push token:', tokenData.data);
//     return tokenData.data;
//   } catch (error) {
//     console.error('[Push] Failed to get push token:', error);
//     return null;
//   }
// }

// /**
//  * Register the device push token with Supabase
//  */
// export async function registerPushToken(
//   walletAddress?: string,
// ): Promise<boolean> {
//   try {
//     const token = await getExpoPushToken();

//     if (!token) {
//       console.log('[Push] No token to register');
//       return false;
//     }

//     const platform = Platform.OS as 'ios' | 'android' | 'web';
//     const deviceName = Device.deviceName || undefined;

//     // Register through the RPC, not a table upsert: RLS only lets a user
//     // change their own rows, and after a reinstall the token row belongs to
//     // the previous anonymous user. The RPC hands it to the current user.
//     const { error } = await supabase.rpc('register_device_token', {
//       p_expo_push_token: token,
//       p_platform: platform,
//       p_device_name: deviceName ?? null,
//       p_wallet_address: walletAddress ?? null,
//     });

//     if (error) {
//       console.error('[Push] Failed to register token:', error);
//       return false;
//     }

//     console.log('[Push] Token registered successfully');
//     return true;
//   } catch (error) {
//     console.error('[Push] Error registering token:', error);
//     return false;
//   }
// }

// /**
//  * Update the wallet address associated with a push token
//  */
// export async function updatePushTokenWallet(
//   walletAddress: string | null,
// ): Promise<void> {
//   try {
//     const token = await getExpoPushToken();

//     if (!token) {
//       return;
//     }

//     await supabase
//       .from('device_tokens')
//       .update({
//         wallet_address: walletAddress?.toLowerCase() ?? null,
//         last_used_at: new Date().toISOString(),
//       })
//       .eq('expo_push_token', token);
//   } catch (error) {
//     console.error('[Push] Failed to update wallet:', error);
//   }
// }

// /**
//  * Deactivate the push token (when user logs out)
//  */
// export async function deactivatePushToken(): Promise<void> {
//   try {
//     const token = await getExpoPushToken();

//     if (!token) {
//       return;
//     }

//     await supabase
//       .from('device_tokens')
//       .update({ is_active: false })
//       .eq('expo_push_token', token);

//     console.log('[Push] Token deactivated');
//   } catch (error) {
//     console.error('[Push] Failed to deactivate token:', error);
//   }
// }

// /**
//  * Set up Android notification channel
//  */
// export async function setupNotificationChannel(): Promise<void> {
//   if (Platform.OS === 'android') {
//     await Notifications.setNotificationChannelAsync('governance', {
//       name: 'Governance',
//       importance: Notifications.AndroidImportance.HIGH,
//       vibrationPattern: [0, 250, 250, 250],
//       lightColor: '#FF6F3C',
//       sound: 'default',
//       enableVibrate: true,
//       enableLights: true,
//     });

//     console.log('[Push] Android notification channel created');
//   }
// }

// /**
//  * Notification data structure
//  */
// export interface PushNotificationData {
//   type: 'new_proposal' | 'vote_reminder' | 'proposal_ended' | 'proposal_executed';
//   proposalId: number;
//   screen?: string;
// }

// /**
//  * Add a listener for notification responses (when user taps notification)
//  */
// export function addNotificationResponseListener(
//   handler: (data: PushNotificationData) => void,
// ): Notifications.EventSubscription {
//   return Notifications.addNotificationResponseReceivedListener((response) => {
//     const data = response.notification.request.content.data as PushNotificationData;
//     console.log('[Push] Notification tapped:', data);
//     handler(data);
//   });
// }

// /**
//  * Add a listener for notifications received while app is in foreground
//  */
// export function addNotificationReceivedListener(
//   handler: (notification: Notifications.Notification) => void,
// ): Notifications.EventSubscription {
//   return Notifications.addNotificationReceivedListener((notification) => {
//     console.log('[Push] Notification received:', notification);
//     handler(notification);
//   });
// }

// /**
//  * Get the last notification response (for handling notification that launched the app)
//  */
// export async function getLastNotificationResponse(): Promise<PushNotificationData | null> {
//   const response = await Notifications.getLastNotificationResponseAsync();

//   if (response) {
//     return response.notification.request.content.data as PushNotificationData;
//   }

//   return null;
// }

// /**
//  * Clear all delivered notifications
//  */
// export async function clearAllNotifications(): Promise<void> {
//   await Notifications.dismissAllNotificationsAsync();
// }

// /**
//  * Get the current badge count
//  */
// export async function getBadgeCount(): Promise<number> {
//   return await Notifications.getBadgeCountAsync();
// }

// /**
//  * Set the badge count
//  */
// export async function setBadgeCount(count: number): Promise<void> {
//   await Notifications.setBadgeCountAsync(count);
// }

