export type UserRole = 'coach' | 'client';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  language: 'en' | 'ar';
  created_at: string;
}

export interface CoachClientRequest {
  id: string;
  coach_id: string;
  client_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  // Joined
  coach?: Profile;
  client?: Profile;
}

export interface Program {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  duration_days: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  type: 'private' | 'public';
  price: number | null;
  is_published: boolean;
  created_at: string;
}

export interface ProgramDay {
  id: string;
  program_id: string;
  day_number: number;
}

export interface ProgramExercise {
  id: string;
  day_id: string;
  exercise_name: string;
  video_url: string | null;
  sets: number;
  reps: string; // "10-12" or "10"
  rest_time: string | null;
  notes: string | null;
  order_index: number;
}

export interface ProgramAssignment {
  id: string;
  program_id: string;
  client_id: string;
  assigned_by: string;
  current_day: number;
  started_at: string;
  // Joined
  program?: Program;
}

export interface ProgramDayWithExercises extends ProgramDay {
  exercises: ProgramExercise[];
}

export interface ProgramWithDays extends Program {
  days: ProgramDayWithExercises[];
}

export interface Session {
  id: string;
  coach_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  notes: string | null;
  max_clients: number | null;
  created_at: string;
}

export interface SessionClient {
  id: string;
  session_id: string;
  client_id: string;
}

export interface SessionWithClients extends Session {
  clients: Profile[];
  coachProfile?: Profile;
}

export interface WorkoutLog {
  id: string;
  client_id: string;
  program_id: string;
  day_id: string;
  completed_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

// Progress Tracking types (planned for MVP)
export interface BodyMeasurement {
  id: string;
  client_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  notes: string | null;
  created_at: string;
}

export interface ProgressPhoto {
  id: string;
  client_id: string;
  date: string;
  photo_url: string;
  label: 'front' | 'side' | 'back' | 'other';
  created_at: string;
}

export interface StrengthLog {
  id: string;
  client_id: string;
  exercise_name: string;
  date: string;
  weight_kg: number;
  reps: number;
  sets: number;
  is_pr: boolean;
  created_at: string;
}
