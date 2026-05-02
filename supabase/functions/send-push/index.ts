import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createJWTSign(payload: object, privateKeyPem: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID'), typ: 'JWT' };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signInput = `${headerB64}.${payloadB64}`;
  
  // Unescape any escaped characters from secret storage
  const unescapedKey = privateKeyPem
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
  
  // Try full PEM format first
  let keyData: Uint8Array;
  
  if (unescapedKey.includes('-----BEGIN PRIVATE KEY-----')) {
    // Extract just the base64 content between headers
    const match = unescapedKey.match(/-----BEGIN PRIVATE KEY-----\n?([\s\S]*?)\n?-----END PRIVATE KEY-----/);
    if (match) {
      const base64Content = match[1].replace(/\n/g, '').replace(/\r/g, '');
      keyData = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    } else {
      throw new Error('Could not parse PEM key');
    }
  } else {
    // Try raw base64
    keyData = Uint8Array.from(atob(unescapedKey.trim()), c => c.charCodeAt(0));
  }
  
  const privateKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(signInput));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  
  return `${signInput}.${sigB64}`;
}

async function sendAPNs(token: string, title: string, bodyText: string, data: Record<string, unknown>) {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.coachera.app';
  const isSandbox = Deno.env.get('APNS_IS_SANDBOX') === 'true';

  console.log('[push] APNs config:', { keyId: !!keyId, teamId: !!teamId, privateKey: !!privateKey, bundleId, isSandbox });

  if (!keyId || !teamId || !privateKey) {
    console.error('[push] APNs not configured - missing secrets');
    throw new Error('APNs not configured');
  }

  console.log('[push] Private key starts with:', privateKey.substring(0, 30));
  console.log('[push] Private key length:', privateKey.length);

  try {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await createJWTSign(
      { iss: teamId, iat: now, exp: now + 3600 },
      privateKey
    );

    const endpoint = isSandbox
      ? 'https://api.sandbox.push.apple.com/3/device/'
      : 'https://api.push.apple.com/3/device/';

    const payload = {
      aps: {
        alert: { title, body: bodyText },
        sound: 'default',
        badge: 1,
      },
      ...data,
    };

    console.log('[push] Sending to token:', token.substring(0, 30) + '...');

    const response = await fetch(`${endpoint}${token}`, {
      method: 'POST',
      headers: {
        'apns-topic': bundleId,
        'apns-priority': '10',
        'authorization': `bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('[push] APNs response:', response.status, responseText);
    
    if (!response.ok) {
      throw new Error(`APNs failed: ${response.status} - ${responseText}`);
    }
  } catch (err) {
    console.error('[push] APNs error:', err);
    throw err;
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const anonKey = req.headers.get('apikey') || supabaseAnonKey;

  console.log('[push] Auth:', authHeader ? 'has auth' : 'none');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return new Response('Missing Supabase env', { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

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

  await supabase.from('notifications').insert({
    user_id: recipient_id,
    type,
    title,
    body: msgBody,
    data: data ?? null,
    is_read: false,
  });

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', recipient_id)
    .single();

  const pushToken = profile?.push_token;

  if (pushToken) {
    console.log('[push] Token type:', pushToken.startsWith('ExponentPushToken') ? 'Expo' : 'Native');
    
    if (pushToken.startsWith('ExponentPushToken')) {
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
      try {
        await sendAPNs(pushToken, title, msgBody, { ...data, type });
      } catch (err) {
        console.error('[push] Failed to send APNs:', err);
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});