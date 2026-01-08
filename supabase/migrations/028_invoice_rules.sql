-- Migration: Invoice Rules System
-- Replaces global partner_solution_config with seller-specific rules

-- =============================================
-- 1. Create invoice_rules table
-- =============================================
CREATE TABLE IF NOT EXISTS invoice_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sellers TEXT[] NOT NULL DEFAULT '{}',
  auto_invoice_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_credit_note_enabled BOOLEAN NOT NULL DEFAULT true,
  default_regime TEXT NOT NULL DEFAULT '74T',
  default_sales_type TEXT NOT NULL DEFAULT 'ORG',
  invoice_date_type TEXT NOT NULL DEFAULT 'creation',
  travel_date_delay_days INTEGER NOT NULL DEFAULT 1,
  invoice_start_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_regime CHECK (default_regime IN ('74T', 'ORD')),
  CONSTRAINT valid_sales_type CHECK (default_sales_type IN ('ORG', 'INT')),
  CONSTRAINT valid_invoice_date_type CHECK (invoice_date_type IN ('creation', 'travel')),
  CONSTRAINT positive_delay_days CHECK (travel_date_delay_days >= 0)
);

-- Index for efficient seller lookups (GIN index for array contains queries)
CREATE INDEX IF NOT EXISTS idx_invoice_rules_sellers ON invoice_rules USING GIN (sellers);

-- =============================================
-- 2. Create scheduled_invoices table
-- =============================================
CREATE TABLE IF NOT EXISTS scheduled_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id INTEGER NOT NULL,
  rule_id UUID REFERENCES invoice_rules(id) ON DELETE SET NULL,
  scheduled_send_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'))
);

-- Index for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_scheduled_invoices_date_status
  ON scheduled_invoices(scheduled_send_date, status);

-- Index for booking lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_invoices_booking
  ON scheduled_invoices(booking_id);

-- =============================================
-- 3. RLS Policies for invoice_rules
-- =============================================
ALTER TABLE invoice_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all rules
CREATE POLICY "Users can view invoice rules"
  ON invoice_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert rules
CREATE POLICY "Users can create invoice rules"
  ON invoice_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update rules
CREATE POLICY "Users can update invoice rules"
  ON invoice_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow authenticated users to delete rules
CREATE POLICY "Users can delete invoice rules"
  ON invoice_rules
  FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- 4. RLS Policies for scheduled_invoices
-- =============================================
ALTER TABLE scheduled_invoices ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all scheduled invoices
CREATE POLICY "Users can view scheduled invoices"
  ON scheduled_invoices
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert scheduled invoices
CREATE POLICY "Users can create scheduled invoices"
  ON scheduled_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update scheduled invoices
CREATE POLICY "Users can update scheduled invoices"
  ON scheduled_invoices
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow authenticated users to delete scheduled invoices
CREATE POLICY "Users can delete scheduled invoices"
  ON scheduled_invoices
  FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- 5. Update trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_invoice_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_rules_updated_at
  BEFORE UPDATE ON invoice_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_rules_updated_at();

-- =============================================
-- 6. Migration: Move existing config to rule (optional)
-- =============================================
-- This creates a default rule from existing partner_solution_config if it has sellers
-- Comment out if you want to start fresh

DO $$
DECLARE
  existing_config RECORD;
BEGIN
  -- Get existing config
  SELECT * INTO existing_config
  FROM partner_solution_config
  LIMIT 1;

  -- Only migrate if there are sellers configured
  IF existing_config IS NOT NULL
     AND existing_config.auto_invoice_sellers IS NOT NULL
     AND array_length(existing_config.auto_invoice_sellers, 1) > 0 THEN

    INSERT INTO invoice_rules (
      name,
      sellers,
      auto_invoice_enabled,
      auto_credit_note_enabled,
      default_regime,
      default_sales_type,
      invoice_date_type,
      travel_date_delay_days,
      invoice_start_date
    ) VALUES (
      'Default Rule (Migrated)',
      existing_config.auto_invoice_sellers,
      existing_config.auto_invoice_enabled,
      existing_config.auto_credit_note_enabled,
      COALESCE(existing_config.default_regime, '74T'),
      COALESCE(existing_config.default_sales_type, 'ORG'),
      'creation',  -- Default to creation date
      1,           -- Default 1 day delay
      existing_config.invoice_start_date
    );

    RAISE NOTICE 'Migrated existing config to invoice_rules as "Default Rule (Migrated)"';
  END IF;
END $$;
