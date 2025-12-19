-- Migration: Add guide_service_group template type
-- Purpose: Allow a special template for emails sent to guides assigned to service groups

-- Update the template_type constraint to include the new type
ALTER TABLE consolidated_email_templates
DROP CONSTRAINT IF EXISTS consolidated_email_templates_template_type_check;

ALTER TABLE consolidated_email_templates
ADD CONSTRAINT consolidated_email_templates_template_type_check
CHECK (template_type IN ('guide_consolidated', 'escort_consolidated', 'headphone_consolidated', 'printing_consolidated', 'guide_service_group'));

-- Insert a default guide_service_group template
INSERT INTO consolidated_email_templates (name, subject, body, service_item_template, template_type, is_default)
VALUES (
  'Guide Service Group',
  'EnRoma - Servizi Condivisi {{date}} - {{group_name}}',
  'Ciao {{name}},

Per il **{{date}}** alle ore **{{time}}** sei assegnato al gruppo **{{group_name}}**.

**Totale partecipanti: {{total_pax}}**

I servizi inclusi nel gruppo sono:

{{services_list}}

Riceverai tutti i partecipanti insieme per questi servizi.

Grazie e buon lavoro!

EnRoma.com',
  '- **{{service.title}}**: {{service.pax_count}} pax',
  'guide_service_group',
  true
)
ON CONFLICT DO NOTHING;
