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

-- Index on token_address for quicker lookups
CREATE INDEX IF NOT EXISTS idx_token_address ON token_scan_history (token_address);

-- -- Insert 10,000 random records into token_scan_history
-- DO $$ 
-- BEGIN
--     FOR i IN 1..10000 LOOP
--         INSERT INTO token_scan_history (token_address, symbol, scan_timestamp)
--         VALUES 
--         (
--             -- Random token address (this will be a random Bitcoin-like address)
--             '1' || substring(md5(random()::text), 1, 33), 
            
--             -- Random symbol (for simplicity, we use currency codes, such as $USD, $BTC, $ETH)
--             '$' || (array['USD', 'BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'LTC', 'DOGE', 'DOT', 'MATIC'])[floor(random() * 10) + 1], 

--             -- Random timestamp within the past month
--             NOW() - INTERVAL '1 day' * floor(random() * 7)  -- Random day within past week
--                  - INTERVAL '1 hour' * floor(random() * 24) -- Random hour
--                  - INTERVAL '1 minute' * floor(random() * 60) -- Random minute
--         );
--     END LOOP;
-- END $$;