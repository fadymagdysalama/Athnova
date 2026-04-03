-- Add optional weight and weight_unit columns to program_exercises.
ALTER TABLE program_exercises
  ADD COLUMN IF NOT EXISTS weight NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'kg'
    CHECK (weight_unit IN ('kg', 'lb'));
