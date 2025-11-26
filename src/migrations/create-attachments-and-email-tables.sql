-- Migration: Create tables for service attachments and email templates
-- Run this in Supabase SQL Editor

-- 1. Create storage bucket for attachments (if not exists)
-- Run this first in the Supabase Dashboard > Storage or via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-attachments', 'service-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policy for service attachments (allow public read, authenticated write)
CREATE POLICY "Allow public read access on service-attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-attachments');

CREATE POLICY "Allow insert access on service-attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'service-attachments');

CREATE POLICY "Allow delete access on service-attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'service-attachments');

-- 3. Service attachments table (links files to activity_availability)
CREATE TABLE IF NOT EXISTS service_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT DEFAULT 'application/pdf',
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by TEXT
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_service_attachments_availability
ON service_attachments(activity_availability_id);

-- RLS policies for service_attachments
ALTER TABLE service_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on service_attachments"
ON service_attachments FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on email_templates"
ON email_templates FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default email template
INSERT INTO email_templates (name, subject, body, is_default)
VALUES (
    'Daily Service Assignment',
    'Your Service Assignment for {{date}}',
    'Hello {{name}},

You have been assigned to the following service:

**Activity:** {{activity_title}}
**Date:** {{date}}
**Time:** {{time}}
**Participants:** {{pax_count}} pax

{{#if has_attachments}}
Please find the attached documents for this service.
{{/if}}

{{#if daily_list}}
The daily list with all bookings is also attached.
{{/if}}

Best regards,
EnRoma.com Team',
    true
) ON CONFLICT DO NOTHING;

-- 5. Email log table (track sent emails)
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    recipient_type TEXT CHECK (recipient_type IN ('guide', 'escort')),
    recipient_id TEXT,
    activity_availability_id INTEGER REFERENCES activity_availability(id),
    template_id UUID REFERENCES email_templates(id),
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_availability ON email_logs(activity_availability_id);

-- RLS policies for email_logs
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on email_logs"
ON email_logs FOR ALL
USING (true)
WITH CHECK (true);
