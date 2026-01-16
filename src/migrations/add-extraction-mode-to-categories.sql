-- Add extraction_mode to ticket_categories
-- Options:
--   'per_ticket' (default): Each ticket in PDF is one record
--   'booking_level': PDF has booking entries with pax_count (e.g., old Catacombe)
--   'per_person_type': Parse pax into separate person records by type (e.g., Adulto, Minore)

ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS extraction_mode TEXT
CHECK (extraction_mode IN ('per_ticket', 'booking_level', 'per_person_type') OR extraction_mode IS NULL)
DEFAULT 'per_ticket';

-- Update existing Catacombe category to use per_person_type
UPDATE ticket_categories
SET extraction_mode = 'per_person_type'
WHERE name ILIKE '%catacombe%';
