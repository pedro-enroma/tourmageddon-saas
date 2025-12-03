-- Migration: Create consolidated_email_templates table
-- These templates are used for sending consolidated daily emails to escorts and headphones

CREATE TABLE IF NOT EXISTS consolidated_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  service_item_template TEXT,
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('escort_consolidated', 'headphone_consolidated')),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by type
CREATE INDEX IF NOT EXISTS idx_consolidated_templates_type ON consolidated_email_templates(template_type);

-- Create index for default templates
CREATE INDEX IF NOT EXISTS idx_consolidated_templates_default ON consolidated_email_templates(template_type, is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE consolidated_email_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Allow authenticated users to read consolidated templates"
  ON consolidated_email_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert consolidated templates"
  ON consolidated_email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update consolidated templates"
  ON consolidated_email_templates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete consolidated templates"
  ON consolidated_email_templates
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_consolidated_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_consolidated_templates_updated_at
  BEFORE UPDATE ON consolidated_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_consolidated_template_updated_at();

-- Function to ensure only one default per template type
CREATE OR REPLACE FUNCTION ensure_single_default_consolidated_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE consolidated_email_templates
    SET is_default = false
    WHERE template_type = NEW.template_type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_default_consolidated_template
  BEFORE INSERT OR UPDATE ON consolidated_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_consolidated_template();
