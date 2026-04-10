const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const groqApiKey = Deno.env.get('GROQ_API_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify the caller is an authenticated user
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authHeader },
  });

  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userJson = await userRes.json();
  const coachId: string = userJson.id;

  let body: { question: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { question } = body;
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'question is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch coach context from database ──────────────────────────────────────

  const serviceHeaders = {
    apikey: supabaseServiceKey,
    Authorization: `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
  };

  // 1. Online clients
  const clientsRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_client_requests?coach_id=eq.${coachId}&status=eq.accepted&select=client_id,client_mode,created_at,profiles!coach_client_requests_client_id_fkey(display_name,username)`,
    { headers: serviceHeaders },
  );
  const clientsData: any[] = clientsRes.ok ? await clientsRes.json() : [];

  // 2. Program assignments for each client
  const clientIds = clientsData.map((c: any) => c.client_id);
  let assignmentsData: any[] = [];
  if (clientIds.length > 0) {
    const assignRes = await fetch(
      `${supabaseUrl}/rest/v1/program_assignments?client_id=in.(${clientIds.join(',')})&select=client_id,current_day,completed_days,started_at,programs(title,duration_days)`,
      { headers: serviceHeaders },
    );
    if (assignRes.ok) assignmentsData = await assignRes.json();
  }

  // 3. Program-day feedback from clients in the last 30 days
  let clientFeedbackData: any[] = [];
  if (clientIds.length > 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cfRes = await fetch(
      `${supabaseUrl}/rest/v1/client_feedback?client_id=in.(${clientIds.join(',')})&created_at=gt.${thirtyDaysAgo}&order=created_at.desc&select=client_id,text,created_at,programs(title),profiles!client_feedback_client_id_fkey(display_name)`,
      { headers: serviceHeaders },
    );
    if (cfRes.ok) clientFeedbackData = await cfRes.json();
  }

  // 4. Most recent body measurements per client
  let measurementsData: any[] = [];
  if (clientIds.length > 0) {
    const measRes = await fetch(
      `${supabaseUrl}/rest/v1/body_measurements?client_id=in.(${clientIds.join(',')})&order=date.desc&limit=100&select=client_id,date,weight_kg,body_fat_pct,muscle_mass_kg,notes`,
      { headers: serviceHeaders },
    );
    if (measRes.ok) measurementsData = await measRes.json();
  }

  // 5. Strength PRs per client
  let strengthData: any[] = [];
  if (clientIds.length > 0) {
    const strRes = await fetch(
      `${supabaseUrl}/rest/v1/strength_logs?client_id=in.(${clientIds.join(',')})&is_pr=eq.true&order=date.desc&limit=200&select=client_id,exercise_name,date,weight_kg,reps,sets`,
      { headers: serviceHeaders },
    );
    if (strRes.ok) strengthData = await strRes.json();
  }

  // 6. Upcoming sessions in the next 14 days
  const todayStr = new Date().toISOString().split('T')[0];
  const twoWeeksStr = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sessionsRes = await fetch(
    `${supabaseUrl}/rest/v1/sessions?coach_id=eq.${coachId}&status=eq.scheduled&date=gte.${todayStr}&date=lte.${twoWeeksStr}&select=date,start_time,duration_minutes,max_clients,session_clients(client_id)`,
    { headers: serviceHeaders },
  );
  const sessionsData: any[] = sessionsRes.ok ? await sessionsRes.json() : [];

  // ── Build context string ───────────────────────────────────────────────────

  const lines: string[] = [];

  // group helper data by client
  const latestMeasByClient: Record<string, any> = {};
  for (const m of measurementsData) {
    if (!latestMeasByClient[m.client_id]) latestMeasByClient[m.client_id] = m;
  }
  const prsByClient: Record<string, any[]> = {};
  for (const s of strengthData) {
    if (!prsByClient[s.client_id]) prsByClient[s.client_id] = [];
    prsByClient[s.client_id].push(s);
  }

  lines.push(`=== YOUR CLIENTS (${clientsData.length}) ===`);
  for (const c of clientsData) {
    const name = c.profiles?.display_name ?? 'Unknown';
    const mode = c.client_mode === 'offline' ? 'On Ground' : 'Online';
    const joined = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    lines.push(`• ${name} (@${c.profiles?.username ?? ''}) [${mode}] — joined ${joined}`);

    // Active programs
    const assignments = assignmentsData.filter((a: any) => a.client_id === c.client_id);
    if (assignments.length > 0) {
      for (const a of assignments) {
        const pct = a.programs?.duration_days > 0
          ? Math.round(((a.completed_days ?? 0) / a.programs.duration_days) * 100)
          : 0;
        lines.push(`  Program: ${a.programs?.title ?? 'Program'} — Day ${a.current_day}/${a.programs?.duration_days ?? '?'} (${pct}% done, started ${new Date(a.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`);
      }
    } else {
      lines.push('  Program: None');
    }

    // Latest body measurements
    const meas = latestMeasByClient[c.client_id];
    if (meas) {
      const measParts: string[] = [];
      if (meas.weight_kg != null) measParts.push(`Weight: ${meas.weight_kg}kg`);
      if (meas.body_fat_pct != null) measParts.push(`Body Fat: ${meas.body_fat_pct}%`);
      if (meas.muscle_mass_kg != null) measParts.push(`Muscle Mass: ${meas.muscle_mass_kg}kg`);
      if (measParts.length > 0) {
        lines.push(`  Latest Measurements (${meas.date}): ${measParts.join(', ')}`);
      }
      if (meas.notes) lines.push(`  Measurement Notes: ${meas.notes}`);
    }

    // Strength PRs
    const prs = prsByClient[c.client_id] ?? [];
    if (prs.length > 0) {
      lines.push(`  Strength PRs (${prs.length} total):`);
      for (const pr of prs.slice(0, 5)) {
        lines.push(`    - ${pr.exercise_name}: ${pr.weight_kg}kg × ${pr.reps} reps × ${pr.sets} sets (${pr.date})`);
      }
      if (prs.length > 5) lines.push(`    ... and ${prs.length - 5} more PRs`);
    }
  }

  if (clientFeedbackData.length > 0) {
    lines.push('');
    lines.push(`=== RECENT PROGRAM FEEDBACK (last 30 days) ===`);
    for (const fb of clientFeedbackData) {
      const clientName = fb.profiles?.display_name ?? fb.client_id;
      const programName = fb.programs?.title ?? 'Unknown Program';
      const comment = fb.text ? `"${fb.text}"` : '(no text)';
      const date = new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      lines.push(`• ${clientName} on "${programName}" (${date}): ${comment}`);
    }
  }

  if (sessionsData.length > 0) {
    lines.push('');
    lines.push(`=== UPCOMING SESSIONS (next 14 days) ===`);
    for (const s of sessionsData) {
      const participantCount = (s.session_clients ?? []).length;
      const maxStr = s.max_clients ? `/${s.max_clients}` : '';
      lines.push(`• ${s.date} at ${s.start_time} — ${s.duration_minutes} min, ${participantCount}${maxStr} participants`);
    }
  }

  const context = lines.join('\n');

  if (clientsData.length === 0) {
    return new Response(
      JSON.stringify({ answer: "You don't have any connected clients yet. Once clients join, I'll be able to give you updates about their progress, sessions, and feedback." }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Ask Groq ──────────────────────────────────────────────────────────────

  const systemPrompt = `You are an AI assistant inside a coaching app. You help coaches stay on top of their clients.

You have access to the following data about the coach's clients:

${context}

The data includes: active program progress, latest body measurements (weight, body fat, muscle mass), strength PRs, program-day feedback text, and upcoming sessions.

Answer the coach's question using only the data provided above. Be concise, friendly, and actionable.
If a client name is mentioned in the question, match it case-insensitively.
If the data doesn't contain enough info to answer fully, say so honestly.
Do not invent data that isn't in the context.
Respond in the same language the coach used (Arabic or English).`;

  const groqRes = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question.trim() },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error('[ai-clients-assistant] Groq error:', errText);
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const groqData = await groqRes.json();
  const answer: string = groqData.choices?.[0]?.message?.content?.trim() ?? '';

  if (!answer) {
    return new Response(JSON.stringify({ error: 'Empty AI response' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
