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
