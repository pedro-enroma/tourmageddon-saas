-- Add is_placeholder column to guides table
ALTER TABLE guides ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT false;

-- Add is_placeholder column to escorts table
ALTER TABLE escorts ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT false;

-- Create placeholder guide "Cercare"
INSERT INTO guides (first_name, last_name, email, languages, active, is_placeholder)
VALUES ('Cercare', '(Guida)', 'placeholder-guide@system.local', ARRAY['English', 'Spanish', 'Portuguese'], true, true)
ON CONFLICT (email) DO NOTHING;

-- Create placeholder escort "Cercare"
INSERT INTO escorts (first_name, last_name, email, languages, active, is_placeholder)
VALUES ('Cercare', '(Escort)', 'placeholder-escort@system.local', ARRAY['English', 'Spanish', 'Portuguese'], true, true)
ON CONFLICT (email) DO NOTHING;
