-- Migration: Seasonal Pricing for Guide Costs
-- Purpose: Allow different guide costs based on seasons and special dates

-- =============================================
-- Table 1: cost_seasons - Season definitions per year
-- =============================================
CREATE TABLE cost_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color VARCHAR(20) DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_cost_seasons_year ON cost_seasons(year);
CREATE INDEX idx_cost_seasons_dates ON cost_seasons(start_date, end_date);

-- =============================================
-- Table 2: special_cost_dates - Special dates like Christmas, Easter
-- =============================================
CREATE TABLE special_cost_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_special_cost_dates_date ON special_cost_dates(date);

-- =============================================
-- Table 3: guide_seasonal_costs - Costs per activity per season
-- =============================================
CREATE TABLE guide_seasonal_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id TEXT NOT NULL,
  season_id UUID NOT NULL REFERENCES cost_seasons(id) ON DELETE CASCADE,
  cost_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, season_id)
);

CREATE INDEX idx_guide_seasonal_costs_activity ON guide_seasonal_costs(activity_id);
CREATE INDEX idx_guide_seasonal_costs_season ON guide_seasonal_costs(season_id);

-- =============================================
-- Table 4: guide_special_date_costs - Costs per activity per special date
-- =============================================
CREATE TABLE guide_special_date_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id TEXT NOT NULL,
  special_date_id UUID NOT NULL REFERENCES special_cost_dates(id) ON DELETE CASCADE,
  cost_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, special_date_id)
);

CREATE INDEX idx_guide_special_date_costs_activity ON guide_special_date_costs(activity_id);
CREATE INDEX idx_guide_special_date_costs_special_date ON guide_special_date_costs(special_date_id);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE cost_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_cost_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_seasonal_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_special_date_costs ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow authenticated users to read cost_seasons"
  ON cost_seasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage cost_seasons"
  ON cost_seasons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read special_cost_dates"
  ON special_cost_dates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage special_cost_dates"
  ON special_cost_dates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read guide_seasonal_costs"
  ON guide_seasonal_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage guide_seasonal_costs"
  ON guide_seasonal_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read guide_special_date_costs"
  ON guide_special_date_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage guide_special_date_costs"
  ON guide_special_date_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role policies
CREATE POLICY "Allow service role full access to cost_seasons"
  ON cost_seasons FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access to special_cost_dates"
  ON special_cost_dates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access to guide_seasonal_costs"
  ON guide_seasonal_costs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access to guide_special_date_costs"
  ON guide_special_date_costs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Helper function to get guide cost for a specific date
-- =============================================
CREATE OR REPLACE FUNCTION get_guide_cost_for_date(
  p_activity_id TEXT,
  p_date DATE
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_cost DECIMAL(10,2);
BEGIN
  -- First check special date costs (highest priority after overrides)
  SELECT gsc.cost_amount INTO v_cost
  FROM guide_special_date_costs gsc
  JOIN special_cost_dates scd ON scd.id = gsc.special_date_id
  WHERE gsc.activity_id = p_activity_id
    AND scd.date = p_date
  LIMIT 1;

  IF v_cost IS NOT NULL THEN
    RETURN v_cost;
  END IF;

  -- Then check seasonal costs
  SELECT gsc.cost_amount INTO v_cost
  FROM guide_seasonal_costs gsc
  JOIN cost_seasons cs ON cs.id = gsc.season_id
  WHERE gsc.activity_id = p_activity_id
    AND p_date BETWEEN cs.start_date AND cs.end_date
  ORDER BY cs.start_date DESC
  LIMIT 1;

  IF v_cost IS NOT NULL THEN
    RETURN v_cost;
  END IF;

  -- Fall back to legacy guide_activity_costs if exists
  SELECT cost_amount INTO v_cost
  FROM guide_activity_costs
  WHERE activity_id = p_activity_id
    AND guide_id IS NULL
  LIMIT 1;

  RETURN v_cost;
END;
$$ LANGUAGE plpgsql;
