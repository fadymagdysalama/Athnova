-- =====================================================
-- PHASE — App Help & Feedback
-- =====================================================

-- Table to store in-app feedback & support requests submitted by any user.
-- Coaches and clients can both submit. Status is managed by the admin via
-- the Supabase dashboard (or a future admin panel).

CREATE TABLE IF NOT EXISTS app_feedback (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category     TEXT        NOT NULL CHECK (category IN ('bug', 'feature', 'general', 'help')),
  subject      TEXT        NOT NULL CHECK (char_length(subject) <= 120),
  message      TEXT        NOT NULL CHECK (char_length(message) <= 2000),
  status       TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'resolved')),
  app_version  TEXT        NOT NULL DEFAULT '1.0.0',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_user     ON app_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_app_feedback_status   ON app_feedback(status);
CREATE INDEX IF NOT EXISTS idx_app_feedback_category ON app_feedback(category);

-- RLS
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback
CREATE POLICY "Users can insert own feedback" ON app_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can view their own past submissions
CREATE POLICY "Users can view own feedback" ON app_feedback
  FOR SELECT USING (auth.uid() = user_id);
