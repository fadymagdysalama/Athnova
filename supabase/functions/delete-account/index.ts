import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw new Error('Failed to fetch profile');
    }

    const userRole = profile?.role;

    await supabase.from('notifications').delete().eq('user_id', userId);
    await supabase.from('strength_logs').delete().eq('client_id', userId);
    await supabase.from('progress_photos').delete().eq('client_id', userId);
    await supabase.from('body_measurements').delete().eq('client_id', userId);
    await supabase.from('client_feedback').delete().eq('client_id', userId);
    await supabase.from('workout_logs').delete().eq('client_id', userId);
    await supabase.from('program_purchases').delete().eq('client_id', userId);
    await supabase.from('program_assignments').delete().eq('client_id', userId);
    await supabase.from('session_clients').delete().eq('client_id', userId);
    await supabase.from('coach_client_requests').delete().eq('client_id', userId);
    await supabase.from('coach_client_requests').delete().eq('coach_id', userId);

    if (userRole === 'coach') {
      await supabase.from('coach_client_requests').delete().eq('coach_id', userId);
      const { data: coachSessions } = await supabase.from('sessions').select('id').eq('coach_id', userId);
      if (coachSessions?.length) {
        const sessionIds = coachSessions.map(s => s.id);
        await supabase.from('session_clients').delete().in('session_id', sessionIds);
      }
      await supabase.from('sessions').delete().eq('coach_id', userId);
      await supabase.from('program_assignments').delete().eq('assigned_by', userId);
      await supabase.from('programs').delete().eq('creator_id', userId);
      await supabase.from('coach_subscriptions').delete().eq('coach_id', userId);
    }

    await supabase.from('profiles').delete().eq('id', userId);

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Auth deletion error:', deleteAuthError);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});