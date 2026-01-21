-- Add planned_availability_id to vouchers for linking to planned slots
ALTER TABLE vouchers
ADD COLUMN IF NOT EXISTS planned_availability_id UUID REFERENCES planned_availabilities(id) ON DELETE SET NULL;

-- Index for planned vouchers
CREATE INDEX IF NOT EXISTS idx_vouchers_planned_availability
ON vouchers(planned_availability_id) WHERE planned_availability_id IS NOT NULL;

-- When a planned availability gets matched to a real one, migrate vouchers too
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

    -- Also migrate vouchers
    UPDATE vouchers
    SET
      activity_availability_id = NEW.id,
      planned_availability_id = NULL
    WHERE planned_availability_id = matched_planned_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN vouchers.planned_availability_id IS 'Links voucher to a planned slot before real availability exists';
