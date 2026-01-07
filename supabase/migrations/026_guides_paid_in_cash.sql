-- Migration: Add paid_in_cash field to guides table
-- Guides flagged as paid_in_cash will be excluded from Finance Cost Reports
-- but still shown in SuperSantos recap page

ALTER TABLE guides ADD COLUMN IF NOT EXISTS paid_in_cash BOOLEAN DEFAULT FALSE;

-- Add comment explaining the field
COMMENT ON COLUMN guides.paid_in_cash IS 'If true, guide is paid in cash and excluded from Finance Cost Reports';
