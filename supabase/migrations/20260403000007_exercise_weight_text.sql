-- Change weight column to free text so coaches can write e.g. "20kg", "bodyweight", "45 lbs".
-- Drop the now-unused weight_unit column.
ALTER TABLE program_exercises
  ALTER COLUMN weight TYPE TEXT USING weight::TEXT;

ALTER TABLE program_exercises
  DROP COLUMN IF EXISTS weight_unit;
