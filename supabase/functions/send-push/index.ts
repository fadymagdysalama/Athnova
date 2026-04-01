import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // Require the caller to be authenticated (any valid Supabase JWT)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let body: {
    recipient_id: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const { recipient_id, type, title, body: msgBody, data } = body;

  if (!recipient_id || !type || !title || !msgBody) {
    return new Response('Missing required fields: recipient_id, type, title, body', {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Use service role to bypass RLS for inserts and profile reads
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Insert the in-app notification
  const { error: insertError } = await supabase.from('notifications').insert({
    user_id: recipient_id,
    type,
    title,
    body: msgBody,
    data: data ?? null,
    is_read: false,
  });

  if (insertError) {
    console.error('Failed to insert notification:', insertError.message);
    // Continue — push delivery is still attempted
  }

  // 2. Fetch recipient's push token
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', recipient_id)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ success: true, push: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pushToken: string | null = (profile as any).expo_push_token ?? null;

  // 3. Send Expo push notification if token exists
  if (pushToken && pushToken.startsWith('ExponentPushToken')) {
    const pushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body: msgBody,
      data: { ...data, type },
      badge: 1,
    };

    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pushMessage),
      });
    } catch (err) {
      console.error('Expo push delivery failed:', err);
    }
  }

  return new Response(JSON.stringify({ success: true, push: !!pushToken }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
