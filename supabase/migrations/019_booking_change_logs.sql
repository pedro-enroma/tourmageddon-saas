-- Migration: booking_change_logs
-- Description: Track changes made to bookings via the search/edit feature

CREATE TABLE IF NOT EXISTS booking_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_booking_id BIGINT NOT NULL,
  booking_id BIGINT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  change_type TEXT NOT NULL, -- 'slot_change', 'participant_update', 'type_change'
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  participant_id BIGINT, -- pricing_category_booking_id if applicable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_booking_change_logs_booking ON booking_change_logs(activity_booking_id);
CREATE INDEX idx_booking_change_logs_created ON booking_change_logs(created_at DESC);
CREATE INDEX idx_booking_change_logs_user ON booking_change_logs(user_id);

-- Enable RLS
ALTER TABLE booking_change_logs ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can view all logs
CREATE POLICY "Authenticated users can view booking change logs"
  ON booking_change_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: authenticated users can insert logs
CREATE POLICY "Authenticated users can insert booking change logs"
  ON booking_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
