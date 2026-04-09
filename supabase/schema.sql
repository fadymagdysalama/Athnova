-- =====================================================
-- COACHERA DATABASE SCHEMA
-- Run this in Supabase SQL Editor (supabase.com/dashboard)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'client')),
  avatar_url TEXT,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast username lookups (coach-client connection)
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_role ON profiles(role);

-- =====================================================
-- COACH-CLIENT CONNECTIONS
-- =====================================================
CREATE TABLE coach_client_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, client_id)
);

CREATE INDEX idx_ccr_coach ON coach_client_requests(coach_id);
CREATE INDEX idx_ccr_client ON coach_client_requests(client_id);
CREATE INDEX idx_ccr_status ON coach_client_requests(status);

-- =====================================================
-- PROGRAMS
-- =====================================================
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_days INT NOT NULL CHECK (duration_days > 0),
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  type TEXT NOT NULL CHECK (type IN ('private', 'public')),
  price DECIMAL(10,2),
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_programs_creator ON programs(creator_id);
CREATE INDEX idx_programs_type ON programs(type);

-- =====================================================
-- PROGRAM DAYS
-- =====================================================
CREATE TABLE program_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_number INT NOT NULL CHECK (day_number > 0),
  UNIQUE(program_id, day_number)
);

CREATE INDEX idx_program_days_program ON program_days(program_id);

-- =====================================================
-- PROGRAM EXERCISES
-- =====================================================
CREATE TABLE program_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id UUID NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  video_url TEXT,
  sets INT NOT NULL CHECK (sets > 0),
  reps TEXT NOT NULL, -- "10" or "10-12"
  rest_time TEXT, -- "60s" or "2min"
  notes TEXT,
  order_index INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_program_exercises_day ON program_exercises(day_id);

-- =====================================================
-- PROGRAM ASSIGNMENTS (coach → client)
-- =====================================================
CREATE TABLE program_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_day INT DEFAULT 1,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, client_id)
);

CREATE INDEX idx_assignments_client ON program_assignments(client_id);

-- =====================================================
-- PROGRAM PURCHASES (for public programs)
-- =====================================================
CREATE TABLE program_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, client_id)
);

-- =====================================================
-- SESSIONS (BOOKING)
-- =====================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  notes TEXT,
  max_clients INT CHECK (max_clients IS NULL OR max_clients > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_coach ON sessions(coach_id);
CREATE INDEX idx_sessions_date ON sessions(date);

-- Prevent overlapping sessions for the same coach
CREATE OR REPLACE FUNCTION check_session_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sessions
    WHERE coach_id = NEW.coach_id
      AND date = NEW.date
      AND status = 'scheduled'
      AND id != COALESCE(NEW.id, uuid_generate_v4())
      AND (
        (NEW.start_time, NEW.start_time + (NEW.duration_minutes || ' minutes')::INTERVAL)
        OVERLAPS
        (start_time, start_time + (duration_minutes || ' minutes')::INTERVAL)
      )
  ) THEN
    RAISE EXCEPTION 'Session overlaps with an existing session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_session_overlap
  BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION check_session_overlap();

-- =====================================================
-- SESSION CLIENTS (many-to-many for group sessions)
-- =====================================================
CREATE TABLE session_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(session_id, client_id)
);

-- =====================================================
-- WORKOUT LOGS
-- =====================================================
CREATE TABLE workout_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, program_id, day_id)
);

CREATE INDEX idx_workout_logs_client ON workout_logs(client_id);

-- =====================================================
-- CLIENT FEEDBACK
-- =====================================================
CREATE TABLE client_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  text TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- APP HELP & FEEDBACK
-- =====================================================
CREATE TABLE app_feedback (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category     TEXT        NOT NULL CHECK (category IN ('bug', 'feature', 'general', 'help')),
  subject      TEXT        NOT NULL CHECK (char_length(subject) <= 120),
  message      TEXT        NOT NULL CHECK (char_length(message) <= 2000),
  status       TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'resolved')),
  app_version  TEXT        NOT NULL DEFAULT '1.0.0',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_feedback_user     ON app_feedback(user_id);
CREATE INDEX idx_app_feedback_status   ON app_feedback(status);
CREATE INDEX idx_app_feedback_category ON app_feedback(category);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- =====================================================
-- PROGRESS TRACKING (Phase MVP addition)
-- =====================================================

-- Body Measurements
CREATE TABLE body_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg DECIMAL(5,2),
  body_fat_pct DECIMAL(4,1),
  muscle_mass_kg DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_body_measurements_client ON body_measurements(client_id);
CREATE INDEX idx_body_measurements_date ON body_measurements(client_id, date);

-- Progress Photos
CREATE TABLE progress_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  photo_url TEXT NOT NULL,
  label TEXT DEFAULT 'front' CHECK (label IN ('front', 'side', 'back', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_photos_client ON progress_photos(client_id);

-- Strength Tracking (PRs)
CREATE TABLE strength_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  date DATE NOT NULL,
  weight_kg DECIMAL(6,2) NOT NULL,
  reps INT NOT NULL,
  sets INT NOT NULL,
  is_pr BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strength_logs_client ON strength_logs(client_id);
CREATE INDEX idx_strength_logs_exercise ON strength_logs(client_id, exercise_name);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users can read all profiles (needed for username search), update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- COACH-CLIENT REQUESTS: Coaches and clients involved can see/manage
CREATE POLICY "Users can view own requests" ON coach_client_requests
  FOR SELECT USING (auth.uid() = coach_id OR auth.uid() = client_id);
CREATE POLICY "Clients can create requests" ON coach_client_requests
  FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Coaches can update request status" ON coach_client_requests
  FOR UPDATE USING (auth.uid() = coach_id);
-- Allow clients to re-send a request after being removed (rejected) by a coach
CREATE POLICY "Clients can resend rejected requests" ON coach_client_requests
  FOR UPDATE
  USING (auth.uid() = client_id AND status = 'rejected')
  WITH CHECK (auth.uid() = client_id AND status = 'pending');

-- PROGRAMS: Creators see their own, everyone sees published public programs, assigned clients see their assigned
CREATE POLICY "Creators can manage own programs" ON programs
  FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "Public programs are viewable" ON programs
  FOR SELECT USING (type = 'public' AND is_published = TRUE);
CREATE POLICY "Assigned clients can view programs" ON programs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM program_assignments
      WHERE program_assignments.program_id = programs.id
      AND program_assignments.client_id = auth.uid()
    )
  );

-- PROGRAM DAYS: Accessible if you can access the program
CREATE POLICY "Program days follow program access" ON program_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM programs WHERE programs.id = program_days.program_id
      AND (programs.creator_id = auth.uid() OR (programs.type = 'public' AND programs.is_published = TRUE))
    )
    OR EXISTS (
      SELECT 1 FROM program_assignments WHERE program_assignments.program_id = program_days.program_id
      AND program_assignments.client_id = auth.uid()
    )
  );
CREATE POLICY "Creators can manage program days" ON program_days
  FOR ALL USING (
    EXISTS (SELECT 1 FROM programs WHERE programs.id = program_days.program_id AND programs.creator_id = auth.uid())
  );

-- PROGRAM EXERCISES: Follow program day access
CREATE POLICY "Exercises follow day access" ON program_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM program_days pd
      JOIN programs p ON p.id = pd.program_id
      WHERE pd.id = program_exercises.day_id
      AND (p.creator_id = auth.uid() OR (p.type = 'public' AND p.is_published = TRUE))
    )
    OR EXISTS (
      SELECT 1 FROM program_days pd
      JOIN program_assignments pa ON pa.program_id = pd.program_id
      WHERE pd.id = program_exercises.day_id AND pa.client_id = auth.uid()
    )
  );
CREATE POLICY "Creators can manage exercises" ON program_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM program_days pd
      JOIN programs p ON p.id = pd.program_id
      WHERE pd.id = program_exercises.day_id AND p.creator_id = auth.uid()
    )
  );

-- ASSIGNMENTS: Coach (assigner) and client can see
CREATE POLICY "Assignments visible to involved parties" ON program_assignments
  FOR SELECT USING (auth.uid() = client_id OR auth.uid() = assigned_by);
CREATE POLICY "Coaches can create assignments" ON program_assignments
  FOR INSERT WITH CHECK (auth.uid() = assigned_by);
CREATE POLICY "Coaches can delete assignments" ON program_assignments
  FOR DELETE USING (auth.uid() = assigned_by);

-- PURCHASES: Client who purchased can see
CREATE POLICY "Purchases visible to buyer" ON program_purchases
  FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can create purchases" ON program_purchases
  FOR INSERT WITH CHECK (auth.uid() = client_id);

-- SESSIONS: Coach and session clients can see
CREATE POLICY "Sessions visible to coach" ON sessions
  FOR ALL USING (auth.uid() = coach_id);
CREATE POLICY "Clients can view their sessions" ON sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM session_clients WHERE session_clients.session_id = sessions.id AND session_clients.client_id = auth.uid())
  );

-- Helper: check coach ownership of a session without triggering RLS on sessions
-- (prevents infinite recursion between sessions <-> session_clients policies)
CREATE OR REPLACE FUNCTION is_session_coach(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND coach_id = auth.uid()
  );
$$;

-- SESSION CLIENTS: Coach and the client can see
CREATE POLICY "Session clients visible to participants" ON session_clients
  FOR SELECT USING (
    auth.uid() = client_id
    OR is_session_coach(session_id)
  );
CREATE POLICY "Coaches can manage session clients" ON session_clients
  FOR ALL USING (is_session_coach(session_id));
-- Clients can remove themselves from a session (leave/cancel with notice window enforced at app level)
CREATE POLICY "Clients can leave sessions" ON session_clients
  FOR DELETE USING (auth.uid() = client_id);

-- Helper: check if a session belongs to the querying client's accepted coach
-- (allows clients to discover bookable sessions without circular RLS)
CREATE OR REPLACE FUNCTION is_client_coach_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sessions s
    JOIN coach_client_requests ccr ON ccr.coach_id = s.coach_id
    WHERE s.id = p_session_id
      AND ccr.client_id = auth.uid()
      AND ccr.status = 'accepted'
  );
$$;

-- Clients can view their coach's sessions (for discovery and booking)
CREATE POLICY "Clients can view coach sessions" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = sessions.coach_id
        AND coach_client_requests.client_id = auth.uid()
        AND coach_client_requests.status = 'accepted'
    )
  );

-- Clients can book themselves into a coach's available session
CREATE POLICY "Clients can book sessions" ON session_clients
  FOR INSERT WITH CHECK (
    auth.uid() = client_id
    AND is_client_coach_session(session_id)
  );

-- WORKOUT LOGS: Own data only
CREATE POLICY "Users manage own workout logs" ON workout_logs
  FOR ALL USING (auth.uid() = client_id);

-- CLIENT FEEDBACK: Client and their coach
CREATE POLICY "Feedback visible to client" ON client_feedback
  FOR ALL USING (auth.uid() = client_id);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback" ON app_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own feedback" ON app_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- NOTIFICATIONS: Own notifications only
CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- BODY MEASUREMENTS: Own data + coach can view
CREATE POLICY "Users manage own measurements" ON body_measurements
  FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "Coaches can view client measurements" ON body_measurements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = auth.uid()
      AND coach_client_requests.client_id = body_measurements.client_id
      AND coach_client_requests.status = 'accepted'
    )
  );

-- PROGRESS PHOTOS: Own data + coach can view
CREATE POLICY "Users manage own photos" ON progress_photos
  FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "Coaches can view client photos" ON progress_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = auth.uid()
      AND coach_client_requests.client_id = progress_photos.client_id
      AND coach_client_requests.status = 'accepted'
    )
  );

-- STRENGTH LOGS: Own data + coach can view
CREATE POLICY "Users manage own strength logs" ON strength_logs
  FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "Coaches can view client strength logs" ON strength_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = auth.uid()
      AND coach_client_requests.client_id = strength_logs.client_id
      AND coach_client_requests.status = 'accepted'
    )
  );

-- =====================================================
-- PHASE 5 MIGRATION — Push Notifications
-- Run these statements in the Supabase SQL Editor
-- after the initial schema has been applied.
-- =====================================================

-- 1. Add Expo push token column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- 2. Notifications RLS — the send-push Edge Function uses the service role key
--    and therefore bypasses RLS automatically. No additional INSERT policy is
--    needed for the service role. The existing SELECT/UPDATE client policies
--    are sufficient for in-app notification reads.

-- =====================================================
-- PHASE 6 MIGRATION — Marketplace & Subscriptions
-- Run these statements in the Supabase SQL Editor
-- after the Phase 5 migration has been applied.
-- =====================================================

-- 1. Coach subscription tiers
CREATE TABLE IF NOT EXISTS coach_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  tier TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'pro')),
  payment_ref TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_subscriptions_coach ON coach_subscriptions(coach_id);

-- RLS for coach_subscriptions
ALTER TABLE coach_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own subscription" ON coach_subscriptions
  FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Coaches can insert own subscription" ON coach_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = coach_id);
CREATE POLICY "Coaches can update own subscription" ON coach_subscriptions
  FOR UPDATE USING (auth.uid() = coach_id);

-- 2. Paymob webhook inserts bypass RLS via service role -- no additional policy needed.
--    program_purchases already has INSERT policy "Clients can create purchases" for client_id = auth.uid().
--    The paymob-webhook Edge Function uses service role key and bypasses RLS.

-- 3. Ensure program_purchases index for fast lookup
CREATE INDEX IF NOT EXISTS idx_program_purchases_client ON program_purchases(client_id);
CREATE INDEX IF NOT EXISTS idx_program_purchases_program ON program_purchases(program_id);

-- 3. Session reminders via pg_cron (requires the pg_cron extension).
--    Enable the extension from the Supabase dashboard → Extensions → pg_cron.
--    Then schedule the reminder Edge Functions below:
--
--    -- 24-hour reminder (runs daily at 08:00 UTC)
--    SELECT cron.schedule(
--      'session-reminders-24h',
--      '0 8 * * *',
--      $$
--        SELECT net.http_post(
--          url := 'https://pmfieyesclymxcvhulor.supabase.co/functions/v1/session-reminders',
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--          ),
--          body := '{"window_hours": 24}'::jsonb
--        );
--      $$
--    );
--
--    -- 1-hour reminder (runs every hour)
--    SELECT cron.schedule(
--      'session-reminders-1h',
--      '0 * * * *',
--      $$
--        SELECT net.http_post(
--          url := 'https://pmfieyesclymxcvhulor.supabase.co/functions/v1/session-reminders',
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--          ),
--          body := '{"window_hours": 1}'::jsonb
--        );
--      $$
--    );

-- =====================================================
-- PHASE 7 MIGRATION — Progress Tracking
-- =====================================================
-- The body_measurements, progress_photos, and strength_logs
-- tables and their RLS policies are already defined in the
-- base schema above.
--
-- Storage bucket for progress photos:
-- Run the following in the Supabase SQL Editor (Storage section)
-- or from the Dashboard → Storage → New bucket:
--
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('progress-photos', 'progress-photos', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- Then add storage object policies (run in SQL Editor):
--
--   CREATE POLICY "Users upload own photos" ON storage.objects
--     FOR INSERT WITH CHECK (
--       bucket_id = 'progress-photos'
--       AND auth.uid()::text = (storage.foldername(name))[1]
--     );
--
--   CREATE POLICY "Progress photos publicly readable" ON storage.objects
--     FOR SELECT USING (bucket_id = 'progress-photos');
--
--   CREATE POLICY "Users delete own photos" ON storage.objects
--     FOR DELETE USING (
--       bucket_id = 'progress-photos'
--       AND auth.uid()::text = (storage.foldername(name))[1]
--     );

