-- Migration: Add guide_consolidated to template_type constraint
-- This allows guides to also have consolidated email templates

-- Drop the existing constraint and add a new one with guide_consolidated
ALTER TABLE consolidated_email_templates
DROP CONSTRAINT IF EXISTS consolidated_email_templates_template_type_check;

ALTER TABLE consolidated_email_templates
ADD CONSTRAINT consolidated_email_templates_template_type_check
CHECK (template_type IN ('guide_consolidated', 'escort_consolidated', 'headphone_consolidated'));
