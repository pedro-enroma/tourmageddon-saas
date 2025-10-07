-- Migration: Create manual_participant_updates log table
-- Date: 2025-01-07
-- Description: Tracks manual updates to participant data made through the dashboard

CREATE TABLE IF NOT EXISTS manual_participant_updates (
  log_id BIGSERIAL PRIMARY KEY,
  activity_booking_id BIGINT NOT NULL,
  pricing_category_booking_id BIGINT NOT NULL,
  booked_title TEXT,
  passenger_first_name TEXT,
  passenger_last_name TEXT,
  passenger_date_of_birth DATE,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_manual_participant_updates_activity_booking_id
  ON manual_participant_updates(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_manual_participant_updates_pricing_category_booking_id
  ON manual_participant_updates(pricing_category_booking_id);
CREATE INDEX IF NOT EXISTS idx_manual_participant_updates_updated_at
  ON manual_participant_updates(updated_at);

COMMENT ON TABLE manual_participant_updates IS 'Tracks manual updates to participant data made through the Pax Names dashboard';
COMMENT ON COLUMN manual_participant_updates.updated_by IS 'User who made the manual update (e.g., dashboard_user, admin)';
