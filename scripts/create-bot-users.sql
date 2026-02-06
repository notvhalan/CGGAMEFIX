-- Create bot users for liquidity bots
-- This script creates 30 bot users with @bot.local emails
-- These users can be reused by the liquidity bot service

DO $$
DECLARE
    i INTEGER;
    bot_email TEXT;
    bot_name TEXT;
    bot_id UUID;
    bot_google_sub TEXT;
BEGIN
    FOR i IN 1..30 LOOP
        bot_id := gen_random_uuid();
        bot_email := 'liquiditybot_' || i || '@bot.local';
        bot_name := 'Liquidity Bot ' || i;
        bot_google_sub := 'bot_' || bot_id;
        
        -- Insert bot user (skip if already exists)
        INSERT INTO users (id, email, name, google_sub, created_at, updated_at)
        VALUES (bot_id, bot_email, bot_name, bot_google_sub, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING;
        
        -- Ensure wallet exists for the bot
        INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
        VALUES (bot_id, 'GBP', 10000.00, 0, NOW(), NOW())
        ON CONFLICT (user_id, currency) DO UPDATE
        SET balance = 10000.00, locked_balance = 0, updated_at = NOW();
        
        RAISE NOTICE 'Created/Updated bot user: % (ID: %)', bot_email, bot_id;
    END LOOP;
END $$;

-- Verify bot users were created
SELECT COUNT(*) as bot_user_count FROM users WHERE email LIKE '%@bot.local';
SELECT id, email, name FROM users WHERE email LIKE '%@bot.local' ORDER BY email LIMIT 10;
