const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a multi-day workout program builder for a gym coaching app. Coaches describe their full program (multiple days) in mixed Arabic, Arabizi (Franco-Arabic), and English.

Parse the input into a structured JSON object. Return ONLY valid JSON — no markdown, no explanation, no code fences.

The JSON must follow this exact shape:
{
  "program": [
    {
      "day_number": 1,
      "exercises": [
        {
          "exercise_name": string,
          "sets": number,
          "reps": string,
          "rest_time": string,
          "weight": string,
          "notes": string,
          "superset_group": number | null
        }
      ]
    }
  ]
}

Rules:
- Identify each day by markers like "Day 1", "اليوم 1", "يوم الصدر", "Chest Day", "Day 1:", etc.
- If the coach does not explicitly label days with numbers but uses topic names (e.g. "Chest", "Back", "Legs"), infer day_number as 1, 2, 3... in the order they appear.
- If only a single day's worth of exercises is provided with no day markers, return it as day_number 1.
- Fill exercises exactly as per the per-workout rules:
  - "exercise_name": string — English. Translate from Arabic/Arabizi if needed.
  - "sets": number — Default 3 if not mentioned.
  - "reps": string — e.g. "10", "10-12", "to failure". Default "10".
  - "rest_time": string — e.g. "30s", "60s", "2min". Default "60s".
  - "weight": string — e.g. "20kg". Empty string if not mentioned.
  - "notes": string — Empty string if none.
  - "superset_group": number | null — Same integer for exercises in the same superset, null otherwise.
- "X x Y" or "X sets Y reps" → sets=X, reps=Y
- "rayyah / راحة X sania" → rest_time="Xs"
- "superset / ss / ba3diha superset / سوبرسيت" between two exercises → same superset_group
- Arabizi numbers: wa7ed=1, itneen=2, talata=3, arba3a=4, khamsa=5, seta=6, sab3a=7, tamanya=8, tes3a=9, 3ashara=10

Return ONLY the JSON object. No other text.`;

interface ParsedExercise {
  exercise_name: string;
  sets: number;
  reps: string;
  rest_time: string;
  weight: string;
  notes: string;
  superset_group: number | null;
}

interface ParsedDay {
  day_number: number;
  exercises: ParsedExercise[];
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
      max_tokens: 4096,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error('[ai-parse-program] Groq error:', errText);
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const groqData = await groqRes.json();
  const rawContent: string = groqData.choices?.[0]?.message?.content ?? '';

  // Strip markdown fences if present
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let parsed: { program: ParsedDay[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[ai-parse-program] JSON parse error. Raw content:', rawContent);
    return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!parsed?.program || !Array.isArray(parsed.program)) {
    return new Response(JSON.stringify({ error: 'Unexpected AI response shape' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Sanitize each day
  const program: ParsedDay[] = parsed.program
    .filter((d) => typeof d.day_number === 'number')
    .sort((a, b) => a.day_number - b.day_number)
    .map((d) => ({
      day_number: d.day_number,
      exercises: (d.exercises ?? []).map((e) => ({
        exercise_name: String(e.exercise_name ?? ''),
        sets: typeof e.sets === 'number' ? e.sets : 3,
        reps: String(e.reps ?? '10'),
        rest_time: String(e.rest_time ?? '60s'),
        weight: String(e.weight ?? ''),
        notes: String(e.notes ?? ''),
        superset_group: typeof e.superset_group === 'number' ? e.superset_group : null,
      })),
    }));

  return new Response(JSON.stringify({ program }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
