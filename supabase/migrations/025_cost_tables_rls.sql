-- Migration: Add RLS policies for cost-related tables
-- These tables need to be readable by authenticated users for the SuperSantos recap page

-- Enable RLS on cost tables (if not already enabled)
ALTER TABLE IF EXISTS guide_seasonal_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cost_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS special_cost_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guide_special_date_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guide_activity_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS resource_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assignment_cost_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS escort_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS headphone_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS printing_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users to read
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'guide_seasonal_costs',
    'cost_seasons',
    'special_cost_dates',
    'guide_special_date_costs',
    'guide_activity_costs',
    'resource_rates',
    'assignment_cost_overrides',
    'escort_assignments',
    'headphone_assignments',
    'printing_assignments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Check if table exists before creating policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- Drop existing policies if they exist
      EXECUTE format('DROP POLICY IF EXISTS "%s_select_auth" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_all_service" ON %I', tbl, tbl);

      -- Create policy for authenticated users to SELECT
      EXECUTE format('CREATE POLICY "%s_select_auth" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);

      -- Create policy for service role to do everything
      EXECUTE format('CREATE POLICY "%s_all_service" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);

      RAISE NOTICE 'Created RLS policies for table: %', tbl;
    ELSE
      RAISE NOTICE 'Table does not exist, skipping: %', tbl;
    END IF;
  END LOOP;
END $$;
