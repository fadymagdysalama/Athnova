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
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    encoder.encode(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(signInput));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  
  return `${signInput}.${sigB64}`;
}

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

  if (!keyId || !teamId || !privateKey) return;

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
      aps: { alert: { title, body }, sound: 'default', badge: 1 },
      ...data,
    };

    await fetch(`${endpoint}${token}`, {
      method: 'POST',
      headers: {
        'apns-topic': bundleId,
        'apns-priority': '10',
        'authorization': `bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[push] APNs error:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing env', { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id, date, start_time, coach_id,
      session_clients (client_id, reminder_sent_24h, reminder_sent_1h)
    `)
    .eq('status', 'scheduled')
    .gte('date', now.toISOString().split('T')[0])
    .lte('date', new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  if (!sessions) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let count = 0;
  for (const session of sessions) {
    const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
    const hoursUntil = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    const clients = (session as any).session_clients as {
      client_id: string;
      reminder_sent_24h?: boolean;
      reminder_sent_1h?: boolean;
    }[];

    for (const client of clients) {
      if (hoursUntil <= 24 && hoursUntil > 1 && !client.reminder_sent_24h) {
        await sendReminder(supabase, client.client_id, session, '24h');
        await supabase.from('session_clients').update({ reminder_sent_24h: true })
          .eq('session_id', session.id).eq('client_id', client.client_id);
        count++;
      }

      if (hoursUntil <= 1 && hoursUntil > 0 && !client.reminder_sent_1h) {
        await sendReminder(supabase, client.client_id, session, '1h');
        await supabase.from('session_clients').update({ reminder_sent_1h: true })
          .eq('session_id', session.id).eq('client_id', client.client_id);
        count++;
      }
    }
  }

  return new Response(JSON.stringify({ sent: count }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function sendReminder(supabase: any, clientId: string, session: any, type: '24h' | '1h') {
  const is24h = type === '24h';
  const title = is24h ? 'Session Tomorrow' : 'Session in 1 Hour';
  const body = is24h
    ? `Your session is tomorrow at ${session.start_time}`
    : `Your session starts at ${session.start_time}`;

  await supabase.from('notifications').insert({
    user_id: clientId,
    type: is24h ? 'session_reminder_24h' : 'session_reminder_1h',
    title,
    body,
    data: { session_id: session.id },
    is_read: false,
  });

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', clientId)
    .single();

  const token = profile?.push_token;
  if (!token) return;

  if (token.startsWith('ExponentPushToken')) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: { session_id: session.id, type: is24h ? 'session_reminder_24h' : 'session_reminder_1h' },
        badge: 1,
      }),
    });
  } else {
    await sendAPNs(token, title, body, { session_id: session.id, type: is24h ? 'session_reminder_24h' : 'session_reminder_1h' });
  }
}