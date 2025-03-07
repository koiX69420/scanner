-- Table to store unique users
CREATE TABLE IF NOT EXISTS users (
    tg_id BIGINT PRIMARY KEY,             -- Telegram ID as the primary key
    wallet_address TEXT UNIQUE NOT NULL   -- Unique wallet address
);

-- Create table for validated users (wallet addresses and signed messages)
CREATE TABLE IF NOT EXISTS subscribed_users (
    tg_id BIGINT PRIMARY KEY,              -- Telegram ID as the primary key
    wallet_address TEXT NOT NULL,          -- Wallet address (e.g., Solana wallet address)
    valid_until TIMESTAMPTZ NOT NULL,      -- Timestamp of when the record was last updated
    hardware_concurrency SMALLINT,         -- CPU cores (usually between 1-16)
    device_memory SMALLINT,                -- RAM size in GB
    language TEXT,                         -- User's language (e.g., "de-DE")
    user_agent TEXT                        -- Information about the user's device
);

-- Create an index to optimize queries by tg_id
CREATE INDEX IF NOT EXISTS idx_tg_id ON subscribed_users (tg_id);


CREATE TABLE IF NOT EXISTS token_scan_history (
  id SERIAL PRIMARY KEY,
  token_address VARCHAR(80) NOT NULL,
  symbol VARCHAR(10),
  scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(token_address, scan_timestamp)
);


CREATE INDEX IF NOT EXISTS idx_scan_timestamp_token_symbol 
ON token_scan_history (scan_timestamp DESC, token_address, symbol);

CREATE INDEX IF NOT EXISTS idx_scan_timestamp ON token_scan_history (scan_timestamp DESC);


CREATE TABLE  IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  token_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(chat_id, token_address)
);

CREATE INDEX IF NOT EXISTS idx_chats_token_chat ON chats(token_address, chat_id);