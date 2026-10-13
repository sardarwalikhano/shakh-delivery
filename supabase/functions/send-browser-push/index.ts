import { sendPushNotification } from 'npm:@mmmike/web-push@1.0.1/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const encoder = new TextEncoder();

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { notification_id, user_id, signature } = await request.json();
    if (typeof notification_id !== 'string' || typeof user_id !== 'string' || typeof signature !== 'string') return json(400, { error: 'Invalid event' });

    const configResponse = await rest('rpc/get_push_runtime_config', { method: 'POST', body: '{}' });
    if (!configResponse.ok) return json(503, { error: 'Push configuration unavailable' });
    const config = await configResponse.json();
    const hmacKey = await crypto.subtle.importKey('raw', encoder.encode(config.webhook_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = toHex(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(`${notification_id}:${user_id}`)));
    if (expected.length !== signature.length) return json(401, { error: 'Invalid signature' });
    let signatureMatches = 0;
    for (let index = 0; index < expected.length; index += 1) signatureMatches |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    if (signatureMatches !== 0) return json(401, { error: 'Invalid signature' });

    const notificationResponse = await rest(`notifications?id=eq.${encodeURIComponent(notification_id)}&user_id=eq.${encodeURIComponent(user_id)}&select=id,title_ku,body_ku,route,created_at`);
    if (!notificationResponse.ok) return json(502, { error: 'Notification lookup failed' });
    const [notification] = await notificationResponse.json();
    if (!notification) return json(404, { error: 'Notification not found' });

    const subscriptionsResponse = await rest(`push_subscriptions?user_id=eq.${encodeURIComponent(user_id)}&select=endpoint,subscription`);
    if (!subscriptionsResponse.ok) return json(502, { error: 'Subscription lookup failed' });
    const subscriptions = await subscriptionsResponse.json();
    const route = typeof notification.route === 'string' && notification.route.startsWith('/') && !notification.route.startsWith('//') ? notification.route : '/notifications';
    const payload = {
      title: notification.title_ku,
      body: notification.body_ku,
      url: route,
      tag: `shakh-${notification.id}`,
    };

    const staleEndpoints: string[] = [];
    const settled = await Promise.allSettled(subscriptions.map(async ({ endpoint, subscription }: { endpoint: string; subscription: unknown }) => {
      const endpointUrl = new URL(endpoint);
      const allowedHost = endpointUrl.protocol === 'https:' && (
        endpointUrl.hostname === 'fcm.googleapis.com'
        || endpointUrl.hostname.endsWith('.push.services.mozilla.com')
        || endpointUrl.hostname.endsWith('.push.apple.com')
      );
      if (!allowedHost) throw new Error('Unsupported push service host');
      const sent = await sendPushNotification(subscription, payload, {
        publicKey: config.vapid_public_key,
        privateKey: config.vapid_private_key,
        subject: 'mailto:support@daim-post.online',
      }, { ttl: 3600, timeoutMs: 8000 });
      if (!sent) staleEndpoints.push(endpoint);
    }));

    if (staleEndpoints.length) await Promise.all(staleEndpoints.map((endpoint) => rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' })));
    const failed = settled.filter((result) => result.status === 'rejected').length;
    return json(200, { delivered: subscriptions.length - staleEndpoints.length - failed, failed, removed: staleEndpoints.length });
  } catch {
    return json(500, { error: 'Push delivery failed' });
  }
});

