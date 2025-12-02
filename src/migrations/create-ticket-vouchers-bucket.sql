-- Migration: Create storage bucket for ticket voucher PDFs
-- Run this in Supabase SQL Editor

-- Create the storage bucket for ticket vouchers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-vouchers',
    'ticket-vouchers',
    true,
    10485760, -- 10MB limit
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ticket-vouchers bucket
-- Using anon role since dashboard uses anon key without authentication

-- Drop all existing policies first
DROP POLICY IF EXISTS "Allow authenticated uploads to ticket-vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to ticket-vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from ticket-vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from ticket-vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow all operations on ticket-vouchers" ON storage.objects;

-- Allow all operations on ticket-vouchers bucket (internal admin dashboard)
CREATE POLICY "Allow all operations on ticket-vouchers"
ON storage.objects
FOR ALL
TO anon, authenticated
USING (bucket_id = 'ticket-vouchers')
WITH CHECK (bucket_id = 'ticket-vouchers');
