-- =====================================================
-- COACH WORKOUT LOG POLICIES
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Allow coaches to READ workout logs for their accepted clients
--    (fixes client-progress.tsx showing no completed days for coaches)
DROP POLICY IF EXISTS "Coaches can view client workout logs" ON workout_logs;
CREATE POLICY "Coaches can view client workout logs" ON workout_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = auth.uid()
        AND coach_client_requests.client_id = workout_logs.client_id
        AND coach_client_requests.status = 'accepted'
    )
  );

-- 2. Allow coaches to INSERT workout logs for their accepted clients
--    (fixes "security policy violation" when ending a live session)
DROP POLICY IF EXISTS "Coaches can log client workouts" ON workout_logs;
CREATE POLICY "Coaches can log client workouts" ON workout_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_client_requests
      WHERE coach_client_requests.coach_id = auth.uid()
        AND coach_client_requests.client_id = workout_logs.client_id
        AND coach_client_requests.status = 'accepted'
    )
  );

-- 3. Ensure the program_assignments UPDATE policy exists
--    (in case the 20260406_program_privacy_fix.sql migration was not yet applied)
DROP POLICY IF EXISTS "Coaches can update assignments" ON program_assignments;
CREATE POLICY "Coaches can update assignments" ON program_assignments
  FOR UPDATE USING (auth.uid() = assigned_by);

-- 4. Ensure the offline_program_assignments UPDATE policy exists
--    (same guard as above for offline clients)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offline_program_assignments') THEN
    EXECUTE '
      DROP POLICY IF EXISTS "Coaches can update offline assignments" ON offline_program_assignments;
      CREATE POLICY "Coaches can update offline assignments" ON offline_program_assignments
        FOR UPDATE USING (auth.uid() = assigned_by);
    ';
  END IF;
END $$;

-- 5. Ensure coaches can fully manage offline_client_packages
--    (offline_clients.coach_id links coaches to their offline clients)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offline_client_packages') THEN
    EXECUTE '
      ALTER TABLE offline_client_packages ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Coaches manage own offline packages" ON offline_client_packages;
      CREATE POLICY "Coaches manage own offline packages" ON offline_client_packages
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM offline_clients
            WHERE offline_clients.id = offline_client_packages.offline_client_id
              AND offline_clients.coach_id = auth.uid()
          )
        );
    ';
  END IF;
END $$;
