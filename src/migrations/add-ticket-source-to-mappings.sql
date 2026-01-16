-- Migration: Add ticket_source to product_activity_mappings table
-- Run this in Supabase SQL Editor

-- Add ticket_source column (b2c or b2b, nullable - only for entrance class tickets)
ALTER TABLE product_activity_mappings ADD COLUMN IF NOT EXISTS ticket_source TEXT
  CHECK (ticket_source IN ('b2c', 'b2b') OR ticket_source IS NULL);

-- Add index for filtering by ticket_source
CREATE INDEX IF NOT EXISTS idx_product_activity_mappings_source
  ON product_activity_mappings(ticket_source)
  WHERE ticket_source IS NOT NULL;
