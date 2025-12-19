-- Fix unique constraint for guide_activity_costs to allow global costs (null guide_id)
-- In PostgreSQL, NULL values are not considered equal in unique constraints,
-- so we need partial unique indexes to handle both cases

-- Drop the existing unique constraint
ALTER TABLE guide_activity_costs DROP CONSTRAINT IF EXISTS guide_activity_costs_guide_id_activity_id_key;

-- Create partial unique index for global costs (when guide_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_activity_costs_global
ON guide_activity_costs (activity_id)
WHERE guide_id IS NULL;

-- Create partial unique index for guide-specific costs (when guide_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_activity_costs_per_guide
ON guide_activity_costs (guide_id, activity_id)
WHERE guide_id IS NOT NULL;

-- Make guide_id nullable if it isn't already
ALTER TABLE guide_activity_costs ALTER COLUMN guide_id DROP NOT NULL;
