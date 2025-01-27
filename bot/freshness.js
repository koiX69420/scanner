const bot = require("../tg/tg");
const { SOL_AMOUNT_THRESHOLD, MAX_TX_LIMIT, delayBetweenRequests, FRESH_THRESHHOLD } = require('../config/config');

const { fetchLargestTokenAccounts, getSupply, fetchAccountOwner, fetchWithRateLimit, fetchTransactionHistory, getTransactionColor,formatFreshnessMessage } = require("../util/util"); // Adjust the path as needed

// Fetch token freshness and holdings info
async function getFreshness(tokenCa) {
    try {
        console.log(`Fetching and processing token accounts for token: ${tokenCa}`);

        // Fetch largest token accounts
        let largestAccounts = [];
        await fetchWithRateLimit(async () => {
            largestAccounts = await fetchLargestTokenAccounts(tokenCa);
            if (largestAccounts.length === 0) {
                console.log("No token accounts found.");
                return [];
            }
        }, delayBetweenRequests);



        let maxSupply = 1000000000;
        await fetchWithRateLimit(async () => {
            maxSupply = await getSupply(tokenCa);
        }, delayBetweenRequests);


        // Process each token account
        const freshnessData = [];
        for (let i = 0; i < largestAccounts.length; i++) {
            const tokenAccount = largestAccounts[i];
            const tokenAccountAddress = tokenAccount.address;

            const freshness = {
                holding: ((tokenAccount.uiAmount / maxSupply) * 100).toFixed(2),
                address: tokenAccountAddress,
                txCount: 0,
            };

            // Fetch account owner with rate limiting
            await fetchWithRateLimit(async () => {
                const owner = await fetchAccountOwner(tokenAccountAddress);
                if (owner) {
                    freshness.address = owner;
                }
            }, delayBetweenRequests);

            await fetchWithRateLimit(async () => {
                const transactions = await fetchTransactionHistory(freshness.address, MAX_TX_LIMIT);
                if (transactions) {
                    freshness.txCount = transactions.length;
                }
            }, delayBetweenRequests);



            freshnessData.push(freshness);
        }

        return freshnessData;
    } catch (error) {
        console.error("Error fetching and processing token accounts:", error.message);
        return []; // Return an empty array on error
    }
}



// Function to send the message with the refresh button
async function sendFreshnessWithButton(chatId, tokenAddress) {
    const freshnessData = await getFreshness(tokenAddress);
    const {freshnessMessage,topHolders} = formatFreshnessMessage(freshnessData, tokenAddress,MAX_TX_LIMIT);
  
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🔄 Refresh Data', // Text of the button
            callback_data: `refresh_${tokenAddress}` // Unique identifier for the button
          }
        ]
      ]
    };
  
    bot.sendMessage(chatId, freshnessMessage, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
  }
  
  // Handle the '/fresh' command
  bot.onText(/\/fresh (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const tokenAddress = match[1];
  
    // Regular expression to validate Solana token address
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  
    if (!solanaAddressRegex.test(tokenAddress)) {
      bot.sendMessage(chatId, "❌ Invalid Solana token address. Please check and try again.");
      return;
    }
  
    bot.sendMessage(chatId, `Fetching freshness and cluster data for token: ${tokenAddress}...\n Give me a minute or two`);
  
    try {
      sendFreshnessWithButton(chatId, tokenAddress); // Send the data along with the refresh button
    } catch (error) {
      bot.sendMessage(chatId, "❌ An error occurred while processing the request. Please try again later.");
      console.error("Error in /fresh command:", error.message);
    }
  });
  
  // Handle callback query when the refresh button is pressed
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const tokenAddress = query.data.split('_')[1]; // Extract the token address from the callback data
  
    if (query.data.startsWith('refresh_')) {
      try {
        // Answer the callback query to acknowledge the press
        bot.answerCallbackQuery(query.id, { text: 'Refreshing data...', show_alert: false });
        bot.sendMessage(chatId, "Refreshing Data...");

        // Re-fetch and send the updated data with the refresh button again
        sendFreshnessWithButton(chatId, tokenAddress);
  
      } catch (error) {
        console.error("Error handling refresh:", error);
        bot.sendMessage(chatId, "❌ An error occurred while refreshing data. Please try again later.");
      }
    }
  });