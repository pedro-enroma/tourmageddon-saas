-- Add visibility_locked column to activity_availability table
-- When true, the status will only be updated when Bokun sends CLOSED
ALTER TABLE activity_availability ADD COLUMN IF NOT EXISTS visibility_locked BOOLEAN DEFAULT false;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_activity_availability_visibility_locked ON activity_availability(visibility_locked) WHERE visibility_locked = true;

-- Create a trigger function that respects visibility_locked when updating status
CREATE OR REPLACE FUNCTION check_visibility_lock_on_status_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If visibility_locked is true and the new status is not CLOSED, keep the old status
  IF OLD.visibility_locked = true AND NEW.status IS DISTINCT FROM 'CLOSED' THEN
    NEW.status := OLD.status;
  END IF;

  -- If the new status is CLOSED, also unlock visibility
  IF NEW.status = 'CLOSED' THEN
    NEW.visibility_locked := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS visibility_lock_trigger ON activity_availability;
CREATE TRIGGER visibility_lock_trigger
  BEFORE UPDATE ON activity_availability
  FOR EACH ROW
  EXECUTE FUNCTION check_visibility_lock_on_status_update();
