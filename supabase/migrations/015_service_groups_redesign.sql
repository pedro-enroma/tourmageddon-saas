-- Migration: Redesign Service Groups
-- Purpose: Change service groups from guide-centric to activity-centric
--
-- New Flow:
-- 1. Pick a date, see all time slots with bookings
-- 2. Select multiple services from the same time slot to create a group
-- 3. Name the group
-- 4. When a guide is assigned to any service in the group, they get assigned to all

-- ============================================
-- 1. Modify guide_service_groups table
-- ============================================

-- Drop the existing unique constraint on (guide_id, service_date, service_time)
ALTER TABLE guide_service_groups DROP CONSTRAINT IF EXISTS guide_service_groups_guide_id_service_date_service_time_key;

-- Make guide_id nullable (groups exist before guide assignment)
ALTER TABLE guide_service_groups ALTER COLUMN guide_id DROP NOT NULL;

-- Add group name column
ALTER TABLE guide_service_groups ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);

-- Add new unique constraint on (service_date, service_time, group_name)
ALTER TABLE guide_service_groups ADD CONSTRAINT guide_service_groups_date_time_name_key
  UNIQUE(service_date, service_time, group_name);

-- ============================================
-- 2. Modify guide_service_group_members table
-- ============================================

-- Drop existing unique constraint on guide_assignment_id
ALTER TABLE guide_service_group_members DROP CONSTRAINT IF EXISTS guide_service_group_members_guide_assignment_id_key;

-- Drop foreign key to guide_assignments
ALTER TABLE guide_service_group_members DROP CONSTRAINT IF EXISTS guide_service_group_members_guide_assignment_id_fkey;

-- Rename column and change type
ALTER TABLE guide_service_group_members RENAME COLUMN guide_assignment_id TO activity_availability_id;
ALTER TABLE guide_service_group_members ALTER COLUMN activity_availability_id TYPE INTEGER USING activity_availability_id::text::integer;

-- Add foreign key to activity_availability
ALTER TABLE guide_service_group_members ADD CONSTRAINT guide_service_group_members_activity_availability_fkey
  FOREIGN KEY (activity_availability_id) REFERENCES activity_availability(id) ON DELETE CASCADE;

-- Add unique constraint (one activity_availability can only be in one group)
ALTER TABLE guide_service_group_members ADD CONSTRAINT guide_service_group_members_availability_unique
  UNIQUE(activity_availability_id);

-- ============================================
-- 3. Create index for better queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_service_groups_date_time ON guide_service_groups(service_date, service_time);
CREATE INDEX IF NOT EXISTS idx_service_group_members_availability ON guide_service_group_members(activity_availability_id);
