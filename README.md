# Athnova

A mobile-first fitness coaching platform built with React Native (Expo) and Supabase.

Designed for coaches to manage clients, programs, and sessions — and for clients to follow structured training with full progress tracking.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo SDK 54 (iOS & Android) |
| Routing | Expo Router v6 (file-based) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (username/password via fake email) |
| State | Zustand |
| i18n | i18next + react-i18next (English + Arabic/RTL) |
| Storage | Supabase Storage (progress photos, videos) |
| Push Notifications | Expo Push Notifications |

All infrastructure runs on **Supabase free tier** — zero cost for development and early production.

---

## Project Phases

### ✅ Phase 1 — Foundation (Complete)
- Expo Router project setup with TypeScript
- Supabase client + PostgreSQL schema with Row Level Security
- Username/password authentication (no email required)
- Profile creation with role selection (Coach or Client)
- Tab navigation shell (Home, Programs, Schedule, Clients/Progress, Profile)
- i18n setup for English and Arabic (RTL)
- Light theme system (colors, spacing, typography)

### 🔲 Phase 2 — Coach–Client Connection
- Coach shares username with client
- Client sends connection request
- Coach sees pending requests and accepts/rejects
- After acceptance: client appears in coach's client list
- Coach can add notes per client

### 🔲 Phase 3 — Program Builder & Viewer
- Coach creates programs with day-by-day structure
- Each day contains exercises with: name, video link, sets, reps, rest time, notes
- Coach assigns private programs to specific clients
- Client follows program day-by-day and marks workouts complete
- Platform creates public programs for purchase

### ✅ Phase 4 — Booking & Scheduling
- Coach creates sessions: date, time, duration, one or multiple clients (group sessions)
- Overlap prevention enforced at DB level (PostgreSQL trigger)
- Calendar view for coach and client
- Client cancellation with minimum notice window
- Coach can reschedule sessions
- Cancellation notifications sent to all affected participants

### 🔲 Phase 5 — Notifications & Reminders
- Session reminders: 24 hours and 1 hour before
- New program assigned notification
- Program updated notification
- Missed workout reminder
- Daily workout nudge
- Streak encouragement
- Coach alerts: new client request, client feedback submitted, client uploaded video
- Powered by Expo Push Notifications + Supabase pg_cron scheduled jobs

### 🔲 Phase 6 — Marketplace
- Public programs listed in browse section
- Program cards show: title, difficulty, duration, preview days
- One-time purchase flow (Stripe)
- Purchased programs unlock full content
- Coach subscription tiers: Starter / Pro / Business

### 🔲 Phase 7 — Progress Tracking
- Body measurements over time: weight, body fat %, muscle mass
- Progress photos: front / side / back with date comparison
- Strength logs: exercise, weight, reps, sets, PR detection
- Charts showing trends over time
- Coach view of client progress data

---

## Database Schema

### `profiles`
Stores all user accounts (coaches and clients).

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | References `auth.users` |
| username | TEXT UNIQUE | Used for coach–client connection |
| display_name | TEXT | Shown in UI |
| role | TEXT | `coach` or `client` |
| avatar_url | TEXT | Optional |
| language | TEXT | `en` or `ar` |
| created_at | TIMESTAMPTZ | |

---

### `coach_client_requests`
Manages the connection between a coach and a client.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| coach_id | UUID (FK → profiles) | |
| client_id | UUID (FK → profiles) | |
| status | TEXT | `pending` / `accepted` / `rejected` |
| created_at | TIMESTAMPTZ | |

---

### `programs`
Training programs created by coaches (private) or the platform (public).

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| creator_id | UUID (FK → profiles) | |
| title | TEXT | |
| description | TEXT | |
| duration_days | INT | e.g. 30 |
| difficulty | TEXT | `beginner` / `intermediate` / `advanced` |
| type | TEXT | `private` (coach) or `public` (platform) |
| price | DECIMAL | Null for private programs |
| is_published | BOOLEAN | Public visibility flag |

---

### `program_days`
One row per day of a program.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| program_id | UUID (FK → programs) | |
| day_number | INT | 1-indexed |

---

### `program_exercises`
Exercises within a program day.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| day_id | UUID (FK → program_days) | |
| exercise_name | TEXT | |
| video_url | TEXT | YouTube link |
| sets | INT | |
| reps | TEXT | `"10"` or `"10-12"` |
| rest_time | TEXT | e.g. `"60s"` |
| notes | TEXT | Optional coaching notes |
| order_index | INT | Display order |

---

### `program_assignments`
Coach assigns a program to a client.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| program_id | UUID (FK → programs) | |
| client_id | UUID (FK → profiles) | |
| assigned_by | UUID (FK → profiles) | Coach's ID |
| current_day | INT | Tracks progress |
| started_at | TIMESTAMPTZ | |

---

### `program_purchases`
Client purchases a public program.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| program_id | UUID (FK → programs) | |
| client_id | UUID (FK → profiles) | |
| purchased_at | TIMESTAMPTZ | |

---

### `sessions`
Scheduled coaching sessions.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| coach_id | UUID (FK → profiles) | |
| date | DATE | |
| start_time | TIME | |
| duration_minutes | INT | |
| status | TEXT | `scheduled` / `cancelled` / `completed` |
| notes | TEXT | Optional |

A PostgreSQL trigger prevents overlapping sessions for the same coach.

---

### `session_clients`
Many-to-many: multiple clients can join one session (group sessions).

| Column | Type | Notes |
|---|---|---|
| session_id | UUID (FK → sessions) | |
| client_id | UUID (FK → profiles) | |

---

### `workout_logs`
Tracks when a client completes a program day.

| Column | Type | Notes |
|---|---|---|
| client_id | UUID (FK → profiles) | |
| program_id | UUID (FK → programs) | |
| day_id | UUID (FK → program_days) | |
| completed_at | TIMESTAMPTZ | |

---

### `client_feedback`
Client submits feedback or video for coach review.

| Column | Type | Notes |
|---|---|---|
| client_id | UUID (FK → profiles) | |
| program_id | UUID (FK → programs) | |
| day_id | UUID (FK → program_days) | |
| text | TEXT | Written feedback |
| video_url | TEXT | Video link or upload |

---

### `notifications`
In-app notification store for all users.

| Column | Type | Notes |
|---|---|---|
| user_id | UUID (FK → profiles) | |
| type | TEXT | Notification category |
| title | TEXT | |
| body | TEXT | |
| data | JSONB | Extra payload |
| is_read | BOOLEAN | |

---

### `body_measurements` *(Phase 7)*
Client body stats over time.

| Column | Type | Notes |
|---|---|---|
| client_id | UUID (FK → profiles) | |
| date | DATE | |
| weight_kg | DECIMAL | |
| body_fat_pct | DECIMAL | |
| muscle_mass_kg | DECIMAL | |
| notes | TEXT | |

---

### `progress_photos` *(Phase 7)*
Before/after photos for visual progress tracking.

| Column | Type | Notes |
|---|---|---|
| client_id | UUID (FK → profiles) | |
| date | DATE | |
| photo_url | TEXT | Supabase Storage URL |
| label | TEXT | `front` / `side` / `back` / `other` |

---

### `strength_logs` *(Phase 7)*
Lifting records and PR tracking.

| Column | Type | Notes |
|---|---|---|
| client_id | UUID (FK → profiles) | |
| exercise_name | TEXT | |
| date | DATE | |
| weight_kg | DECIMAL | |
| reps | INT | |
| sets | INT | |
| is_pr | BOOLEAN | Auto-detected personal record |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Xcode (iOS) or Android Studio
- Supabase account (free)

### Setup

```bash
# Install dependencies
npm install

# Install iOS pods
cd ios && pod install && cd ..
```

### Supabase Configuration
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. In Authentication → Providers → Email: enable Email, disable "Confirm email"
4. Paste your URL and anon key into `src/lib/supabase.ts`

### Run

```bash
# Start Metro bundler
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android
npx expo run:android
```
