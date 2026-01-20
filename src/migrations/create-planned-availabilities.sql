-- Planned availabilities table for "fake" rows before Bokun availability exists
-- These allow operations to assign guides, tickets, etc. before the availability is created in Bokun

CREATE TABLE IF NOT EXISTS planned_availabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(activity_id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  local_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched')),
  matched_availability_id INTEGER REFERENCES activity_availability(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique planned slot per activity/date/time
  UNIQUE(activity_id, local_date, local_time)
);

-- Index for quick lookups by date range and activity
CREATE INDEX IF NOT EXISTS idx_planned_availabilities_date_activity
  ON planned_availabilities(activity_id, local_date);

CREATE INDEX IF NOT EXISTS idx_planned_availabilities_pending
  ON planned_availabilities(local_date) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE planned_availabilities ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all for authenticated users)
CREATE POLICY "Allow all for authenticated users" ON planned_availabilities
  FOR ALL USING (true) WITH CHECK (true);

-- Function to auto-match planned availabilities when real ones are inserted
CREATE OR REPLACE FUNCTION match_planned_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to match with a pending planned availability
  UPDATE planned_availabilities
  SET
    status = 'matched',
    matched_availability_id = NEW.id,
    updated_at = NOW()
  WHERE
    activity_id = NEW.activity_id
    AND local_date = NEW.local_date
    AND local_time = NEW.local_time::time
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-match when new availability is inserted
DROP TRIGGER IF EXISTS trigger_match_planned_availability ON activity_availability;
CREATE TRIGGER trigger_match_planned_availability
  AFTER INSERT ON activity_availability
  FOR EACH ROW
  EXECUTE FUNCTION match_planned_availability();

-- Comment on table
COMMENT ON TABLE planned_availabilities IS 'Stores planned/fake availability slots before they exist in Bokun. Allows pre-assigning guides and tickets.';

-- Add planned_availability_id to guide_assignments for pre-assigning guides
ALTER TABLE guide_assignments
ADD COLUMN IF NOT EXISTS planned_availability_id UUID REFERENCES planned_availabilities(id) ON DELETE CASCADE;

-- Make activity_availability_id nullable (can be null for planned assignments)
ALTER TABLE guide_assignments
ALTER COLUMN activity_availability_id DROP NOT NULL;

-- Add constraint: either activity_availability_id OR planned_availability_id must be set
ALTER TABLE guide_assignments
ADD CONSTRAINT check_availability_or_planned
CHECK (activity_availability_id IS NOT NULL OR planned_availability_id IS NOT NULL);

-- Index for planned assignments
CREATE INDEX IF NOT EXISTS idx_guide_assignments_planned
ON guide_assignments(planned_availability_id) WHERE planned_availability_id IS NOT NULL;

-- Update the match function to also migrate guide assignments
CREATE OR REPLACE FUNCTION match_planned_availability()
RETURNS TRIGGER AS $$
DECLARE
  matched_planned_id UUID;
BEGIN
  -- Try to match with a pending planned availability
  UPDATE planned_availabilities
  SET
    status = 'matched',
    matched_availability_id = NEW.id,
    updated_at = NOW()
  WHERE
    activity_id = NEW.activity_id
    AND local_date = NEW.local_date
    AND local_time = NEW.local_time::time
    AND status = 'pending'
  RETURNING id INTO matched_planned_id;

  -- If we found a match, migrate guide assignments
  IF matched_planned_id IS NOT NULL THEN
    UPDATE guide_assignments
    SET
      activity_availability_id = NEW.id,
      planned_availability_id = NULL
    WHERE planned_availability_id = matched_planned_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
