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

-- Bot configuration table (admin dashboard)
CREATE TABLE IF NOT EXISTS bot_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON bot_config FOR ALL USING (true) WITH CHECK (true);

-- Default config values
INSERT INTO bot_config (key, value) VALUES
  ('free_limits', '{"messagesPerDay":20,"searchesPerDay":5,"remindersActive":3}'::jsonb),
  ('premium_limits', '{"messagesPerDay":-1,"searchesPerDay":-1,"remindersActive":-1}'::jsonb),
  ('premium_price', '100'::jsonb),
  ('free_model', '"stepfun/step-3.5-flash:free"'::jsonb),
  ('premium_models', '["anthropic/claude-3.5-sonnet","openai/gpt-4o-mini"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
