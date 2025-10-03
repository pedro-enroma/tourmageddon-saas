-- Create guides table
CREATE TABLE IF NOT EXISTS guides (
  guide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(50),
  license_number VARCHAR(100),
  languages TEXT[] NOT NULL DEFAULT '{}', -- Array of languages: English, Spanish, Portuguese
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create guide_assignments table (junction table)
CREATE TABLE IF NOT EXISTS guide_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(guide_id) ON DELETE CASCADE,
  activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guide_id, activity_availability_id) -- Prevent duplicate assignments
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_guides_email ON guides(email);
CREATE INDEX IF NOT EXISTS idx_guides_active ON guides(active);
CREATE INDEX IF NOT EXISTS idx_guides_languages ON guides USING GIN(languages);
CREATE INDEX IF NOT EXISTS idx_guide_assignments_guide_id ON guide_assignments(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_assignments_activity_id ON guide_assignments(activity_availability_id);

-- Create or replace the update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_guides_updated_at ON guides;
CREATE TRIGGER update_guides_updated_at BEFORE UPDATE ON guides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guide_assignments_updated_at ON guide_assignments;
CREATE TRIGGER update_guide_assignments_updated_at BEFORE UPDATE ON guide_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guides;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guides;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON guide_assignments;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guide_assignments;

-- Create RLS policies for guides table
CREATE POLICY "Enable read access for all authenticated users" ON guides
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON guides
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON guides
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON guides
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for guide_assignments table
CREATE POLICY "Enable read access for all authenticated users" ON guide_assignments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON guide_assignments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON guide_assignments
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON guide_assignments
    FOR DELETE USING (auth.role() = 'authenticated');
