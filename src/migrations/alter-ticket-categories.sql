-- Migration: Add product_names and guide_requires_ticket to ticket_categories
-- Run this in Supabase SQL Editor

-- Add product_names array column (stores product names that auto-detect this category)
ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS product_names TEXT[] DEFAULT '{}';

-- Add guide_requires_ticket boolean (whether guides need a named ticket for this category)
ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS guide_requires_ticket BOOLEAN DEFAULT true;

-- Update existing categories with sample product names
UPDATE ticket_categories
SET product_names = ARRAY['COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI']
WHERE name = 'Colosseo 24H';

UPDATE ticket_categories
SET product_names = ARRAY['COLOSSEO FULL EXPERIENCE ARENA - GRUPPI']
WHERE name = 'Full Experience Arena';

UPDATE ticket_categories
SET product_names = ARRAY['COLOSSEO FULL EXPERIENCE SOTTERRANEI - GRUPPI']
WHERE name = 'Full Experience Sotterranei';

UPDATE ticket_categories
SET product_names = ARRAY['MUSEI VATICANI - GRUPPI'],
    guide_requires_ticket = false
WHERE name = 'Musei Vaticani';
