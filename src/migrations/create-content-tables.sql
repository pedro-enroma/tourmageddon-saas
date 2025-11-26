-- Migration: Create tables for email templates and meeting points
-- Run this in Supabase SQL Editor

-- 1. Email templates table (enhanced version)
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

DROP POLICY IF EXISTS "Allow all operations on email_templates" ON email_templates;
CREATE POLICY "Allow all operations on email_templates"
ON email_templates FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Meeting points table
CREATE TABLE IF NOT EXISTS meeting_points (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    address TEXT,
    google_maps_url TEXT,
    instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for meeting_points
ALTER TABLE meeting_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on meeting_points"
ON meeting_points FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Activity meeting points (many-to-many relationship)
CREATE TABLE IF NOT EXISTS activity_meeting_points (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_id TEXT NOT NULL,
    meeting_point_id UUID NOT NULL REFERENCES meeting_points(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(activity_id, meeting_point_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_activity_meeting_points_activity ON activity_meeting_points(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_meeting_points_meeting_point ON activity_meeting_points(meeting_point_id);

-- RLS policies for activity_meeting_points
ALTER TABLE activity_meeting_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on activity_meeting_points"
ON activity_meeting_points FOR ALL
USING (true)
WITH CHECK (true);

-- Insert a default template
INSERT INTO email_templates (name, subject, body, is_default)
VALUES (
    'Service Assignment',
    'Your Service Assignment for {{date}}',
    'Hello {{name}},

You have been assigned to the following service:

**Activity:** {{tour_title}}
**Date:** {{date}}
**Time:** {{time}}
**Participants:** {{pax_count}} pax

Please be at the meeting point at least 15 minutes before the scheduled time.

Best regards,
EnRoma.com Team',
    true
) ON CONFLICT DO NOTHING;
