-- Migration: Add ticket_class to ticket_categories table
-- Run this in Supabase SQL Editor

-- Add ticket_class column to ticket_categories
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS ticket_class TEXT
  DEFAULT 'entrance'
  CHECK (ticket_class IN ('entrance', 'transport', 'other'));

-- Add index for filtering by ticket_class
CREATE INDEX IF NOT EXISTS idx_ticket_categories_class
  ON ticket_categories(ticket_class);
