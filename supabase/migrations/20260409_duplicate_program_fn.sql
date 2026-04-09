-- =====================================================
-- DUPLICATE PROGRAM FUNCTION
-- Copies a program + all its days + exercises in a
-- single server-side transaction (one RPC call).
-- Run this in your Supabase SQL Editor.
-- =====================================================

-- Ensure optional columns exist before the function references them
ALTER TABLE program_exercises
  ADD COLUMN IF NOT EXISTS superset_group INT,
  ADD COLUMN IF NOT EXISTS weight TEXT;

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Drop any old version
DROP FUNCTION IF EXISTS duplicate_program(uuid);

CREATE OR REPLACE FUNCTION duplicate_program(original_id uuid)
RETURNS uuid
LANGUAGE plpgsql
-- SECURITY DEFINER so the function runs as its owner, bypassing RLS inside.
-- This is necessary because PostgreSQL CTE snapshot isolation means
-- program_days rows inserted in one CTE are invisible to the RLS policy
-- sub-SELECT run for program_exercises inserts in the same statement.
-- Explicit authorization below keeps this safe.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_orig     programs%ROWTYPE;
  v_new_id   uuid;
BEGIN
  -- Verify caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch original program
  SELECT * INTO v_orig FROM programs WHERE id = original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  -- Explicit ownership check (replaces RLS since function is SECURITY DEFINER)
  IF v_orig.creator_id != v_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Insert copied program
  INSERT INTO programs (
    creator_id, title, description, difficulty,
    duration_days, type, price, is_published, is_coach_only, tags
  ) VALUES (
    v_user_id,
    v_orig.title || ' (Copy)',
    v_orig.description,
    v_orig.difficulty,
    v_orig.duration_days,
    v_orig.type,
    v_orig.price,
    false,
    COALESCE(v_orig.is_coach_only, false),
    COALESCE(v_orig.tags, '{}')
  )
  RETURNING id INTO v_new_id;

  -- Copy days and exercises using a writable CTE
  WITH new_days AS (
    INSERT INTO program_days (program_id, day_number)
    SELECT v_new_id, day_number
    FROM program_days
    WHERE program_id = original_id
    ORDER BY day_number
    RETURNING id, day_number
  ),
  day_map AS (
    -- Map old day IDs to new day IDs via day_number
    SELECT old_d.id AS old_id, new_days.id AS new_id
    FROM program_days old_d
    JOIN new_days ON old_d.day_number = new_days.day_number
    WHERE old_d.program_id = original_id
  )
  INSERT INTO program_exercises (
    day_id, exercise_name, video_url, sets, reps,
    rest_time, notes, order_index, superset_group, weight
  )
  SELECT
    dm.new_id,
    pe.exercise_name,
    pe.video_url,
    pe.sets,
    pe.reps,
    pe.rest_time,
    pe.notes,
    pe.order_index,
    pe.superset_group,
    pe.weight
  FROM program_exercises pe
  JOIN day_map dm ON pe.day_id = dm.old_id;

  RETURN v_new_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION duplicate_program(uuid) TO authenticated;
