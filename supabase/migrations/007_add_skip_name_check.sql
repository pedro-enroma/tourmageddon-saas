-- Migration: Add skip_name_check column to ticket_categories
--
-- This column controls whether name matching is performed during voucher upload.
-- When TRUE, only quantity validation is done (total and per type counts).
-- When FALSE (default), full name matching is performed.
--
-- Use cases:
-- - Vatican Museums tickets: generic tickets without individual names, only need quantity check
-- - Colosseum tickets: have named tickets, need full name matching

-- Add the new column with default FALSE (name check enabled by default)
ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS skip_name_check BOOLEAN DEFAULT FALSE;

-- Add a comment explaining the column
COMMENT ON COLUMN ticket_categories.skip_name_check IS 'When TRUE, voucher upload skips name matching and only validates quantity (total and per type). Used for generic tickets like Vatican Museums.';
