-- Coach Exercise Library
-- Stores reusable exercise templates per coach (name + video URL + category).
-- Sets/reps are intentionally excluded — those stay per-program.

create table coach_exercise_library (
  id           uuid        primary key default gen_random_uuid(),
  coach_id     uuid        not null references profiles(id) on delete cascade,
  name         text        not null,
  category     text        not null default 'other', -- push | pull | legs | core | cardio | other
  video_url    text,
  default_notes text,
  created_at   timestamptz not null default now()
);

alter table coach_exercise_library enable row level security;

create policy "Coach reads own library"
  on coach_exercise_library for select
  using (auth.uid() = coach_id);

create policy "Coach inserts own library"
  on coach_exercise_library for insert
  with check (auth.uid() = coach_id);

create policy "Coach updates own library"
  on coach_exercise_library for update
  using (auth.uid() = coach_id);

create policy "Coach deletes own library"
  on coach_exercise_library for delete
  using (auth.uid() = coach_id);

create index coach_exercise_library_coach_id_idx on coach_exercise_library(coach_id);
