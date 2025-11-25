-- =============================================
-- SECURITY IMPROVEMENT: Enhanced RLS Policies
-- =============================================
-- This migration improves Row Level Security policies
-- to prevent unauthorized access to sensitive data
-- =============================================

-- =============================================
-- 1. Fix guide_calendar_settings (CRITICAL)
-- =============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all operations on guide_calendar_settings" ON guide_calendar_settings;

-- Create proper policy for authenticated users only
CREATE POLICY "guide_calendar_settings_authenticated_read" ON guide_calendar_settings
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "guide_calendar_settings_authenticated_insert" ON guide_calendar_settings
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "guide_calendar_settings_authenticated_update" ON guide_calendar_settings
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "guide_calendar_settings_authenticated_delete" ON guide_calendar_settings
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- =============================================
-- 2. Create user_roles table for future RBAC
-- =============================================

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add constraint to ensure valid roles
ALTER TABLE user_roles
ADD CONSTRAINT valid_role
CHECK (role IN ('admin', 'manager', 'editor', 'viewer'));

-- Enable RLS on user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Only allow users to see their own role
CREATE POLICY "users_can_view_own_role" ON user_roles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only admins can modify roles (via service key)
CREATE POLICY "service_role_manage_roles" ON user_roles
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- =============================================
-- 3. Create audit_log table for comprehensive logging
-- =============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id TEXT,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit logs
CREATE POLICY "users_can_view_own_audit_logs" ON audit_log
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all audit logs
CREATE POLICY "service_role_manage_audit_logs" ON audit_log
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- =============================================
-- 4. Create function for automatic audit logging
-- =============================================

CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, new_value)
        VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_value, new_value)
        VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_value)
        VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. Create helper function to get current user role
-- =============================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM user_roles
    WHERE user_id = auth.uid();

    RETURN COALESCE(user_role, 'viewer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. Create function to check specific permission
-- =============================================

CREATE OR REPLACE FUNCTION has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_perms JSONB;
    user_role_name TEXT;
BEGIN
    SELECT role, permissions INTO user_role_name, user_perms
    FROM user_roles
    WHERE user_id = auth.uid();

    -- Admins have all permissions
    IF user_role_name = 'admin' THEN
        RETURN TRUE;
    END IF;

    -- Check if permission exists in user's permissions array
    RETURN user_perms @> to_jsonb(required_permission);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. Create API keys table for webhook authentication
-- =============================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(10) NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can manage API keys
CREATE POLICY "service_role_manage_api_keys" ON api_keys
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);

-- =============================================
-- 8. Create rate_limits table
-- =============================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(identifier, endpoint)
);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "service_role_manage_rate_limits" ON rate_limits
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- =============================================
-- NOTES FOR PRODUCTION DEPLOYMENT:
-- =============================================
-- 1. Run this migration in Supabase SQL Editor
-- 2. After running, create initial admin user in user_roles table
-- 3. Update existing RLS policies on other tables to use get_user_role()
-- 4. Implement API key generation in application code
-- 5. Set up scheduled job to clean up old rate_limits entries
-- =============================================
