-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS bot_memory (
  chat_id TEXT PRIMARY KEY,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime if you want (optional)
-- ALTER TABLE bot_memory REPLICA IDENTITY FULL;

-- Auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bot_memory_updated_at
  BEFORE UPDATE ON bot_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Allow your anon key to read/write (Supabase default policy)
-- You may need to set RLS policies depending on your Supabase settings.
-- For a simple chatbot, disable RLS or add a permissive policy:
ALTER TABLE bot_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON bot_memory
  FOR ALL
  USING (true)
  WITH CHECK (true);
