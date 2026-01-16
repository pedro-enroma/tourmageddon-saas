-- Migration: Add booking-level voucher support
-- Run this in Supabase SQL Editor

-- Add activity_booking_id to link tickets to activity bookings (for booking-level vouchers like Catacombe)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS activity_booking_id INTEGER;

-- Add pax_count to store the number of people from booking-level vouchers
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pax_count INTEGER;

-- Example usage for Catacombe:
-- A ticket entry with holder_name="Sergio Cazzaro", pax_count=3, activity_booking_id=12345
-- This links the voucher's "3 adulti" to the activity_booking for Sergio Cazzaro
