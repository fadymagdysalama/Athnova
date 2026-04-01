// =====================================================
// Supabase Edge Function: create-paymob-order
// =====================================================
// Creates a Paymob payment order for purchasing a
// public marketplace program (3-step Paymob flow).
//
// SETUP:
//   Set these secrets in Supabase Dashboard -> Settings -> Edge Function Secrets:
//     PAYMOB_API_KEY         = your Paymob API key
//     PAYMOB_INTEGRATION_ID  = card integration ID from Paymob dashboard
//     PAYMOB_IFRAME_ID       = iframe ID from Paymob dashboard
//   Deploy: supabase functions deploy create-paymob-order
//
// FLOW:
//   1. App calls this function with { programId, userId }
//   2. Function authenticates with Paymob -> creates order -> creates payment key
//   3. Returns { paymentUrl } which the app opens in the device browser
//   4. User pays -> Paymob calls the paymob-webhook function
//   5. Webhook records the purchase in program_purchases
// =====================================================

const PAYMOB_BASE = 'https://accept.paymob.com/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const { programId, userId } = await req.json();

    if (!programId || !userId) {
      return new Response(JSON.stringify({ error: 'Missing programId or userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paymobApiKey = Deno.env.get('PAYMOB_API_KEY')!;
    const integrationId = Deno.env.get('PAYMOB_INTEGRATION_ID')!;
    const iframeId = Deno.env.get('PAYMOB_IFRAME_ID')!;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authHeader,
      },
    });
    const userResponseText = await userRes.text();

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userData = JSON.parse(userResponseText || '{}');
    const authenticatedUserId = userData.id as string | undefined;

    if (!authenticatedUserId || authenticatedUserId !== userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate program exists and has a paid price
    const programRes = await fetch(
      `${supabaseUrl}/rest/v1/programs?id=eq.${programId}&select=price,title`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    const programResponseText = await programRes.text();
    const [program] = JSON.parse(programResponseText || '[]');

    if (!program) {
      return new Response(JSON.stringify({ error: 'Program not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!program.price || program.price <= 0) {
      return new Response(JSON.stringify({ error: 'Program is free - no payment needed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block duplicate purchases
    const purchaseRes = await fetch(
      `${supabaseUrl}/rest/v1/program_purchases?program_id=eq.${programId}&client_id=eq.${userId}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    const purchaseResponseText = await purchaseRes.text();
    const existing = JSON.parse(purchaseResponseText || '[]');
    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: 'Already purchased' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Paymob amounts are in the smallest currency unit (piastres for EGP)
    const amountCents = Math.round(program.price * 100);

    // Step 1: Authenticate with Paymob
    const authRes = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: paymobApiKey }),
    });
    const authResponseText = await authRes.text();
    const { token: authToken } = JSON.parse(authResponseText || '{}');
    if (!authToken) {
      return new Response(JSON.stringify({ error: 'Paymob authentication failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Create order
    // merchant_order_id encodes programId and userId so the webhook can parse them
    const merchantOrderId = `${programId}__${userId}__${Date.now()}`;
    const orderRes = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
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
            name: program.title,
            amount_cents: amountCents,
            description: `Coachera program: ${program.title}`,
            quantity: 1,
          },
        ],
      }),
    });
    const orderResponseText = await orderRes.text();
    const { id: orderId } = JSON.parse(orderResponseText || '{}');
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Paymob order creation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Create payment key
    const pkRes = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderId,
        billing_data: {
          apartment: 'NA',
          email: `${userId}@coachera.app`,
          floor: 'NA',
          first_name: 'Coachera',
          street: 'NA',
          building: 'NA',
          phone_number: '+201000000000',
          shipping_method: 'NA',
          postal_code: 'NA',
          city: 'Cairo',
          country: 'EGY',
          last_name: 'Client',
          state: 'NA',
        },
        currency: 'EGP',
        integration_id: parseInt(integrationId, 10),
        lock_order_when_paid: false,
      }),
    });
    const paymentKeyResponseText = await pkRes.text();
    const { token: paymentKey } = JSON.parse(paymentKeyResponseText || '{}');
    if (!paymentKey) {
      return new Response(JSON.stringify({ error: 'Paymob payment key creation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Append redirect_url as a query param so Paymob redirects back to the app after payment
    const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}&redirect_url=${encodeURIComponent('coachera://')}`;

    return new Response(
      JSON.stringify({ paymentUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-paymob-order] unhandled error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
