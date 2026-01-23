-- Add status column to guide_assignments table
-- Status values: 'confirmed' (default, green), 'extra' (blue), 'to_be_confirmed' (yellow)
ALTER TABLE guide_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'confirmed';

-- Add check constraint for valid status values
ALTER TABLE guide_assignments DROP CONSTRAINT IF EXISTS guide_assignments_status_check;
ALTER TABLE guide_assignments ADD CONSTRAINT guide_assignments_status_check
  CHECK (status IN ('confirmed', 'extra', 'to_be_confirmed'));

-- Add index for status lookups
CREATE INDEX IF NOT EXISTS idx_guide_assignments_status ON guide_assignments(status);
