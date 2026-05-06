// =====================================================
// Supabase Edge Function: charge-recurring
// =====================================================
// Runs daily (triggered by pg_cron) to auto-renew paid
// coach subscriptions using Paymob's saved card (token)
// billing.
//
// Flow for each expired subscription:
//   1. Auth with Paymob
//   2. Create a new order for the renewal amount
//   3. Generate a payment key
//   4. Charge the saved card token
//   5a. Success → extend current_period_end by 30 days
//   5b. Failure → downgrade coach to starter, clear token
//
// Security: The endpoint is protected by x-cron-secret,
// which must match the CRON_SECRET env var. This secret
// is passed by the pg_cron job using current_setting().
// =====================================================

const TIER_PRICES_CENTS: Record<string, number> = {
  pro: 24999,    // 249 EGP
  business: 49900, // 499 EGP
};

Deno.serve(async (req: Request) => {
  // ── Security: only allow calls from the pg_cron job ──────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET');
  const incomingSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || incomingSecret !== cronSecret) {
    console.error('[charge-recurring] unauthorized request — bad or missing x-cron-secret');
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const paymobApiKey = Deno.env.get('PAYMOB_API_KEY')!;
  const integrationId = Deno.env.get('PAYMOB_INTEGRATION_ID')!;

  // ── Find subscriptions whose billing period has expired ───────────────────
  const now = new Date().toISOString();
  const subsRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_subscriptions` +
      `?current_period_end=lte.${encodeURIComponent(now)}` +
      `&payment_token=not.is.null` +
      `&tier=neq.starter` +
      `&select=coach_id,tier,payment_token`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  if (!subsRes.ok) {
    const msg = await subsRes.text();
    console.error('[charge-recurring] failed to fetch subscriptions:', msg);
    return new Response(JSON.stringify({ error: 'DB query failed' }), { status: 500 });
  }

  const subscriptions: Array<{ coach_id: string; tier: string; payment_token: string }> =
    await subsRes.json();

  console.log(`[charge-recurring] found ${subscriptions.length} subscription(s) due for renewal`);

  const results: Array<{ coachId: string; status: string; tier?: string; error?: string }> = [];

  for (const sub of subscriptions) {
    const { coach_id: coachId, tier, payment_token: savedToken } = sub;

    try {
      const amountCents = TIER_PRICES_CENTS[tier];
      if (!amountCents) {
        console.warn(`[charge-recurring] unknown tier "${tier}" for coach ${coachId}, skipping`);
        continue;
      }

      // ── Step 1: Auth ────────────────────────────────────────────────────
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: paymobApiKey }),
      });
      if (!authRes.ok) throw new Error('Paymob auth failed');
      const { token: authToken } = await authRes.json();

      // ── Step 2: Create order ────────────────────────────────────────────
      const merchantOrderId = `recur__${tier}__${coachId}__${Date.now()}`;
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
              name: `Coachera ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan — Monthly Renewal`,
              amount_cents: amountCents,
              description: `Automatic monthly renewal`,
              quantity: 1,
            },
          ],
        }),
      });
      if (!orderRes.ok) throw new Error('Failed to create Paymob order');
      const { id: paymobOrderId } = await orderRes.json();

      // ── Step 3: Payment key ─────────────────────────────────────────────
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
            email: 'noreply@coachera.app',
            floor: 'NA',
            first_name: 'Coach',
            last_name: 'User',
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
      if (!pkRes.ok) throw new Error('Failed to get payment key');
      const { token: paymentToken } = await pkRes.json();

      // ── Step 4: Charge saved card token ─────────────────────────────────
      const payRes = await fetch('https://accept.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: { identifier: savedToken, subtype: 'TOKEN' },
          payment_token: paymentToken,
        }),
      });
      const payData = await payRes.json();

      if (payData.success === true) {
        // ── Success: extend the billing period by 30 days ────────────────
        const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const updateBody: Record<string, unknown> = {
          current_period_end: nextPeriodEnd,
          payment_ref: String(payData.id ?? merchantOrderId),
        };

        // Paymob may rotate the token — update it if a new one is returned
        const newToken =
          (payData.source_data as Record<string, unknown> | undefined)?.token ??
          payData.token;
        if (newToken && typeof newToken === 'string') {
          updateBody.payment_token = newToken;
        }

        await fetch(
          `${supabaseUrl}/rest/v1/coach_subscriptions?coach_id=eq.${coachId}`,
          {
            method: 'PATCH',
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateBody),
          },
        );

        console.log(`[charge-recurring] renewed ${tier} for coach ${coachId}`);
        results.push({ coachId, status: 'renewed', tier });
      } else {
        // ── Failure: downgrade to starter and clear token ────────────────
        console.warn(
          `[charge-recurring] charge failed for coach ${coachId} (${tier}):`,
          payData.data?.message ?? JSON.stringify(payData),
        );

        await fetch(
          `${supabaseUrl}/rest/v1/coach_subscriptions?coach_id=eq.${coachId}`,
          {
            method: 'PATCH',
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tier: 'starter',
              payment_token: null,
              current_period_end: null,
              payment_ref: null,
            }),
          },
        );

        results.push({ coachId, status: 'failed_downgraded', tier });
      }
    } catch (err) {
      console.error(`[charge-recurring] unexpected error for coach ${coachId}:`, err);
      results.push({ coachId, status: 'error', error: String(err) });
    }
  }

  console.log('[charge-recurring] done. Results:', JSON.stringify(results));

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
