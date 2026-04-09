const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a workout parser for a gym coaching app. Coaches describe workout days in mixed Arabic, Arabizi (Franco-Arabic), and English.

Parse the input into a structured JSON array of exercises. Return ONLY a valid JSON array — no markdown, no explanation, no code fences.

Each object in the array must have exactly these fields:
- "exercise_name": string — Exercise name in English. Translate from Arabic/Arabizi if needed.
- "sets": number — Number of sets. Default 3 if not mentioned.
- "reps": string — Reps as a string (e.g. "10", "10-12", "to failure"). Default "10".
- "rest_time": string — Rest duration (e.g. "30s", "60s", "2min"). Default "60s".
- "weight": string — Weight used (e.g. "20kg", "30lbs", "bodyweight"). Empty string if not mentioned.
- "notes": string — Any extra instructions. Empty string if none.
- "superset_group": number | null — If this exercise is paired in a superset, assign the same integer (starting from 1) to all exercises in the same superset. Use null if no superset.

Parsing rules:
- "X x Y" or "X sets Y reps" → sets=X, reps=Y
- "rayyah / راحة X sania/sanya/s/ثانية" → rest_time="Xs"
- "rayyah X dakika/دقيقة/min" → rest_time="Xmin"
- "wazn X kg/lbs" or just "X kg/lbs" → weight="Xkg" or "Xlbs"
- "superset / ss / ba3diha superset / سوبرسيت" between two exercises → they share the same superset_group number
- "w" between exercises = "and" (separate exercises)
- Multiple exercises in one sentence should each become their own object
- Arabizi numbers: wa7ed=1, itneen=2, talata=3, arba3a=4, khamsa=5, seta=6, sab3a=7, tamanya=8, tes3a=9, 3ashara=10

Example input: "bench press 4 x 10 rayyah 30 sania wazn 20kg ba3diha superset dumbbell fly 4 x 10 30kg"
Example output:
[{"exercise_name":"Bench Press","sets":4,"reps":"10","rest_time":"30s","weight":"20kg","notes":"","superset_group":1},{"exercise_name":"Dumbbell Fly","sets":4,"reps":"10","rest_time":"60s","weight":"30kg","notes":"","superset_group":1}]`;

interface ParsedExercise {
  exercise_name: string;
  sets: number;
  reps: string;
  rest_time: string;
  weight: string;
  notes: string;
  superset_group: number | null;
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
  const groqApiKey = Deno.env.get('GROQ_API_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authHeader },
  });

  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { text: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { text } = body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Call Groq
  const groqRes = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.trim() },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error('[ai-parse-workout] Groq error:', errText);
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const groqData = await groqRes.json();
  const raw = groqData?.choices?.[0]?.message?.content ?? '[]';

  let exercises: ParsedExercise[];
  try {
    // Strip any accidental markdown fences the model may add
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    exercises = parsed.map((item: Record<string, unknown>) => ({
      exercise_name: String(item.exercise_name ?? '').trim(),
      sets: Number(item.sets) || 3,
      reps: String(item.reps ?? '10').trim(),
      rest_time: String(item.rest_time ?? '60s').trim(),
      weight: String(item.weight ?? '').trim(),
      notes: String(item.notes ?? '').trim(),
      superset_group: item.superset_group != null ? Number(item.superset_group) : null,
    })).filter((e: ParsedExercise) => e.exercise_name.length > 0);
  } catch (err) {
    console.error('[ai-parse-workout] Parse error, raw:', raw, err);
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ exercises }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
