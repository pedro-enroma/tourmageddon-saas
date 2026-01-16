-- Migration: Add default_source field to ticket_categories
-- Run this in Supabase SQL Editor

-- Add default_source to set B2C/B2B without auto-detection
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS default_source TEXT
  CHECK (default_source IN ('b2c', 'b2b', 'auto') OR default_source IS NULL)
  DEFAULT 'auto';

-- Values:
-- 'b2c' = Always mark vouchers as B2C
-- 'b2b' = Always mark vouchers as B2B
-- 'auto' = Use B2B indicator text detection (default)
