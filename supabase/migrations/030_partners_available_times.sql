-- Add available_times column to partners table
-- This allows each partner to have custom entry times for voucher requests

ALTER TABLE partners
ADD COLUMN IF NOT EXISTS available_times TEXT[] DEFAULT ARRAY['09:00', '10:00', '11:00', '12:00'];

-- Add comment explaining the column
COMMENT ON COLUMN partners.available_times IS 'Array of available entry times (HH:MM format) that this partner accepts for voucher requests';
