-- Migration: Create notification_rules table for dynamic notification management
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,

    -- Trigger: What event starts evaluation
    trigger_event TEXT NOT NULL,
    -- Options: 'booking_created', 'booking_modified', 'booking_cancelled',
    --          'voucher_uploaded', 'voucher_deadline_approaching', 'voucher_deadline_missed',
    --          'guide_assigned', 'escort_assigned', 'assignment_removed',
    --          'age_mismatch', 'sync_failure'

    -- Conditions: Tree structure for AND/OR logic
    conditions JSONB NOT NULL DEFAULT '{"type": "group", "operator": "AND", "children": []}',

    -- Actions: What to do when rule matches
    channels TEXT[] NOT NULL DEFAULT ARRAY['push'],
    email_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
    recipient_roles TEXT[] DEFAULT ARRAY['admin'],

    -- Notification content (supports {variable} templates)
    notification_title TEXT,
    notification_body TEXT,
    notification_url TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notification_rules_trigger ON notification_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_notification_rules_priority ON notification_rules(priority DESC);

-- Enable RLS
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage rules
CREATE POLICY "Admins can manage notification rules" ON notification_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.id = auth.uid()
            AND app_users.role = 'admin'
        )
    );

-- Policy: Service role has full access
CREATE POLICY "Service role full access to notification rules" ON notification_rules
    FOR ALL TO service_role USING (true);

-- Grant permissions
GRANT ALL ON notification_rules TO authenticated;
GRANT ALL ON notification_rules TO service_role;

-- Add comment
COMMENT ON TABLE notification_rules IS 'Dynamic notification rules with tree-based conditions for flexible alert configuration';
COMMENT ON COLUMN notification_rules.conditions IS 'JSONB tree structure with AND/OR groups and leaf conditions';
COMMENT ON COLUMN notification_rules.trigger_event IS 'Event type that triggers rule evaluation';
