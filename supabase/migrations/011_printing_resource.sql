-- Migration: Printing Resource (parallel to Headphones)
-- Created: 2025-12-11

-- =====================================================
-- PART 1: Printing Resource
-- =====================================================

-- Printing table (parallel to headphones)
CREATE TABLE IF NOT EXISTS printing (
  printing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone_number VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Printing assignments (many-to-many with activity_availability)
CREATE TABLE IF NOT EXISTS printing_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printing_id UUID NOT NULL REFERENCES printing(printing_id) ON DELETE CASCADE,
  activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(printing_id, activity_availability_id)
);

-- Enable RLS
ALTER TABLE printing ENABLE ROW LEVEL SECURITY;
ALTER TABLE printing_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for printing
DROP POLICY IF EXISTS "printing_select_auth" ON printing;
CREATE POLICY "printing_select_auth" ON printing
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "printing_all_service" ON printing;
CREATE POLICY "printing_all_service" ON printing
  FOR ALL TO service_role USING (true);

-- RLS Policies for printing_assignments
DROP POLICY IF EXISTS "printing_assignments_select_auth" ON printing_assignments;
CREATE POLICY "printing_assignments_select_auth" ON printing_assignments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "printing_assignments_all_service" ON printing_assignments;
CREATE POLICY "printing_assignments_all_service" ON printing_assignments
  FOR ALL TO service_role USING (true);

-- =====================================================
-- PART 2: Update Template Type Constraints
-- =====================================================

-- Update email_templates constraint to include printing
ALTER TABLE email_templates
DROP CONSTRAINT IF EXISTS email_templates_template_type_check;

ALTER TABLE email_templates
ADD CONSTRAINT email_templates_template_type_check
CHECK (template_type IN ('guide', 'escort', 'headphone', 'printing'));

-- Update activity_template_assignments constraint
ALTER TABLE activity_template_assignments
DROP CONSTRAINT IF EXISTS activity_template_type_check;

ALTER TABLE activity_template_assignments
ADD CONSTRAINT activity_template_type_check
CHECK (template_type IN ('guide', 'escort', 'headphone', 'printing'));

-- Update consolidated_email_templates constraint
ALTER TABLE consolidated_email_templates
DROP CONSTRAINT IF EXISTS consolidated_email_templates_template_type_check;

ALTER TABLE consolidated_email_templates
ADD CONSTRAINT consolidated_email_templates_template_type_check
CHECK (template_type IN ('guide_consolidated', 'escort_consolidated', 'headphone_consolidated', 'printing_consolidated'));

-- =====================================================
-- PART 3: Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_printing_active ON printing(active);
CREATE INDEX IF NOT EXISTS idx_printing_assignments_availability ON printing_assignments(activity_availability_id);
CREATE INDEX IF NOT EXISTS idx_printing_assignments_printing ON printing_assignments(printing_id);
