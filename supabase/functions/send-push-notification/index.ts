import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createJWT, verifyJWT } from 'https://esm.sh/jose@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendAPNs(token: string, title: string, body: string, data: Record<string, unknown>) {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.coachera.app';
  const isSandbox = Deno.env.get('APNS_IS_SANDBOX') === 'true';

  if (!keyId || !teamId || !privateKey) {
    console.log('[push] APNs not configured');
    return;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await createJWT(
      { alg: 'ES256', kid: keyId, typ: 'JWT' },
      { iss: teamId, iat: now, exp: now + 3600 },
      privateKey,
      { header: { alg: 'ES256', kid: keyId } }
    );

    const endpoint = isSandbox
      ? 'https://api.sandbox.push.apple.com/3/device/'
      : 'https://api.push.apple.com/3/device/';

    const payload = {
      aps: {
        alert: { title, body },
        sound: 'default',
        badge: 1,
      },
      ...data,
    };

    const response = await fetch(`${endpoint}${token}`, {
      method: 'POST',
      headers: {
        'apns-topic': bundleId,
        'apns-priority': '10',
        'authorization': `bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('[push] APNs response:', response.status);
  } catch (err) {
    console.error('[push] APNs error:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing Supabase env', { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isAnonKey = authHeader.startsWith('Bearer ');

  if (!isServiceRole && !isAnonKey) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let body: { recipient_id: string; type: string; title: string; body: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const { recipient_id, type, title, body: msgBody, data } = body;
  if (!recipient_id || !type || !title || !msgBody) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', recipient_id)
    .single();

  const pushToken = profile?.push_token;

  console.log('[push] recipient:', recipient_id);
  console.log('[push] token:', pushToken ? pushToken.substring(0, 20) + '...' : 'none');

  if (pushToken) {
    if (pushToken.startsWith('ExponentPushToken')) {
      // Expo push (for Expo builds)
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title,
          body: msgBody,
          data: { ...data, type },
          badge: 1,
        }),
      });
    } else {
      // Native iOS token - use APNs
      await sendAPNs(pushToken, title, msgBody, { ...data, type });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});