-- Add execution_time field to invoice_rules table
-- This determines at what time of day scheduled invoices should be sent

ALTER TABLE invoice_rules
ADD COLUMN IF NOT EXISTS execution_time TIME DEFAULT '08:00:00';

COMMENT ON COLUMN invoice_rules.execution_time IS 'Time of day when scheduled invoices should be processed (e.g., 08:00, 14:00)';

-- Add scheduled_send_time to scheduled_invoices (optional, for display purposes)
-- The scheduled_send_date + rule.execution_time determines when to send
ALTER TABLE scheduled_invoices
ADD COLUMN IF NOT EXISTS scheduled_send_time TIME DEFAULT '08:00:00';

COMMENT ON COLUMN scheduled_invoices.scheduled_send_time IS 'Time of day when this invoice should be sent';
