-- Create table for validated users (wallet addresses and signed messages)
CREATE TABLE IF NOT EXISTS validated_users (
    id SERIAL PRIMARY KEY,                       -- Auto-incremented user ID
    tg_id BIGINT NOT NULL,                       -- Telegram ID (e.g., numeric identifier)
    wallet_address TEXT NOT NULL,                -- Wallet address (e.g., Solana wallet address)
    last_updated TIMESTAMPTZ DEFAULT NOW(),      -- Timestamp of when the record was last updated
    UNIQUE(wallet_address),                      -- Ensure Wallet address is unique
    UNIQUE(tg_id)                                -- Ensure Telegram ID is unique
);

-- Create an index to optimize queries by wallet address
CREATE INDEX IF NOT EXISTS idx_wallet_address ON validated_users (wallet_address);

-- Create an index to optimize queries by tg_id
CREATE INDEX IF NOT EXISTS idx_tg_id ON validated_users (tg_id);
