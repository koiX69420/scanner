const bot = require("../tg/tg");
const pool = require('../db/db');
const cron = require('node-cron');

async function fetchAndNotifyDexscreenerUpdates() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Fetch Dexscreener updates
        const url = `https://api.dexscreener.com/token-profiles/latest/v1`;
        const response = await fetch(url);
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const solanaTokens = data.filter(token => token.chainId === "solana");

            // Notify users of updates for Solana tokens
            for (const token of solanaTokens) {
                const { tokenAddress, url } = token;
                const tokensWithUpdates = await client.query(`
                    SELECT DISTINCT c.chat_id
                    FROM chats c
                    WHERE c.token_address = $1
                `, [tokenAddress]);

                // Send a notification to each user tracking the token
                for (const { chat_id } of tokensWithUpdates.rows) {
                    await sendTelegramMessage(chat_id, `🚀 Dex paid for CA: ${tokenAddress} ${url}`);
                    // Delete the user entry after notifying
                    await client.query(`
                        DELETE FROM chats WHERE chat_id = $1 AND token_address = $2
                    `, [chat_id, tokenAddress]);
                }
            }
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Error processing Dexscreener updates:", error);
    } finally {
        client.release();
    }
}

// Send Telegram message
async function sendTelegramMessage(chatId, message) {
    try {
        await bot.sendMessage(chatId, message);
    } catch (error) {
        console.error(`❌ Error sending Telegram message: ${error.message}`);
    }
}

// Run every 30 seconds
cron.schedule('*/30 * * * * *', fetchAndNotifyDexscreenerUpdates);
