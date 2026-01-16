-- Migration: Create voucher_requests table for reverse ticket creation
-- Run this in Supabase SQL Editor

-- 1. Create status enum type for voucher requests
DO $$ BEGIN
    CREATE TYPE voucher_request_status AS ENUM ('draft', 'sent', 'fulfilled', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Voucher requests table
CREATE TABLE IF NOT EXISTS voucher_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_availability_id INTEGER NOT NULL REFERENCES activity_availability(id) ON DELETE CASCADE,
    ticket_category_id UUID NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
    requested_quantity INTEGER NOT NULL,
    visit_date DATE NOT NULL,
    entry_time TIME,
    activity_name TEXT NOT NULL,
    customer_names JSONB NOT NULL DEFAULT '[]',  -- [{first_name, last_name, pax_count}]
    total_pax INTEGER NOT NULL,
    status voucher_request_status DEFAULT 'draft',
    sent_at TIMESTAMP WITH TIME ZONE,
    sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_voucher_ids UUID[] DEFAULT '{}',
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    request_pdf_path TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for voucher_requests
CREATE INDEX IF NOT EXISTS idx_voucher_requests_activity_availability ON voucher_requests(activity_availability_id);
CREATE INDEX IF NOT EXISTS idx_voucher_requests_category ON voucher_requests(ticket_category_id);
CREATE INDEX IF NOT EXISTS idx_voucher_requests_partner ON voucher_requests(partner_id);
CREATE INDEX IF NOT EXISTS idx_voucher_requests_visit_date ON voucher_requests(visit_date);
CREATE INDEX IF NOT EXISTS idx_voucher_requests_status ON voucher_requests(status);
CREATE INDEX IF NOT EXISTS idx_voucher_requests_created_at ON voucher_requests(created_at);

-- RLS policies for voucher_requests
ALTER TABLE voucher_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on voucher_requests" ON voucher_requests;
CREATE POLICY "Allow all operations on voucher_requests"
ON voucher_requests FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Trigger for updated_at on voucher_requests
DROP TRIGGER IF EXISTS update_voucher_requests_updated_at ON voucher_requests;
CREATE TRIGGER update_voucher_requests_updated_at
    BEFORE UPDATE ON voucher_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Create storage bucket for voucher request PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'voucher-requests',
    'voucher-requests',
    false,
    10485760,  -- 10MB limit
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for voucher-requests bucket
DROP POLICY IF EXISTS "Allow authenticated users to upload voucher requests" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload voucher requests"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'voucher-requests'
    AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Allow authenticated users to read voucher requests" ON storage.objects;
CREATE POLICY "Allow authenticated users to read voucher requests"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'voucher-requests'
    AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Allow authenticated users to delete voucher requests" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete voucher requests"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'voucher-requests'
    AND auth.role() = 'authenticated'
);
