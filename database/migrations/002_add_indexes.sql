-- Migration: Add Additional Indexes
-- Description: Adds performance indexes for common queries
-- Date: 2024-01-02

-- Add composite index for attendance queries by meeting and user
CREATE INDEX IF NOT EXISTS idx_attendance_meeting_user ON attendance(meeting_id, user_id);

-- Add index for tasks by status and deadline (for overdue queries)
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);

-- Add index for meetings by status and datetime (for upcoming meetings)
CREATE INDEX IF NOT EXISTS idx_meetings_status_datetime ON meetings(status, datetime);

-- Add full-text index for transcript search (MySQL)
-- ALTER TABLE transcripts ADD FULLTEXT INDEX idx_transcripts_raw_text (raw_text);
-- ALTER TABLE transcripts ADD FULLTEXT INDEX idx_transcripts_summary (summary_text);

-- Note: Full-text indexes are database-specific
-- For PostgreSQL, use: CREATE INDEX idx_transcripts_raw_text ON transcripts USING GIN(to_tsvector('english', raw_text));


