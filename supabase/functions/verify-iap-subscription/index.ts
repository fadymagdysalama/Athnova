// =====================================================
// Supabase Edge Function: verify-iap-subscription
// =====================================================
// Verifies IAP receipt with Apple and updates coach subscription
// Called from the app after a successful IAP purchase
// =====================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify user is authenticated
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: authHeader,
    },
  });

  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userData = JSON.parse(await userRes.text());
  const userId: string = userData.id;
  
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { receipt?: string; productId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { receipt, productId } = body;

  if (!receipt) {
    return new Response(JSON.stringify({ error: 'Missing receipt data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isProduction = Deno.env.get('IAP_IS_PRODUCTION') === 'true';

  // Determine which Apple endpoint to use
  const appleEndpoint = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';

  // Verify receipt with Apple
  let appleResponse: Response;
  try {
    appleResponse = await fetch(appleEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receipt,
        'password': Deno.env.get('IAP_SHARED_SECRET'),
      }),
    });
  } catch (networkError) {
    console.error('Network error verifying receipt:', networkError);
    return new Response(JSON.stringify({ error: 'Failed to verify receipt with Apple' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const appleData = await appleResponse.json();

  console.log('[verify-iap-subscription] Apple response:', {
    status: appleData.status,
    productId,
    userId: userId.substring(0, 8),
  });

  if (appleData.status !== 0) {
    // Also check for status 21006 which means receipt is valid but subscription has expired
    if (appleData.status === 21006) {
      return new Response(JSON.stringify({ 
        error: 'Subscription expired',
        status: 21006 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ 
      error: 'Invalid receipt',
      appleStatus: appleData.status 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract subscription info from Apple's response
  const latestReceiptInfo = appleData.latest_receipt_info;
  
  if (!latestReceiptInfo) {
    return new Response(JSON.stringify({ error: 'No receipt info found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Determine tier based on product ID
  let tier: 'pro' = 'pro';
  const periodEnd = new Date(parseInt(latestReceiptInfo.expires_date_ms as string)).toISOString();

  // Update coach subscription in the database
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // Check if subscription exists
  const existingSubRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_subscriptions?coach_id=eq.${userId}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const existingSubs = await existingSubRes.json();
  const exists = existingSubs && existingSubs.length > 0;

  let updateRes: Response;

  if (exists) {
    // Update existing subscription
    updateRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_subscriptions?coach_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          tier: tier,
          payment_ref: latestReceiptInfo.transaction_id || `iap_${Date.now()}`,
          current_period_end: periodEnd,
        }),
      },
    );
  } else {
    // Insert new subscription
    updateRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_subscriptions`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          coach_id: userId,
          tier: tier,
          payment_ref: latestReceiptInfo.transaction_id || `iap_${Date.now()}`,
          current_period_end: periodEnd,
        }),
      },
    );
  }

  if (!updateRes.ok) {
    const errorText = await updateRes.text();
    console.error('[verify-iap-subscription] Database update failed:', errorText);
    return new Response(JSON.stringify({ error: 'Failed to update subscription' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[verify-iap-subscription] Subscription updated successfully:', {
    userId: userId.substring(0, 8),
    tier,
    periodEnd,
  });

  return new Response(JSON.stringify({ 
    success: true,
    tier,
    currentPeriodEnd: periodEnd,
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});