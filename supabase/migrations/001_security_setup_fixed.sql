-- =====================================================
-- TOURMAGEDDON SECURITY SETUP (FIXED)
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: APP USERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  mfa_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_select_auth" ON app_users;
DROP POLICY IF EXISTS "app_users_all_service" ON app_users;
CREATE POLICY "app_users_select_auth" ON app_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_users_all_service" ON app_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- PART 2: AUDIT LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_auth" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_service" ON audit_logs;
CREATE POLICY "audit_logs_select_auth" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_logs_insert_service" ON audit_logs FOR INSERT TO service_role WITH CHECK (true);

-- =====================================================
-- PART 3: ENABLE RLS ON TABLES (excluding views)
-- =====================================================

-- Core booking tables
ALTER TABLE IF EXISTS activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pricing_category_bookings ENABLE ROW LEVEL SECURITY;

-- Customer & seller tables
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS booking_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sellers ENABLE ROW LEVEL SECURITY;

-- Staff tables
ALTER TABLE IF EXISTS guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS escorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guide_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS escort_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guide_calendar_settings ENABLE ROW LEVEL SECURITY;

-- Ticket & voucher tables
ALTER TABLE IF EXISTS vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ticket_type_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_activity_mappings ENABLE ROW LEVEL SECURITY;

-- Content tables
ALTER TABLE IF EXISTS email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_meeting_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tour_groups ENABLE ROW LEVEL SECURITY;

-- Notification & logging tables
ALTER TABLE IF EXISTS booking_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS booking_swap_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS service_attachments ENABLE ROW LEVEL SECURITY;

-- Webhook & sync tables
ALTER TABLE IF EXISTS webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS participant_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sync_checkpoints ENABLE ROW LEVEL SECURITY;

-- Promotion tables
ALTER TABLE IF EXISTS booking_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS booking_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS gtm_logs ENABLE ROW LEVEL SECURITY;

-- Status tables
ALTER TABLE IF EXISTS activity_booking_status_overrides ENABLE ROW LEVEL SECURITY;

-- NOTE: finance_report_data is a VIEW, not a table - RLS not applicable

-- =====================================================
-- PART 4: CREATE RLS POLICIES FOR ALL TABLES
-- =====================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'activities', 'activity_availability', 'activity_bookings', 'bookings',
    'pricing_category_bookings', 'customers', 'booking_customers', 'sellers',
    'guides', 'escorts', 'guide_assignments', 'escort_assignments',
    'guide_calendar_settings', 'vouchers', 'tickets', 'ticket_categories',
    'ticket_type_mappings', 'product_activity_mappings', 'email_templates',
    'activity_meeting_points', 'tour_groups', 'booking_notifications',
    'booking_swap_log', 'email_logs', 'service_attachments', 'webhook_logs',
    'participant_sync_logs', 'sync_checkpoints',
    'booking_promotions', 'booking_coupons', 'gtm_logs',
    'activity_booking_status_overrides'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Check if table exists before creating policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "%s_select_auth" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_all_service" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_select_auth" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_all_service" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
      RAISE NOTICE 'Created policies for table: %', tbl;
    ELSE
      RAISE NOTICE 'Table does not exist, skipping: %', tbl;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- PART 5: STORAGE BUCKET POLICIES
-- =====================================================

DO $$
BEGIN
  DROP POLICY IF EXISTS "vouchers_select_auth" ON storage.objects;
  DROP POLICY IF EXISTS "vouchers_insert_service" ON storage.objects;
  DROP POLICY IF EXISTS "vouchers_update_service" ON storage.objects;
  DROP POLICY IF EXISTS "vouchers_delete_service" ON storage.objects;

  CREATE POLICY "vouchers_select_auth" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'ticket-vouchers');
  CREATE POLICY "vouchers_insert_service" ON storage.objects
    FOR INSERT TO service_role WITH CHECK (bucket_id = 'ticket-vouchers');
  CREATE POLICY "vouchers_update_service" ON storage.objects
    FOR UPDATE TO service_role USING (bucket_id = 'ticket-vouchers');
  CREATE POLICY "vouchers_delete_service" ON storage.objects
    FOR DELETE TO service_role USING (bucket_id = 'ticket-vouchers');

  RAISE NOTICE 'Created storage policies for ticket-vouchers bucket';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not create voucher storage policies: %', SQLERRM;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "attachments_select_auth" ON storage.objects;
  DROP POLICY IF EXISTS "attachments_insert_service" ON storage.objects;
  DROP POLICY IF EXISTS "attachments_update_service" ON storage.objects;
  DROP POLICY IF EXISTS "attachments_delete_service" ON storage.objects;

  CREATE POLICY "attachments_select_auth" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'service-attachments');
  CREATE POLICY "attachments_insert_service" ON storage.objects
    FOR INSERT TO service_role WITH CHECK (bucket_id = 'service-attachments');
  CREATE POLICY "attachments_update_service" ON storage.objects
    FOR UPDATE TO service_role USING (bucket_id = 'service-attachments');
  CREATE POLICY "attachments_delete_service" ON storage.objects
    FOR DELETE TO service_role USING (bucket_id = 'service-attachments');

  RAISE NOTICE 'Created storage policies for service-attachments bucket';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not create attachment storage policies: %', SQLERRM;
END $$;

-- =====================================================
-- PART 6: TRIGGER FOR updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_app_users_updated_at ON app_users;
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DONE! Run verification queries below to confirm:
-- =====================================================

-- Check tables created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('app_users', 'audit_logs');

-- Check RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true ORDER BY tablename;

-- Check policies:
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
