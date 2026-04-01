// =====================================================
// Supabase Edge Function: paymob-subscription
// =====================================================
// Creates a Paymob payment order for coach subscription
// tier upgrades (pro / business). Returns a paymentUrl
// that the app opens in the device browser.
//
// The paymob-webhook function handles the callback and
// upserts the coach_subscriptions row when payment succeeds.
//
// merchantOrderId format: "sub__{tier}__{coachId}__{timestamp}"
// =====================================================

const TIER_PRICES_CENTS: Record<string, number> = {
  pro: 19900,       // 199 EGP
  business: 49900,  // 499 EGP
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  // Get the authenticated user from the JWT in the Authorization header
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: authHeader,
    },
  });

  const userResponseText = await userRes.text();

  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userData = JSON.parse(userResponseText || '{}');
  const userId: string = userData.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { tier?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { tier } = body;
  if (!tier || !TIER_PRICES_CENTS[tier]) {
    return new Response(JSON.stringify({ error: 'Invalid tier. Must be "pro" or "business".' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const amountCents = TIER_PRICES_CENTS[tier];
  const merchantOrderId = `sub__${tier}__${userId}__${Date.now()}`;

  // Fetch coach profile for billing details
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=display_name,username`,
    {
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
    },
  );
  const profileResponseText = await profileRes.text();
  const profiles = JSON.parse(profileResponseText || '[]');
  const profile = profiles?.[0] ?? {};
  const displayName: string = profile.display_name ?? profile.username ?? 'Coach';

  const paymobApiKey = Deno.env.get('PAYMOB_API_KEY')!;
  const integrationId = Deno.env.get('PAYMOB_INTEGRATION_ID')!;
  const iframeId = Deno.env.get('PAYMOB_IFRAME_ID')!;

  // ─── Step 1: Authenticate with Paymob ────────────────────────────────────
  const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: paymobApiKey }),
  });

  const authResponseText = await authRes.text();

  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: 'Paymob auth failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { token: authToken } = JSON.parse(authResponseText || '{}');

  // ─── Step 2: Create an order ──────────────────────────────────────────────
  const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: 'EGP',
      merchant_order_id: merchantOrderId,
      items: [
        {
          name: `Coachera ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
          amount_cents: amountCents,
          description: `Monthly subscription — ${tier} tier`,
          quantity: 1,
        },
      ],
    }),
  });

  const orderResponseText = await orderRes.text();

  if (!orderRes.ok) {
    return new Response(JSON.stringify({ error: 'Failed to create Paymob order' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderData = JSON.parse(orderResponseText || '{}');
  const paymobOrderId: number = orderData.id;

  // ─── Step 3: Generate a payment key ───────────────────────────────────────
  const pkRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: paymobOrderId,
      billing_data: {
        apartment: 'NA',
        email: userData.email ?? 'noreply@coachera.app',
        floor: 'NA',
        first_name: displayName.split(' ')[0] ?? displayName,
        last_name: displayName.split(' ').slice(1).join(' ') || 'Coach',
        street: 'NA',
        building: 'NA',
        phone_number: '+20000000000',
        shipping_method: 'NA',
        postal_code: 'NA',
        city: 'Cairo',
        country: 'EG',
        state: 'Cairo',
      },
      currency: 'EGP',
      integration_id: parseInt(integrationId, 10),
    }),
  });

  const paymentKeyResponseText = await pkRes.text();

  if (!pkRes.ok) {
    return new Response(JSON.stringify({ error: 'Failed to generate payment key' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { token: paymentKey } = JSON.parse(paymentKeyResponseText || '{}');
  // Append redirect_url as a query param so Paymob redirects back to the app after payment
  const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}&redirect_url=${encodeURIComponent('coachera://')}`;

  return new Response(JSON.stringify({ paymentUrl }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
