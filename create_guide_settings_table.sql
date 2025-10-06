-- Create guide_calendar_settings table to store excluded activities
CREATE TABLE IF NOT EXISTS guide_calendar_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings for excluded activities
INSERT INTO guide_calendar_settings (setting_key, setting_value)
VALUES ('excluded_activity_ids', '["243718", "243709", "219735", "217930"]'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE guide_calendar_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since this is internal admin dashboard)
CREATE POLICY "Allow all operations on guide_calendar_settings"
ON guide_calendar_settings
FOR ALL
USING (true)
WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_guide_calendar_settings_key ON guide_calendar_settings(setting_key);
