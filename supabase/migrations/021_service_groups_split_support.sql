-- Migration: Add split group support to service groups
-- Purpose: Allow service groups to include specific split groups, not just whole time slots
--
-- When time_slot_split_id is NULL: The whole time slot (or unsplit slot) is in the group
-- When time_slot_split_id is set: Only that specific split is in the group

-- ============================================
-- 1. Add time_slot_split_id column
-- ============================================

-- Drop the existing unique constraint on activity_availability_id
ALTER TABLE guide_service_group_members DROP CONSTRAINT IF EXISTS guide_service_group_members_availability_unique;

-- Add time_slot_split_id column (nullable - NULL means whole time slot)
ALTER TABLE guide_service_group_members ADD COLUMN IF NOT EXISTS time_slot_split_id UUID;

-- Add foreign key to time_slot_splits
ALTER TABLE guide_service_group_members ADD CONSTRAINT guide_service_group_members_split_fkey
  FOREIGN KEY (time_slot_split_id) REFERENCES time_slot_splits(id) ON DELETE CASCADE;

-- Add new unique constraint: activity_availability + split must be unique
-- This allows same availability to be in different groups if they're different splits
ALTER TABLE guide_service_group_members ADD CONSTRAINT guide_service_group_members_availability_split_unique
  UNIQUE(activity_availability_id, time_slot_split_id);

-- ============================================
-- 2. Create index for better queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_service_group_members_split ON guide_service_group_members(time_slot_split_id);
