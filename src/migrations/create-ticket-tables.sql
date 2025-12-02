-- Migration: Create tables for ticket voucher management
-- Run this in Supabase SQL Editor

-- 1. Ticket categories table (Colosseo 24H, Full Experience Arena, etc.)
CREATE TABLE IF NOT EXISTS ticket_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for ticket_categories
ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on ticket_categories" ON ticket_categories;
CREATE POLICY "Allow all operations on ticket_categories"
ON ticket_categories FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default categories
INSERT INTO ticket_categories (name, description) VALUES
    ('Colosseo 24H', 'Colosseo-Foro Romano Palatino 24H standard entry'),
    ('Full Experience Arena', 'Colosseo Full Experience with Arena floor access'),
    ('Full Experience Sotterranei', 'Colosseo Full Experience with Underground access'),
    ('Musei Vaticani', 'Vatican Museums and Sistine Chapel entry')
ON CONFLICT (name) DO NOTHING;

-- 2. Vouchers table (one per PDF/booking number)
CREATE TABLE IF NOT EXISTS vouchers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_number TEXT NOT NULL UNIQUE,
    booking_date TIMESTAMP WITH TIME ZONE,
    category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    visit_date DATE NOT NULL,
    entry_time TIME NOT NULL,
    product_name TEXT NOT NULL,
    pdf_path TEXT,
    activity_availability_id INTEGER REFERENCES activity_availability(id) ON DELETE SET NULL,
    total_tickets INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for vouchers
CREATE INDEX IF NOT EXISTS idx_vouchers_booking_number ON vouchers(booking_number);
CREATE INDEX IF NOT EXISTS idx_vouchers_visit_date ON vouchers(visit_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_category ON vouchers(category_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_activity_availability ON vouchers(activity_availability_id);

-- RLS policies for vouchers
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on vouchers" ON vouchers;
CREATE POLICY "Allow all operations on vouchers"
ON vouchers FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Tickets table (one per person in voucher)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    ticket_code TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for tickets
CREATE INDEX IF NOT EXISTS idx_tickets_voucher ON tickets(voucher_id);
CREATE INDEX IF NOT EXISTS idx_tickets_holder_name ON tickets(holder_name);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code ON tickets(ticket_code);

-- RLS policies for tickets
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on tickets" ON tickets;
CREATE POLICY "Allow all operations on tickets"
ON tickets FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Product-Activity mappings (which tours can use which ticket products)
CREATE TABLE IF NOT EXISTS product_activity_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_name TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_name, activity_id)
);

-- Indexes for product_activity_mappings
CREATE INDEX IF NOT EXISTS idx_product_activity_mappings_product ON product_activity_mappings(product_name);
CREATE INDEX IF NOT EXISTS idx_product_activity_mappings_category ON product_activity_mappings(category_id);
CREATE INDEX IF NOT EXISTS idx_product_activity_mappings_activity ON product_activity_mappings(activity_id);

-- RLS policies for product_activity_mappings
ALTER TABLE product_activity_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on product_activity_mappings" ON product_activity_mappings;
CREATE POLICY "Allow all operations on product_activity_mappings"
ON product_activity_mappings FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Ticket type mappings (maps PDF ticket types to booking participant types)
CREATE TABLE IF NOT EXISTS ticket_type_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    booked_titles TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category_id, activity_id, ticket_type)
);

-- Indexes for ticket_type_mappings
CREATE INDEX IF NOT EXISTS idx_ticket_type_mappings_category ON ticket_type_mappings(category_id);
CREATE INDEX IF NOT EXISTS idx_ticket_type_mappings_activity ON ticket_type_mappings(activity_id);

-- RLS policies for ticket_type_mappings
ALTER TABLE ticket_type_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on ticket_type_mappings" ON ticket_type_mappings;
CREATE POLICY "Allow all operations on ticket_type_mappings"
ON ticket_type_mappings FOR ALL
USING (true)
WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_ticket_categories_updated_at ON ticket_categories;
CREATE TRIGGER update_ticket_categories_updated_at
    BEFORE UPDATE ON ticket_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vouchers_updated_at ON vouchers;
CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON vouchers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ticket_type_mappings_updated_at ON ticket_type_mappings;
CREATE TRIGGER update_ticket_type_mappings_updated_at
    BEFORE UPDATE ON ticket_type_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
