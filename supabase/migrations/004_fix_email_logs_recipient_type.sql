-- Migration: Fix email_logs recipient_type constraint to include 'headphone'
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_recipient_type_check;

-- Add new constraint that includes 'headphone'
ALTER TABLE email_logs ADD CONSTRAINT email_logs_recipient_type_check
  CHECK (recipient_type IN ('guide', 'escort', 'headphone'));
