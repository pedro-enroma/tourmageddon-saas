-- Add short_code and display_order fields to ticket_categories
-- short_code: A simple code for display in column headers (e.g., "VAT", "BAS", "COL")
-- display_order: Controls the order of columns in SuperSantos page (lower = first)

ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS short_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 999;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_ticket_categories_display_order ON ticket_categories(display_order);

-- Update existing categories with default values based on name
-- You can customize these after migration
UPDATE ticket_categories SET short_code = 'VAT', display_order = 1 WHERE name ILIKE '%vaticani%' OR name ILIKE '%vatican%';
UPDATE ticket_categories SET short_code = 'BAS', display_order = 2 WHERE name ILIKE '%basilica%' OR name ILIKE '%san pietro%';
UPDATE ticket_categories SET short_code = 'COL', display_order = 3 WHERE name ILIKE '%colosseo%' OR name ILIKE '%colosseum%';
UPDATE ticket_categories SET short_code = 'POM', display_order = 4 WHERE name ILIKE '%pompei%' OR name ILIKE '%pompeii%';
UPDATE ticket_categories SET short_code = 'CAT', display_order = 5 WHERE name ILIKE '%catacomb%';
UPDATE ticket_categories SET short_code = 'ITA', display_order = 10 WHERE name ILIKE '%italo%';
UPDATE ticket_categories SET short_code = 'TRE', display_order = 11 WHERE name ILIKE '%trenitalia%';

-- Set default short_code for any remaining categories (first 3 chars of name)
UPDATE ticket_categories
SET short_code = UPPER(SUBSTRING(name FROM 1 FOR 3))
WHERE short_code IS NULL;
