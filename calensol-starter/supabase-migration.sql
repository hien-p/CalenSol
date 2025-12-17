-- ===========================================
-- CalenSol Database Schema
-- Run this in Supabase SQL Editor
-- ===========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- Users Table
-- ===========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  smart_wallet_pubkey VARCHAR(44) UNIQUE,
  passkey_pubkey BYTEA,
  credential_id VARCHAR(255),
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry TIMESTAMPTZ,
  google_calendar_id VARCHAR(255) DEFAULT 'primary',
  timezone VARCHAR(50) DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Nonce Accounts Table (for durable transactions)
-- ===========================================
CREATE TABLE IF NOT EXISTS nonce_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pubkey VARCHAR(44) UNIQUE NOT NULL,
  authority_pubkey VARCHAR(44) NOT NULL,
  current_nonce VARCHAR(88),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Scheduled Transactions Table
-- ===========================================
CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nonce_account_id UUID REFERENCES nonce_accounts(id),
  
  -- Google Calendar reference
  google_event_id VARCHAR(255),
  google_calendar_id VARCHAR(255) DEFAULT 'primary',
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  recurrence_rule VARCHAR(255), -- RFC 5545 RRULE format
  next_execution_at TIMESTAMPTZ,
  max_executions INTEGER, -- null = unlimited
  execution_count INTEGER DEFAULT 0,
  
  -- Transaction details
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('transfer', 'swap', 'stake')),
  from_pubkey VARCHAR(44) NOT NULL,
  to_pubkey VARCHAR(44),
  amount BIGINT NOT NULL,
  token_mint VARCHAR(44), -- null for SOL
  
  -- For swaps
  input_mint VARCHAR(44),
  output_mint VARCHAR(44),
  slippage_bps INTEGER DEFAULT 100, -- 1% default
  min_output_amount BIGINT,
  
  -- Pre-signed transaction (base64 encoded)
  presigned_tx_base64 TEXT,
  
  -- State machine
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'executing', 'completed', 'failed', 'cancelled')),
  
  -- Execution results
  signature VARCHAR(88),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  executed_at TIMESTAMPTZ,
  
  -- Metadata
  memo TEXT,
  tags TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Execution Logs Table
-- ===========================================
CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES scheduled_transactions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Notification Preferences
-- ===========================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_on_execution BOOLEAN DEFAULT true,
  email_on_failure BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- OAuth States Table (for secure OAuth flow)
-- ===========================================
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nonce VARCHAR(64) UNIQUE NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_oauth_states_nonce ON oauth_states(nonce);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- ===========================================
-- Indexes for Performance
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_status 
  ON scheduled_transactions(status);
  
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_scheduled_at 
  ON scheduled_transactions(scheduled_at);
  
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_user_id 
  ON scheduled_transactions(user_id);
  
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_next_execution 
  ON scheduled_transactions(next_execution_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_execution_logs_transaction_id 
  ON execution_logs(transaction_id);

CREATE INDEX IF NOT EXISTS idx_nonce_accounts_user_available 
  ON nonce_accounts(user_id, is_available) 
  WHERE is_available = true;

-- ===========================================
-- Row Level Security
-- ===========================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonce_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only view/edit their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Transactions policies
CREATE POLICY "Users can view own transactions" ON scheduled_transactions
  FOR SELECT USING (user_id = auth.uid());
  
CREATE POLICY "Users can insert own transactions" ON scheduled_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());
  
CREATE POLICY "Users can update own transactions" ON scheduled_transactions
  FOR UPDATE USING (user_id = auth.uid());
  
CREATE POLICY "Users can delete own transactions" ON scheduled_transactions
  FOR DELETE USING (user_id = auth.uid());

-- Nonce accounts policies
CREATE POLICY "Users can view own nonce accounts" ON nonce_accounts
  FOR SELECT USING (user_id = auth.uid());
  
CREATE POLICY "Users can manage own nonce accounts" ON nonce_accounts
  FOR ALL USING (user_id = auth.uid());

-- Execution logs policies
CREATE POLICY "Users can view own execution logs" ON execution_logs
  FOR SELECT USING (
    transaction_id IN (
      SELECT id FROM scheduled_transactions WHERE user_id = auth.uid()
    )
  );

-- Notification preferences policies
CREATE POLICY "Users can manage own notification preferences" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- ===========================================
-- Functions & Triggers
-- ===========================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_transactions_updated_at
  BEFORE UPDATE ON scheduled_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nonce_accounts_updated_at
  BEFORE UPDATE ON nonce_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- Sample Data (for testing)
-- ===========================================

-- Uncomment to insert test data:
-- INSERT INTO users (email, smart_wallet_pubkey) 
-- VALUES ('test@example.com', 'TestWalletPubkeyHere123456789012345678901234');
