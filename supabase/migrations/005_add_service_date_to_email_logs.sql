-- Migration: Add service_date column to email_logs
-- This allows filtering emails by the date of the service they relate to,
-- rather than just when the email was sent

-- Add service_date column (nullable to not break existing records)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS service_date DATE;

-- Create index for efficient querying by service_date
CREATE INDEX IF NOT EXISTS idx_email_logs_service_date ON email_logs(service_date);
