-- =====================================================
-- PROGRAM PRIVACY FIX
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Ensure is_coach_only column exists on programs
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS is_coach_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ensure client_visible column exists on program_assignments
ALTER TABLE program_assignments
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Ensure client_visible column exists on offline_program_assignments (if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offline_program_assignments') THEN
    ALTER TABLE offline_program_assignments
      ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- 4. Add UPDATE policy so coaches can update assignment visibility
DROP POLICY IF EXISTS "Coaches can update assignments" ON program_assignments;
CREATE POLICY "Coaches can update assignments" ON program_assignments
  FOR UPDATE USING (auth.uid() = assigned_by);

-- 5. Add UPDATE policy for offline assignments
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

-- 6. Tighten the "Assigned clients can view programs" policy to enforce is_coach_only at DB level
--    (replaces the old policy that allowed any assignment regardless of coach-only flag)
DROP POLICY IF EXISTS "Assigned clients can view programs" ON programs;
CREATE POLICY "Assigned clients can view programs" ON programs
  FOR SELECT USING (
    COALESCE(is_coach_only, false) = false
    AND EXISTS (
      SELECT 1 FROM program_assignments
      WHERE program_assignments.program_id = programs.id
        AND program_assignments.client_id = auth.uid()
        AND program_assignments.client_visible = true
    )
  );

-- 7. Cascade: when a program is made private, hide it from all assigned clients
--    and when made public, reveal it to all assigned clients.
--    This trigger fires on UPDATE of is_coach_only.
CREATE OR REPLACE FUNCTION sync_assignment_visibility()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_coach_only IS DISTINCT FROM OLD.is_coach_only THEN
    UPDATE program_assignments
      SET client_visible = NOT NEW.is_coach_only
      WHERE program_id = NEW.id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offline_program_assignments') THEN
      UPDATE offline_program_assignments
        SET client_visible = NOT NEW.is_coach_only
        WHERE program_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_assignment_visibility ON programs;
CREATE TRIGGER trigger_sync_assignment_visibility
  AFTER UPDATE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION sync_assignment_visibility();
