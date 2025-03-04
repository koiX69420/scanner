-- Create table for validated users (wallet addresses and signed messages)
CREATE TABLE IF NOT EXISTS validated_users (
    id SERIAL PRIMARY KEY,                       -- Auto-incremented user ID
    tg_id BIGINT NOT NULL UNIQUE,                       -- Telegram ID (e.g., numeric identifier)
    wallet_address TEXT NOT NULL,                -- Wallet address (e.g., Solana wallet address)
    valid_until TIMESTAMPTZ NOT NULL,      -- Timestamp of when the record was last updated
    hardware_concurrency SMALLINT,  -- CPU cores (usually between 1-16)
    device_memory SMALLINT,         -- RAM size in GB
    language TEXT,                   -- User's language (e.g., "de-DE")
    user_agent TEXT   
);

-- Create an index to optimize queries by tg_id
CREATE INDEX IF NOT EXISTS idx_tg_id ON validated_users (tg_id);


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

CREATE TABLE IF NOT EXISTS dexscreener_updates (
    id SERIAL PRIMARY KEY,
    token_address TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_token_chat ON chats(token_address, chat_id);