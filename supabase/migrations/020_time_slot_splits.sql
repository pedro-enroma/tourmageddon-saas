-- Migration: 020_time_slot_splits.sql
-- Purpose: Add tables for splitting time slots into sub-groups with separate guide/voucher assignments

-- Table 1: time_slot_splits - Stores split groups for time slots
CREATE TABLE IF NOT EXISTS time_slot_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
  split_name VARCHAR(100) NOT NULL,
  guide_id UUID REFERENCES guides(guide_id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique split names within a time slot
  UNIQUE(activity_availability_id, split_name)
);

-- Enable RLS
ALTER TABLE time_slot_splits ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable read for authenticated users" ON time_slot_splits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON time_slot_splits
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON time_slot_splits
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON time_slot_splits
  FOR DELETE TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_time_slot_splits_availability ON time_slot_splits(activity_availability_id);
CREATE INDEX idx_time_slot_splits_guide ON time_slot_splits(guide_id);

-- Table 2: time_slot_split_bookings - Maps individual bookings to splits
CREATE TABLE IF NOT EXISTS time_slot_split_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id UUID NOT NULL REFERENCES time_slot_splits(id) ON DELETE CASCADE,
  activity_booking_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each booking can only be in one split
  UNIQUE(activity_booking_id)
);

-- Enable RLS
ALTER TABLE time_slot_split_bookings ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable read for authenticated users" ON time_slot_split_bookings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON time_slot_split_bookings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON time_slot_split_bookings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON time_slot_split_bookings
  FOR DELETE TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_split_bookings_split ON time_slot_split_bookings(split_id);
CREATE INDEX idx_split_bookings_booking ON time_slot_split_bookings(activity_booking_id);

-- Table 3: time_slot_split_vouchers - Maps vouchers to specific splits
CREATE TABLE IF NOT EXISTS time_slot_split_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id UUID NOT NULL REFERENCES time_slot_splits(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each voucher can only be in one split
  UNIQUE(voucher_id)
);

-- Enable RLS
ALTER TABLE time_slot_split_vouchers ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable read for authenticated users" ON time_slot_split_vouchers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON time_slot_split_vouchers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON time_slot_split_vouchers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON time_slot_split_vouchers
  FOR DELETE TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_split_vouchers_split ON time_slot_split_vouchers(split_id);
CREATE INDEX idx_split_vouchers_voucher ON time_slot_split_vouchers(voucher_id);

-- Trigger to update updated_at on time_slot_splits
CREATE OR REPLACE FUNCTION update_time_slot_splits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_slot_splits_updated_at
  BEFORE UPDATE ON time_slot_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_time_slot_splits_updated_at();

-- Comments for documentation
COMMENT ON TABLE time_slot_splits IS 'Stores sub-groups for splitting time slots into multiple guide assignments';
COMMENT ON COLUMN time_slot_splits.activity_availability_id IS 'Reference to the time slot being split';
COMMENT ON COLUMN time_slot_splits.split_name IS 'User-defined name for the split group (e.g., "Group A", "Group B")';
COMMENT ON COLUMN time_slot_splits.guide_id IS 'Optional guide assigned to this split';

COMMENT ON TABLE time_slot_split_bookings IS 'Maps individual bookings to their assigned split group';
COMMENT ON COLUMN time_slot_split_bookings.activity_booking_id IS 'Reference to the booking assigned to this split';

COMMENT ON TABLE time_slot_split_vouchers IS 'Maps vouchers to their assigned split group';
COMMENT ON COLUMN time_slot_split_vouchers.voucher_id IS 'Reference to the voucher assigned to this split';

-- Cleanup function: Remove orphaned split_bookings when activity_bookings are deleted
-- Note: We don't use FK because activity_bookings is synced from Bokun
CREATE OR REPLACE FUNCTION cleanup_orphaned_split_bookings()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM time_slot_split_bookings
  WHERE activity_booking_id = OLD.activity_booking_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to cleanup when bookings are deleted
DROP TRIGGER IF EXISTS cleanup_split_bookings_on_delete ON activity_bookings;
CREATE TRIGGER cleanup_split_bookings_on_delete
  AFTER DELETE ON activity_bookings
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_split_bookings();

-- Also add a function to periodically clean orphans (for safety)
CREATE OR REPLACE FUNCTION cleanup_all_orphaned_split_bookings()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM time_slot_split_bookings
  WHERE activity_booking_id NOT IN (
    SELECT activity_booking_id FROM activity_bookings
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
