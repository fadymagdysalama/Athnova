-- =====================================================
-- SAVE PROGRAM FUNCTION
-- Applies all edits (program metadata, day reorders,
-- exercise upserts) in a single server-side call,
-- replacing 40+ sequential round-trips with one RPC.
-- Run this in your Supabase SQL Editor.
-- =====================================================

DROP FUNCTION IF EXISTS save_program(uuid, text, text, boolean, jsonb);

CREATE OR REPLACE FUNCTION save_program(
  p_program_id   uuid,
  p_title        text,
  p_description  text,
  p_is_coach_only boolean,
  p_days         jsonb  -- [{id, day_number, exercises: [{id|null, exercise_name, sets, reps, rest_time, notes, video_url, order_index, superset_group, weight}]}]
)
RETURNS void
LANGUAGE plpgsql
-- SECURITY DEFINER so RLS is bypassed inside the function.
-- Explicit ownership check below keeps this safe.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day  jsonb;
  v_ex   jsonb;
  v_ex_id text;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM programs
    WHERE id = p_program_id AND creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update program metadata
  UPDATE programs
  SET title = p_title, description = p_description, is_coach_only = p_is_coach_only
  WHERE id = p_program_id;

  -- Process days and exercises
  FOR v_day IN SELECT value FROM jsonb_array_elements(p_days)
  LOOP
    -- Update day_number (handles reordering)
    UPDATE program_days
    SET day_number = (v_day->>'day_number')::int
    WHERE id = (v_day->>'id')::uuid;

    -- Process exercises for this day
    FOR v_ex IN SELECT value FROM jsonb_array_elements(v_day->'exercises')
    LOOP
      v_ex_id := v_ex->>'id';

      IF v_ex_id IS NOT NULL AND v_ex_id != '' THEN
        -- Update existing exercise
        UPDATE program_exercises SET
          exercise_name  = v_ex->>'exercise_name',
          sets           = (v_ex->>'sets')::int,
          reps           = v_ex->>'reps',
          rest_time      = v_ex->>'rest_time',
          notes          = v_ex->>'notes',
          video_url      = NULLIF(v_ex->>'video_url', ''),
          order_index    = (v_ex->>'order_index')::int,
          superset_group = (v_ex->>'superset_group')::int,
          weight         = NULLIF(v_ex->>'weight', '')
        WHERE id = v_ex_id::uuid;
      ELSE
        -- Insert new exercise
        INSERT INTO program_exercises (
          day_id, exercise_name, sets, reps, rest_time,
          notes, video_url, order_index, superset_group, weight
        ) VALUES (
          (v_day->>'id')::uuid,
          v_ex->>'exercise_name',
          (v_ex->>'sets')::int,
          v_ex->>'reps',
          v_ex->>'rest_time',
          v_ex->>'notes',
          NULLIF(v_ex->>'video_url', ''),
          (v_ex->>'order_index')::int,
          (v_ex->>'superset_group')::int,
          NULLIF(v_ex->>'weight', '')
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION save_program(uuid, text, text, boolean, jsonb) TO authenticated;
