-- Add rule_triggered and manual notification types to booking_notifications table

-- Update notification_type check constraint to include rule_triggered and manual types
ALTER TABLE booking_notifications DROP CONSTRAINT IF EXISTS booking_notifications_notification_type_check;
ALTER TABLE booking_notifications ADD CONSTRAINT booking_notifications_notification_type_check
  CHECK (notification_type IN (
    'age_mismatch',
    'swap_fixed',
    'missing_dob',
    'other',
    'voucher_deadline_missed',
    'voucher_deadline_warning',
    'rule_triggered',
    'manual'
  ));
