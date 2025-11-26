-- Create escorts table (similar to guides but escorts can have multiple services at same time)
CREATE TABLE IF NOT EXISTS escorts (
  escort_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(50),
  license_number VARCHAR(100),
  languages TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create escort_assignments table (junction table)
-- Unlike guides, escorts can have multiple services at the same time
CREATE TABLE IF NOT EXISTS escort_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escort_id UUID NOT NULL REFERENCES escorts(escort_id) ON DELETE CASCADE,
  activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(escort_id, activity_availability_id) -- Prevent duplicate assignments
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_escorts_email ON escorts(email);
CREATE INDEX IF NOT EXISTS idx_escorts_active ON escorts(active);
CREATE INDEX IF NOT EXISTS idx_escorts_languages ON escorts USING GIN(languages);
CREATE INDEX IF NOT EXISTS idx_escort_assignments_escort_id ON escort_assignments(escort_id);
CREATE INDEX IF NOT EXISTS idx_escort_assignments_activity_id ON escort_assignments(activity_availability_id);

-- Create triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_escorts_updated_at ON escorts;
CREATE TRIGGER update_escorts_updated_at BEFORE UPDATE ON escorts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_escort_assignments_updated_at ON escort_assignments;
CREATE TRIGGER update_escort_assignments_updated_at BEFORE UPDATE ON escort_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE escorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE escort_assignments ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (same as guides - internal admin dashboard)
CREATE POLICY "Allow all operations on escorts"
ON escorts
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on escort_assignments"
ON escort_assignments
FOR ALL
USING (true)
WITH CHECK (true);
