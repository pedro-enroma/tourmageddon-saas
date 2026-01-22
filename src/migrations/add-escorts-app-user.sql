-- Add uses_app and user_id columns to escorts table for app account management
ALTER TABLE escorts
ADD COLUMN IF NOT EXISTS uses_app BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_escorts_user_id ON escorts(user_id);
