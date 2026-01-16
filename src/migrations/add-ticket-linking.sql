-- Migration: Add ticket classification and participant linking
-- Run this in Supabase SQL Editor

-- A) Add ticket_class to vouchers table
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS ticket_class TEXT
  CHECK (ticket_class IN ('entrance', 'transport', 'other'));

-- B) Add participant link + audit fields to tickets table
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS pricing_category_booking_id INTEGER
    REFERENCES pricing_category_bookings(pricing_category_booking_id),
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS linked_by UUID REFERENCES auth.users(id);

-- C) Add index for faster lookups by participant
CREATE INDEX IF NOT EXISTS idx_tickets_participant
  ON tickets(pricing_category_booking_id)
  WHERE pricing_category_booking_id IS NOT NULL;

-- D) Add index for ticket_class filtering
CREATE INDEX IF NOT EXISTS idx_vouchers_ticket_class
  ON vouchers(ticket_class)
  WHERE ticket_class IS NOT NULL;
