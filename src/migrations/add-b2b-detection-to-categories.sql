-- Migration: Add B2B detection fields to ticket_categories
-- Run this in Supabase SQL Editor

-- Add B2B indicator text (text to search for in PDF to detect B2B)
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS b2b_indicator_text TEXT;

-- Add B2B price adjustment (extra cost per ticket when B2B detected)
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS b2b_price_adjustment DECIMAL(10,2) DEFAULT 0;

-- Example: For Vatican category, set:
-- b2b_indicator_text = 'ACCORDI SPECIALI'
-- b2b_price_adjustment = 4.00
