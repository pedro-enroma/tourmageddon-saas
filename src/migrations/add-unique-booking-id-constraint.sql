-- Migration: Add unique constraint on scheduled_invoices.booking_id
-- This prevents duplicate invoices for the same booking

-- First, delete any existing duplicates (keep only the oldest entry per booking_id)
DELETE FROM scheduled_invoices
WHERE id NOT IN (
  SELECT MIN(id)
  FROM scheduled_invoices
  GROUP BY booking_id
);

-- Add unique constraint on booking_id
ALTER TABLE scheduled_invoices
ADD CONSTRAINT scheduled_invoices_booking_id_unique UNIQUE (booking_id);
