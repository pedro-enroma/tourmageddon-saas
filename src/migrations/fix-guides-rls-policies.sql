-- Fix RLS policies for guides and guide_assignments tables
-- The current policies require authenticated users, but the app uses anon key without auth
-- This migration updates policies to allow all operations (consistent with guide_calendar_settings)

-- Drop existing restrictive policies on guides table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guides;

-- Create permissive policies for guides table (internal admin dashboard)
CREATE POLICY "Allow all operations on guides"
ON guides
FOR ALL
USING (true)
WITH CHECK (true);

-- Drop existing restrictive policies on guide_assignments table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guide_assignments;

-- Create permissive policies for guide_assignments table (internal admin dashboard)
CREATE POLICY "Allow all operations on guide_assignments"
ON guide_assignments
FOR ALL
USING (true)
WITH CHECK (true);

-- Verify tables have RLS enabled
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_assignments ENABLE ROW LEVEL SECURITY;
