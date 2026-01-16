-- Migration: Create partners table for voucher request system
-- Run this in Supabase SQL Editor

-- 1. Partners table (external suppliers who provide tickets)
CREATE TABLE IF NOT EXISTS partners (
    partner_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for partners
CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);
CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(email);
CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(active);

-- RLS policies for partners
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on partners" ON partners;
CREATE POLICY "Allow all operations on partners"
ON partners FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Add partner_id column to ticket_categories (1:1 relationship)
ALTER TABLE ticket_categories
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(partner_id) ON DELETE SET NULL;

-- Create unique index to enforce 1:1 relationship (one partner per category)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_categories_partner_unique
ON ticket_categories(partner_id) WHERE partner_id IS NOT NULL;

-- 3. Trigger for updated_at on partners
DROP TRIGGER IF EXISTS update_partners_updated_at ON partners;
CREATE TRIGGER update_partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
