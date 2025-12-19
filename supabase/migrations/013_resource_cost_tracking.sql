-- Migration: Resource Cost Tracking
-- Purpose: Add cost tracking for guides (per activity), escorts (daily), headphones (per pax), printing (per pax)

-- ============================================
-- 1. Guide Activity Costs Table
-- ============================================
-- Stores the cost per guide for each activity type (variable per activity)
CREATE TABLE IF NOT EXISTS guide_activity_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,  -- References activities.activity_id
  cost_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  effective_from DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, activity_id)
);

-- Indexes for guide_activity_costs
CREATE INDEX IF NOT EXISTS idx_guide_activity_costs_guide ON guide_activity_costs(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_activity_costs_activity ON guide_activity_costs(activity_id);

-- ============================================
-- 2. Resource Rates Table
-- ============================================
-- Stores default rates for escorts (daily flat rate) and headphones/printing (per-pax rate)
CREATE TABLE IF NOT EXISTS resource_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('escort', 'headphone', 'printing')),
  resource_id UUID NOT NULL,  -- References respective resource table
  rate_type VARCHAR(20) NOT NULL CHECK (rate_type IN ('daily', 'per_pax')),
  rate_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resource_type, resource_id)
);

-- Indexes for resource_rates
CREATE INDEX IF NOT EXISTS idx_resource_rates_type_id ON resource_rates(resource_type, resource_id);

-- ============================================
-- 3. Assignment Cost Overrides Table
-- ============================================
-- Allows overriding the default cost for specific assignments
CREATE TABLE IF NOT EXISTS assignment_cost_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_type VARCHAR(20) NOT NULL CHECK (assignment_type IN ('guide', 'escort', 'headphone', 'printing')),
  assignment_id UUID NOT NULL,  -- References respective assignment table
  override_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  reason TEXT,  -- Why the override was applied
  created_by UUID,  -- User who created the override
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for assignment_cost_overrides
CREATE INDEX IF NOT EXISTS idx_assignment_cost_overrides_lookup ON assignment_cost_overrides(assignment_type, assignment_id);

-- ============================================
-- 4. Guide Service Groups Table
-- ============================================
-- Links multiple guide assignments together when a guide handles multiple services at the same time
-- The cost is calculated based on the highest-cost activity (primary_assignment_id)
CREATE TABLE IF NOT EXISTS guide_service_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_time TIME NOT NULL,
  primary_assignment_id UUID,  -- The assignment with highest cost (set after calculation)
  total_pax INTEGER DEFAULT 0,
  calculated_cost DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'EUR',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, service_date, service_time)
);

-- Indexes for guide_service_groups
CREATE INDEX IF NOT EXISTS idx_guide_service_groups_guide ON guide_service_groups(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_service_groups_date ON guide_service_groups(service_date);

-- ============================================
-- 5. Guide Service Group Members Table
-- ============================================
-- Junction table linking individual assignments to a service group
CREATE TABLE IF NOT EXISTS guide_service_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES guide_service_groups(id) ON DELETE CASCADE,
  guide_assignment_id UUID NOT NULL REFERENCES guide_assignments(assignment_id) ON DELETE CASCADE,
  pax_count INTEGER DEFAULT 0,
  individual_cost DECIMAL(10, 2),  -- The cost this activity would have been charged
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_assignment_id)  -- One assignment can only belong to one group
);

-- Index for guide_service_group_members
CREATE INDEX IF NOT EXISTS idx_guide_service_group_members_group ON guide_service_group_members(group_id);

-- ============================================
-- Triggers for auto-updating updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_guide_activity_costs_updated_at ON guide_activity_costs;
CREATE TRIGGER update_guide_activity_costs_updated_at BEFORE UPDATE ON guide_activity_costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resource_rates_updated_at ON resource_rates;
CREATE TRIGGER update_resource_rates_updated_at BEFORE UPDATE ON resource_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guide_service_groups_updated_at ON guide_service_groups;
CREATE TRIGGER update_guide_service_groups_updated_at BEFORE UPDATE ON guide_service_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE guide_activity_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_cost_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_service_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_service_group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for guide_activity_costs
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guide_activity_costs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guide_activity_costs;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guide_activity_costs;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guide_activity_costs;

CREATE POLICY "Enable read access for all authenticated users" ON guide_activity_costs
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON guide_activity_costs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON guide_activity_costs
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON guide_activity_costs
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for resource_rates
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON resource_rates;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON resource_rates;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON resource_rates;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON resource_rates;

CREATE POLICY "Enable read access for all authenticated users" ON resource_rates
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON resource_rates
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON resource_rates
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON resource_rates
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for assignment_cost_overrides
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON assignment_cost_overrides;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON assignment_cost_overrides;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON assignment_cost_overrides;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON assignment_cost_overrides;

CREATE POLICY "Enable read access for all authenticated users" ON assignment_cost_overrides
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON assignment_cost_overrides
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON assignment_cost_overrides
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON assignment_cost_overrides
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for guide_service_groups
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guide_service_groups;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guide_service_groups;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guide_service_groups;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guide_service_groups;

CREATE POLICY "Enable read access for all authenticated users" ON guide_service_groups
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON guide_service_groups
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON guide_service_groups
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON guide_service_groups
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for guide_service_group_members
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guide_service_group_members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guide_service_group_members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guide_service_group_members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guide_service_group_members;

CREATE POLICY "Enable read access for all authenticated users" ON guide_service_group_members
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON guide_service_group_members
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON guide_service_group_members
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON guide_service_group_members
    FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- Service Role Policies (for API routes)
-- ============================================
-- Allow service role full access to all tables
DROP POLICY IF EXISTS "Service role has full access" ON guide_activity_costs;
CREATE POLICY "Service role has full access" ON guide_activity_costs
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role has full access" ON resource_rates;
CREATE POLICY "Service role has full access" ON resource_rates
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role has full access" ON assignment_cost_overrides;
CREATE POLICY "Service role has full access" ON assignment_cost_overrides
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role has full access" ON guide_service_groups;
CREATE POLICY "Service role has full access" ON guide_service_groups
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role has full access" ON guide_service_group_members;
CREATE POLICY "Service role has full access" ON guide_service_group_members
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
