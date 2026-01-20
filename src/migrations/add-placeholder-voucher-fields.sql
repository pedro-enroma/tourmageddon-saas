-- Add placeholder voucher support with name deadline tracking
-- Allows manual voucher entry without names, with deadline for name finalization

-- ================================================
-- 1. Add deadline configuration to ticket_categories
-- ================================================

ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS name_deadline_days_b2c INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS name_deadline_days_b2b INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deadline_notification_emails TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Drop old column if exists (migration from single field to dual fields)
ALTER TABLE ticket_categories DROP COLUMN IF EXISTS name_deadline_days;

COMMENT ON COLUMN ticket_categories.name_deadline_days_b2c IS 'Days before visit_date when final names must be submitted for B2C vouchers. NULL = no deadline.';
COMMENT ON COLUMN ticket_categories.name_deadline_days_b2b IS 'Days before visit_date when final names must be submitted for B2B vouchers. NULL = no deadline.';
COMMENT ON COLUMN ticket_categories.deadline_notification_emails IS 'Email addresses to notify when deadline approaches or passes without replacement.';

-- ================================================
-- 2. Add placeholder tracking fields to vouchers
-- ================================================

ALTER TABLE vouchers
ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS placeholder_ticket_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS name_deadline_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deadline_status TEXT DEFAULT 'not_applicable',
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS replaced_by_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS replaces_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS voucher_source TEXT DEFAULT 'b2b';

-- Add check constraint for voucher_source
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_voucher_source_check'
  ) THEN
    ALTER TABLE vouchers
    ADD CONSTRAINT vouchers_voucher_source_check
    CHECK (voucher_source IN ('b2b', 'b2c'));
  END IF;
END $$;

-- Add check constraint for deadline_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_deadline_status_check'
  ) THEN
    ALTER TABLE vouchers
    ADD CONSTRAINT vouchers_deadline_status_check
    CHECK (deadline_status IN ('not_applicable', 'pending', 'escalated', 'resolved'));
  END IF;
END $$;

-- Index for efficient deadline monitoring queries
CREATE INDEX IF NOT EXISTS idx_vouchers_deadline_pending
  ON vouchers(name_deadline_at)
  WHERE is_placeholder = TRUE AND deadline_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_vouchers_is_placeholder
  ON vouchers(is_placeholder)
  WHERE is_placeholder = TRUE;

-- ================================================
-- 3. Create notification history table
-- ================================================

CREATE TABLE IF NOT EXISTS voucher_deadline_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('reminder', 'escalation')),
  sent_to TEXT[] NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  details JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_voucher_deadline_notifications_voucher
  ON voucher_deadline_notifications(voucher_id);

-- ================================================
-- 4. Add RLS policies for voucher_deadline_notifications
-- ================================================

ALTER TABLE voucher_deadline_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Allow authenticated users to read voucher deadline notifications" ON voucher_deadline_notifications;
DROP POLICY IF EXISTS "Allow authenticated users to insert voucher deadline notifications" ON voucher_deadline_notifications;

-- Allow authenticated users to read notifications
CREATE POLICY "Allow authenticated users to read voucher deadline notifications"
  ON voucher_deadline_notifications
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert notifications
CREATE POLICY "Allow authenticated users to insert voucher deadline notifications"
  ON voucher_deadline_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
