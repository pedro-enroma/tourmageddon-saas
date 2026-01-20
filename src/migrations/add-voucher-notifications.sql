-- Add voucher-related notification support to booking_notifications table

-- 1. Make activity_booking_id nullable (voucher notifications don't have one)
ALTER TABLE booking_notifications
ALTER COLUMN activity_booking_id DROP NOT NULL;

-- 2. Add related_voucher_id column
ALTER TABLE booking_notifications
ADD COLUMN IF NOT EXISTS related_voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS related_activity_availability_id INTEGER,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. Update notification_type check constraint to include voucher types
ALTER TABLE booking_notifications DROP CONSTRAINT IF EXISTS booking_notifications_notification_type_check;
ALTER TABLE booking_notifications ADD CONSTRAINT booking_notifications_notification_type_check
  CHECK (notification_type IN ('age_mismatch', 'swap_fixed', 'missing_dob', 'other', 'voucher_deadline_missed', 'voucher_deadline_warning'));

-- 4. Create index for voucher notifications
CREATE INDEX IF NOT EXISTS idx_booking_notifications_voucher_id
  ON booking_notifications(related_voucher_id)
  WHERE related_voucher_id IS NOT NULL;

-- 5. Ensure at least one of activity_booking_id or related_voucher_id is set
-- (commenting out for now as it might be too restrictive)
-- ALTER TABLE booking_notifications ADD CONSTRAINT booking_notifications_requires_reference
--   CHECK (activity_booking_id IS NOT NULL OR related_voucher_id IS NOT NULL);
