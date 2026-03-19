-- Run this in Supabase SQL Editor

-- Usage tracking table
CREATE TABLE IF NOT EXISTS bot_usage (
  chat_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INTEGER DEFAULT 0,
  search_count INTEGER DEFAULT 0,
  remind_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chat_id, date)
);

ALTER TABLE bot_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON bot_usage FOR ALL USING (true) WITH CHECK (true);

-- Premium users table
CREATE TABLE IF NOT EXISTS bot_premium (
  chat_id TEXT PRIMARY KEY,
  is_premium BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bot_premium ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON bot_premium FOR ALL USING (true) WITH CHECK (true);
