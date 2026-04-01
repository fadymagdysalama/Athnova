// =====================================================
// Supabase Edge Function: paymob-webhook
// =====================================================
// Receives Paymob transaction callbacks and records
// successful program purchases in program_purchases.
//
// SETUP:
//   1. Set secret in Supabase Dashboard -> Settings -> Edge Function Secrets:
//        PAYMOB_HMAC_SECRET = your HMAC secret from Paymob dashboard
//   2. In Paymob Dashboard -> Developers -> Webhooks, add this URL:
//        https://pmfieyesclymxcvhulor.supabase.co/functions/v1/paymob-webhook
//   3. Deploy: supabase functions deploy paymob-webhook
//
// SECURITY: All requests are verified using HMAC-SHA512
// before any database writes are performed.
// =====================================================

// Fields Paymob uses to compute the HMAC (order matters)
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
];

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let val: unknown = obj;
  for (const part of parts) {
    if (val && typeof val === 'object') {
      val = (val as Record<string, unknown>)[part];
    } else {
      return '';
    }
  }
  return String(val ?? '');
}

async function verifyHmac(
  transaction: Record<string, unknown>,
  receivedHmac: string,
  hmacSecret: string,
): Promise<boolean> {
  const message = HMAC_FIELDS.map((field) => getNestedValue(transaction, field)).join('');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hmacSecret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const computed = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === receivedHmac;
}

Deno.serve(async (req) => {
  // Paymob sends the HMAC as a query parameter on the webhook URL
  const url = new URL(req.url);
  const hmacReceived = url.searchParams.get('hmac');
  const hmacSecret = Deno.env.get('PAYMOB_HMAC_SECRET');

  if (!hmacReceived || !hmacSecret) {
    return new Response('Missing HMAC', { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const transaction = body.obj as Record<string, unknown>;
  if (!transaction) {
    return new Response('Missing transaction object', { status: 400 });
  }

  const isValid = await verifyHmac(transaction, hmacReceived, hmacSecret);
  if (!isValid) {
    console.error('HMAC verification failed');
    return new Response('Invalid HMAC', { status: 401 });
  }

  // Only record successful, non-voided, non-refunded transactions
  if (transaction.success !== true || transaction.is_voided === true || transaction.is_refunded === true) {
    return new Response(JSON.stringify({ received: true, recorded: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // merchant_order_id format: "programId__userId__timestamp"
  const order = transaction.order as Record<string, unknown>;
  const merchantOrderId = String(order?.merchant_order_id ?? '');
  const [programId, userId] = merchantOrderId.split('__');

  if (!programId || !userId) {
    console.error('Cannot extract programId/userId from merchant_order_id:', merchantOrderId);
    return new Response('Invalid merchant_order_id', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const res = await fetch(`${supabaseUrl}/rest/v1/program_purchases`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify({ program_id: programId, client_id: userId }),
  });

  console.log('Purchase recorded:', programId, userId, res.status);

  return new Response(JSON.stringify({ received: true, recorded: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
