-- Make difficulty nullable so we can omit it from the UI without DB errors.
-- Existing rows keep their value; new rows default to NULL.
ALTER TABLE programs
  ALTER COLUMN difficulty DROP NOT NULL,
  ALTER COLUMN difficulty SET DEFAULT NULL;
