-- Migration: Special Guide Costs
-- Purpose: Allow specific guides to have different costs per activity,
-- with full seasonal and special date support

-- =============================================
-- Table 1: special_guide_rules
-- Master table tracking guide+activity combinations with special pricing
-- =============================================
CREATE TABLE special_guide_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, activity_id)
);

CREATE INDEX idx_special_guide_rules_guide ON special_guide_rules(guide_id);
CREATE INDEX idx_special_guide_rules_activity ON special_guide_rules(activity_id);

-- =============================================
-- Table 2: guide_specific_seasonal_costs
-- Guide-specific costs per activity per season
-- =============================================
CREATE TABLE guide_specific_seasonal_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  season_id UUID NOT NULL REFERENCES cost_seasons(id) ON DELETE CASCADE,
  cost_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, activity_id, season_id)
);

CREATE INDEX idx_guide_specific_seasonal_costs_guide ON guide_specific_seasonal_costs(guide_id);
CREATE INDEX idx_guide_specific_seasonal_costs_activity ON guide_specific_seasonal_costs(activity_id);
CREATE INDEX idx_guide_specific_seasonal_costs_season ON guide_specific_seasonal_costs(season_id);
CREATE INDEX idx_guide_specific_seasonal_costs_lookup ON guide_specific_seasonal_costs(guide_id, activity_id, season_id);

-- =============================================
-- Table 3: guide_specific_special_date_costs
-- Guide-specific costs per activity per special date
-- =============================================
CREATE TABLE guide_specific_special_date_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  special_date_id UUID NOT NULL REFERENCES special_cost_dates(id) ON DELETE CASCADE,
  cost_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, activity_id, special_date_id)
);

CREATE INDEX idx_guide_specific_special_date_costs_guide ON guide_specific_special_date_costs(guide_id);
CREATE INDEX idx_guide_specific_special_date_costs_activity ON guide_specific_special_date_costs(activity_id);
CREATE INDEX idx_guide_specific_special_date_costs_special_date ON guide_specific_special_date_costs(special_date_id);
CREATE INDEX idx_guide_specific_special_date_costs_lookup ON guide_specific_special_date_costs(guide_id, activity_id, special_date_id);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE special_guide_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_specific_seasonal_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_specific_special_date_costs ENABLE ROW LEVEL SECURITY;

-- Policies for special_guide_rules
CREATE POLICY "Allow authenticated users to read special_guide_rules"
  ON special_guide_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to manage special_guide_rules"
  ON special_guide_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role full access to special_guide_rules"
  ON special_guide_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policies for guide_specific_seasonal_costs
CREATE POLICY "Allow authenticated users to read guide_specific_seasonal_costs"
  ON guide_specific_seasonal_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to manage guide_specific_seasonal_costs"
  ON guide_specific_seasonal_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role full access to guide_specific_seasonal_costs"
  ON guide_specific_seasonal_costs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policies for guide_specific_special_date_costs
CREATE POLICY "Allow authenticated users to read guide_specific_special_date_costs"
  ON guide_specific_special_date_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to manage guide_specific_special_date_costs"
  ON guide_specific_special_date_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role full access to guide_specific_special_date_costs"
  ON guide_specific_special_date_costs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Triggers for auto-updating updated_at
-- =============================================
CREATE TRIGGER update_special_guide_rules_updated_at
  BEFORE UPDATE ON special_guide_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guide_specific_seasonal_costs_updated_at
  BEFORE UPDATE ON guide_specific_seasonal_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guide_specific_special_date_costs_updated_at
  BEFORE UPDATE ON guide_specific_special_date_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
