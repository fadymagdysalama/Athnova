-- Custom category names per coach.
-- Built-in categories (push/pull/legs/core/cardio/other) are hardcoded in the app
-- and do not live here. This table only stores coach-defined custom categories.

create table coach_exercise_categories (
  id         uuid        primary key default gen_random_uuid(),
  coach_id   uuid        not null references profiles(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  constraint coach_exercise_categories_unique unique (coach_id, name)
);

alter table coach_exercise_categories enable row level security;

create policy "Coach reads own categories"
  on coach_exercise_categories for select
  using (auth.uid() = coach_id);

create policy "Coach inserts own categories"
  on coach_exercise_categories for insert
  with check (auth.uid() = coach_id);

create policy "Coach deletes own categories"
  on coach_exercise_categories for delete
  using (auth.uid() = coach_id);

create index coach_exercise_categories_coach_id_idx on coach_exercise_categories(coach_id);
