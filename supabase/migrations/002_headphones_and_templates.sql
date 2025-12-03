-- Migration: Headphones Resource + Template Enhancements
-- Created: 2025-12-03

-- =====================================================
-- PART 1: Headphones Resource
-- =====================================================

-- Headphones table (parallel to guides/escorts)
CREATE TABLE IF NOT EXISTS headphones (
  headphone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone_number VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Headphone assignments (many-to-many with activity_availability)
CREATE TABLE IF NOT EXISTS headphone_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headphone_id UUID NOT NULL REFERENCES headphones(headphone_id) ON DELETE CASCADE,
  activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(headphone_id, activity_availability_id)
);

-- Enable RLS
ALTER TABLE headphones ENABLE ROW LEVEL SECURITY;
ALTER TABLE headphone_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for headphones
DROP POLICY IF EXISTS "headphones_select_auth" ON headphones;
CREATE POLICY "headphones_select_auth" ON headphones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "headphones_all_service" ON headphones;
CREATE POLICY "headphones_all_service" ON headphones
  FOR ALL TO service_role USING (true);

-- RLS Policies for headphone_assignments
DROP POLICY IF EXISTS "headphone_assignments_select_auth" ON headphone_assignments;
CREATE POLICY "headphone_assignments_select_auth" ON headphone_assignments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "headphone_assignments_all_service" ON headphone_assignments;
CREATE POLICY "headphone_assignments_all_service" ON headphone_assignments
  FOR ALL TO service_role USING (true);

-- =====================================================
-- PART 2: Template Type Column
-- =====================================================

-- Add template_type column to email_templates
ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS template_type TEXT DEFAULT 'guide';

-- Add constraint for valid template types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_template_type_check'
  ) THEN
    ALTER TABLE email_templates
    ADD CONSTRAINT email_templates_template_type_check
    CHECK (template_type IN ('guide', 'escort', 'headphone'));
  END IF;
END $$;

-- =====================================================
-- PART 3: Activity Template Assignments
-- =====================================================

-- Table for assigning default templates to activities by type
CREATE TABLE IF NOT EXISTS activity_template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT activity_template_type_check CHECK (template_type IN ('guide', 'escort', 'headphone')),
  UNIQUE(activity_id, template_type)
);

-- Enable RLS
ALTER TABLE activity_template_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "ata_select_auth" ON activity_template_assignments;
CREATE POLICY "ata_select_auth" ON activity_template_assignments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ata_all_service" ON activity_template_assignments;
CREATE POLICY "ata_all_service" ON activity_template_assignments
  FOR ALL TO service_role USING (true);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_headphones_active ON headphones(active);
CREATE INDEX IF NOT EXISTS idx_headphone_assignments_availability ON headphone_assignments(activity_availability_id);
CREATE INDEX IF NOT EXISTS idx_headphone_assignments_headphone ON headphone_assignments(headphone_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_activity_template_assignments_activity ON activity_template_assignments(activity_id);
