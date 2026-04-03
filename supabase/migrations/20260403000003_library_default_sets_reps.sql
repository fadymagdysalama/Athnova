-- Add optional default sets/reps columns to the exercise library table
alter table coach_exercise_library
  add column if not exists default_sets text,
  add column if not exists default_reps text;
