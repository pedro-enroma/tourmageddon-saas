-- Migration: Add credit note trigger option to invoice_rules
-- Allows specifying when credit notes should be created: on cancellation or on refund

-- Add credit_note_trigger column
ALTER TABLE invoice_rules
ADD COLUMN IF NOT EXISTS credit_note_trigger TEXT NOT NULL DEFAULT 'cancellation';

-- Add constraint for valid values
ALTER TABLE invoice_rules
ADD CONSTRAINT valid_credit_note_trigger
CHECK (credit_note_trigger IN ('cancellation', 'refund'));

-- Add comment explaining the field
COMMENT ON COLUMN invoice_rules.credit_note_trigger IS
'When to create credit notes: cancellation (on booking cancel) or refund (on Stripe refund)';
