import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Send Notification Edge Function
 *
 * Sends push notifications to registered devices via Expo Push API.
 * Called by sync-proposals when new proposals are indexed.
 *
 * Deployment: supabase functions deploy send-notification
 * (verify_jwt = false in config.toml; only requests with the service role key
 * are accepted, checked in isServiceRequest)
 *
 * Usage:
 * POST /functions/v1/send-notification
 * Body: { type: 'new_proposal', proposalId: '<256-bit id as a decimal string>', title: 'PAT-1' }
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface NotificationPayload {
  type: 'new_proposal' | 'vote_reminder' | 'proposal_ended' | 'proposal_executed';
  /** 256-bit on-chain id as a decimal string (too large for a JS number) */
  proposalId: string;
  title: string;
  body?: string;
}

/**
 * Send push notifications via Expo Push API
 * Batches notifications in groups of 100 as recommended by Expo
 */
async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) {
    console.log('No messages to send');
    return;
  }

  const BATCH_SIZE = 100;
  const batches: ExpoPushMessage[][] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Expo push API error:', response.status, errorText);
        continue;
      }

      const result = await response.json();
      console.log('Expo push result:', JSON.stringify(result));

      // Check for individual errors in the response
      if (result.data) {
        for (let i = 0; i < result.data.length; i++) {
          const ticket = result.data[i];
          if (ticket.status === 'error') {
            console.error(`Push error for ${batch[i].to}:`, ticket.message);
          }
        }
      }
    } catch (error) {
      console.error('Failed to send batch:', error);
    }
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only the server (sync-proposals) may send pushes. Every app user has a
  // valid JWT through anonymous sign-in, so a JWT alone is not enough.
  if (!isServiceRequest(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse the notification payload
    const payload: NotificationPayload = await req.json();

    if (!payload.type || !payload.proposalId || !payload.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, proposalId, title' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if we've already sent this notification (deduplication)
    const { data: existingNotification } = await supabase
      .from('notification_history')
      .select('id')
      .eq('proposal_id', payload.proposalId)
      .eq('notification_type', payload.type)
      .single();

    if (existingNotification) {
      console.log(`Notification already sent for proposal ${payload.proposalId}, type ${payload.type}`);
      return new Response(JSON.stringify({ message: 'Notification already sent', skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get all active device tokens
    const { data: deviceTokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('expo_push_token')
      .eq('is_active', true);

    if (tokensError) {
      console.error('Failed to fetch device tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch device tokens' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log('No device tokens registered');
      return new Response(JSON.stringify({ message: 'No device tokens registered', sent: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build notification message based on type
    let notificationTitle = '';
    let notificationBody = '';

    switch (payload.type) {
      case 'new_proposal':
        notificationTitle = '🗳️ New Proposal';
        notificationBody = payload.title;
        break;
      case 'vote_reminder':
        notificationTitle = '⏰ Vote Reminder';
        notificationBody = `Don't forget to vote on: ${payload.title}`;
        break;
      case 'proposal_ended':
        notificationTitle = '🏁 Voting Ended';
        notificationBody = `Voting has ended for: ${payload.title}`;
        break;
      case 'proposal_executed':
        notificationTitle = '✅ Proposal Executed';
        notificationBody = `${payload.title} has been executed`;
        break;
      default:
        notificationTitle = 'Pepper DAO';
        notificationBody = payload.body || payload.title;
    }

    // Build messages for all devices
    const messages: ExpoPushMessage[] = deviceTokens
      .filter((dt) => dt.expo_push_token && dt.expo_push_token.startsWith('ExponentPushToken'))
      .map((dt) => ({
        to: dt.expo_push_token,
        title: notificationTitle,
        body: notificationBody,
        sound: 'default',
        priority: 'high',
        channelId: 'governance',
        data: {
          type: payload.type,
          proposalId: payload.proposalId,
          screen: 'governance',
        },
      }));

    console.log(`Sending ${messages.length} notifications`);

    // Send notifications
    await sendExpoPushNotifications(messages);

    // Record in notification history to prevent duplicates
    await supabase.from('notification_history').insert({
      proposal_id: payload.proposalId,
      notification_type: payload.type,
      recipients_count: messages.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${messages.length} notifications`,
        sent: messages.length,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('Notification error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
});


/**
 * True when the request carries this project's service role key, which only
 * server code (sync-proposals) has.
 */
function isServiceRequest(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  return !!serviceKey && !!token && timingSafeEqual(token, serviceKey);
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
