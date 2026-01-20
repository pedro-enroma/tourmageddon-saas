-- Migration: Create operation notes system for SuperSantos
-- Notes can be related to dates, guides, escorts, or tickets

-- Main notes table
CREATE TABLE IF NOT EXISTS operation_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Context fields (at least one should be set)
  local_date DATE,                                    -- Date-level note
  activity_availability_id INTEGER,                   -- Slot-level note (no FK - external table)
  guide_id UUID REFERENCES guides(guide_id) ON DELETE CASCADE,        -- Guide-related note
  escort_id UUID REFERENCES escorts(escort_id) ON DELETE CASCADE,      -- Escort-related note
  voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,    -- Ticket/voucher-related note

  -- Note content
  content TEXT NOT NULL,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general', 'urgent', 'warning', 'info')),

  -- Metadata
  created_by UUID NOT NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

-- Replies table
CREATE TABLE IF NOT EXISTS operation_note_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES operation_notes(id) ON DELETE CASCADE,

  -- Reply content
  content TEXT NOT NULL,

  -- Metadata
  created_by UUID NOT NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_operation_notes_date ON operation_notes(local_date) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_operation_notes_availability ON operation_notes(activity_availability_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_operation_notes_guide ON operation_notes(guide_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_operation_notes_escort ON operation_notes(escort_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_operation_notes_voucher ON operation_notes(voucher_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_operation_note_replies_note ON operation_note_replies(note_id) WHERE is_deleted = FALSE;

-- RLS policies
ALTER TABLE operation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_note_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on operation_notes" ON operation_notes;
CREATE POLICY "Allow all operations on operation_notes"
ON operation_notes FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on operation_note_replies" ON operation_note_replies;
CREATE POLICY "Allow all operations on operation_note_replies"
ON operation_note_replies FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_operation_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_operation_notes_updated_at ON operation_notes;
CREATE TRIGGER trigger_operation_notes_updated_at
  BEFORE UPDATE ON operation_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_operation_notes_updated_at();
