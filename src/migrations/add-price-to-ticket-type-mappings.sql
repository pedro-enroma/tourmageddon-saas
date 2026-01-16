-- Add price field to ticket_type_mappings for per-type pricing
-- Used when extraction_mode = 'per_person_type' (e.g., Catacombe with Adulto/Minore)

ALTER TABLE ticket_type_mappings
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN ticket_type_mappings.price IS 'Cost per ticket of this type. Used when category extraction_mode is per_person_type.';
