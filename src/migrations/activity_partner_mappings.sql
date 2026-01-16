-- Migration: Create activity_partner_mappings table
-- Direct link between activities and partners for voucher requests

CREATE TABLE IF NOT EXISTS activity_partner_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_id TEXT NOT NULL,
    partner_id UUID NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
    ticket_category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(activity_id, partner_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_partner_mappings_activity ON activity_partner_mappings(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_partner_mappings_partner ON activity_partner_mappings(partner_id);

-- RLS policies
ALTER TABLE activity_partner_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on activity_partner_mappings" ON activity_partner_mappings;
CREATE POLICY "Allow all operations on activity_partner_mappings"
ON activity_partner_mappings FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_activity_partner_mappings_updated_at ON activity_partner_mappings;
CREATE TRIGGER update_activity_partner_mappings_updated_at
    BEFORE UPDATE ON activity_partner_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
