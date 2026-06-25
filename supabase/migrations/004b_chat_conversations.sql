-- Create chat_conversations table for storing user-Yogi Baba conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  response TEXT NOT NULL,
  chart_id UUID REFERENCES kundli_charts(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by user_id and created_at
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_created ON chat_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_chart_id ON chat_conversations(chart_id);

-- Enable RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own conversations
CREATE POLICY "Users can view their own chat conversations" ON chat_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat conversations" ON chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat conversations" ON chat_conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat conversations" ON chat_conversations
  FOR DELETE USING (auth.uid() = user_id);
