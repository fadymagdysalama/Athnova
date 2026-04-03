-- Add per-session booking & cancellation policy columns
-- Default: 2 hours before start (matches existing isWithinNoticeWindow behaviour)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS booking_cutoff_hours INT NOT NULL DEFAULT 2
    CHECK (booking_cutoff_hours >= 0),
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INT NOT NULL DEFAULT 2
    CHECK (cancellation_cutoff_hours >= 0);
