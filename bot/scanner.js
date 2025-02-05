require("dotenv").config();
const bot = require("../tg/tg");

const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function fetchTopHolders(tokenAddress) {
  console.log(`🔄 Fetching top holders for token: ${tokenAddress}`);

  if (!tokenAddress) {
    console.error("❌ Error: tokenAddress is missing or undefined.");
    return [];
  }

  try {
    const url = `https://pro-api.solscan.io/v2.0/token/holders?address=${encodeURIComponent(tokenAddress)}&page=1&page_size=20`;
    console.log(`📡 API Request URL: ${url}`);

    const requestOptions = {
      method: "get",
      headers: { "token": SOLSCAN_API_KEY }
    }

    const response = await fetch(url, requestOptions)

    const text = await response.text(); // Read raw response

    const data = JSON.parse(text);
    if (!data.success || !data.data || !data.data.items) {
      console.error("⚠️ Unexpected API response format:", data);
      return [];
    }

    // Extract relevant information
    const holders = data.data.items.map(holder => ({
      address: holder.address,
      amount: holder.amount,
      decimals: holder.decimals,
      owner: holder.owner,
      rank: holder.rank,
    }));

    console.log(`✅ Successfully fetched ${holders.length} holders for ${tokenAddress}`);
    return holders;

  } catch (error) {
    console.error(`❌ Error fetching holders for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function fetchTokenMetadata(tokenAddress) {
  console.log(`🔄 Fetching metadata for token: ${tokenAddress}`);

  try {
    const url = `https://pro-api.solscan.io/v2.0/token/meta?address=${encodeURIComponent(tokenAddress)}`;
    const requestOptions = {
      method: "get",
      headers: { "token": SOLSCAN_API_KEY }
    };
    const response = await fetch(url, requestOptions);
    const data = await response.json();

    if (data.success && data.data && data.data.supply) {
      return data.data.supply; // Return total supply
    } else {
      console.error(`❌ Error fetching token metadata: Invalid response`);
      return 1; // Default to 1 to avoid division by zero
    }
  } catch (error) {
    console.error(`❌ Error fetching token metadata for ${tokenAddress}:`, error.message);
    return 1; // Default to 1 to avoid division by zero
  }
}


async function fetchDefiActivities(walletAddress, tokenAddress) {

  try {
    const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${encodeURIComponent(walletAddress)}&activity_type[]=ACTIVITY_TOKEN_SWAP&activity_type[]=ACTIVITY_AGG_TOKEN_SWAP&page=1&page_size=100&sort_by=block_time&sort_order=desc`;

    const requestOptions = {
      method: "get",
      headers: { "token": SOLSCAN_API_KEY }
    };

    const response = await fetch(url, requestOptions);
    const data = await response.json();
    const activities = data?.data || [];
    let buys = 0, sells = 0, totalBought = 0, totalSold = 0;

    activities.forEach((tx) => {
      if (tx.routers) {
        const routers = Array.isArray(tx.routers) ? tx.routers : [tx.routers];
        routers.forEach((router) => {
          const { token1, token2 } = router;
          // Checking if tokenAddress is part of the swap and incrementing buys/sells accordingly
          if (token1 === tokenAddress) {
            sells++; // Swapping out the tokenAddress
            totalBought += router.amount1 || 0; // Accumulate the amount of token2 (the bought token)

          } else if (token2 === tokenAddress) {
            buys++; // Receiving the tokenAddress
            totalBought += router.amount2 || 0; // Accumulate the amount of token2 (the bought token)

          }
        });
      }
    });

    return { buys, sells, totalBought, totalSold };

  } catch (error) {
    console.error(`❌ Error fetching activity for ${walletAddress}:`, error.message);
    return { buys: 0, sells: 0 };
  }
}

async function getTokenHolderData(tokenAddress) {
  console.log(`🔄 Fetching token holder data for: ${tokenAddress}`);
  const holders = await fetchTopHolders(tokenAddress);
  if (!holders.length) {
    console.log(`⚠️ No holders found for token: ${tokenAddress}`);
    return [];
  }

  const totalSupply = await fetchTokenMetadata(tokenAddress);
  if (totalSupply === 1) {
    console.log(`⚠️ Invalid supply value for token: ${tokenAddress}`);
    return [];
  }

  const holderData = await Promise.all(
    holders.map(async (holder) => {
      const address = holder.owner;
      // Fetch buy/sell data and total bought and sold data independently for each holder
      const { buys, sells, totalBought, totalSold } = await fetchDefiActivities(address, tokenAddress);

      // Calculating the percentage of total supply for tokens bought and sold by this holder
      const totalBoughtPercentage = ((totalBought / totalSupply) * 100).toFixed(2);
      const totalSoldPercentage = ((totalSold / totalSupply) * 100).toFixed(2);

      // Returning the processed data for each holder
      return {
        Rank: holder.rank,
        Address: `${address}`, // Shortened for readability
        "Current Holding (%)": ((holder.amount / totalSupply) * 100).toFixed(2),
        "Total Buys": buys,
        "Total Sells": sells,
        "Total Bought (%)": totalBoughtPercentage, // Add the new value for bought percentage
        "Total Sold (%)": totalSoldPercentage, // Add the new value for sold percentage
      };
    })
  );

  return holderData;
}

function formatHolderData(holdersData, tokenCa) {
  if (!holdersData.length) {
    return "❌ No data available for this token.";
  }

  // Start the message with a header
  let message = `🔹 *Top 20 Token Holders for* [${tokenCa}](https://solscan.io/token/${tokenCa})\n\n`;

  // Use triple backticks to format the table as monospace
  message += "```\n"; // Start monospace block

  // Add a header line for each column
  message += `🏅 Rank  | 🏠 Address | 📊 Holding (%) | 🟢 Buys | 🔴 Sells | ⬆️ Total Bought (%) | ⬇️ Total Sold (%)\n`;
  message += `--------------------------------------------------------------------------------------\n`;

  // Loop through each holder and format the row
  holdersData.forEach((holder) => {
    message += `${holder.Rank.toString().padEnd(2)} | ${holder.Address.slice(0, 3).padEnd(1)} | ${holder["Current Holding (%)"].toString().padEnd(4)} | 🟢 ${holder["Total Buys"].toString().padEnd(1)} | 🔴 ${holder["Total Sells"].toString().padEnd(1)} | ⬆️ ${holder["Total Bought (%)"].toString().padEnd(4)} | ⬇️ ${holder["Total Sold (%)"].toString().padEnd(4)}\n`;
  });

  message += "```"; // End monospace block

  return message;
}


// Function to send the initial message with the refresh button
async function sendMessageWithButton(chatId, tokenAddress) {
  // Fetch the latest data
  const holderData = await getTokenHolderData(tokenAddress);
  const telegramMessage = formatHolderData(holderData, tokenAddress);
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

  // Send the message with data and the refresh button, and return the message ID
  return bot.sendMessage(chatId, telegramMessage, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup,
    disable_web_page_preview: true // Prevents URL preview
  });
}

// Listen for Solana token addresses in messages
bot.on("message", async (msg) => {
  if (!msg.text) return; // Ensure it's a text message

  const tokenAddress = msg.text.trim();
  if (!SOLANA_ADDRESS_REGEX.test(tokenAddress)) {
    bot.sendMessage(msg.chat.id, `Send me a valid Solana token address`, { parse_mode: "Markdown" });
    return;
  }

  const chatId = msg.chat.id;

  // Send a message indicating that data is being fetched
  const loadingMessage = await bot.sendMessage(chatId, `🔍 Fetching data for *${tokenAddress}*...\nPlease wait...`, { parse_mode: "Markdown" });

  try {
    // Send the data along with the refresh button, and store the sent message's ID
    const sentMessage = await sendMessageWithButton(chatId, tokenAddress);

    // Optionally, delete the loading message once the data is ready
    await bot.deleteMessage(chatId, loadingMessage.message_id);

    console.log(`📤 Sent data to user for token: ${tokenAddress}`);
  } catch (error) {
    bot.sendMessage(chatId, "❌ An error occurred while processing the request. Please try again later.");
    console.error("Error in /fresh command:", error.message);
  }
});

// Handle the "Refresh Data" button press
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const tokenAddress = query.data.split('_')[1]; // Extract the token address from the callback data

  if (query.data.startsWith('refresh_')) {
    try {
      // Answer the callback query to acknowledge the press
      bot.answerCallbackQuery(query.id, { text: 'Refreshing data...', show_alert: false });

      // Fetch the latest data
      const holderData = await getTokenHolderData(tokenAddress);
      const formattedMessage = formatHolderData(holderData, tokenAddress);

      // Check if the new data is the same as the old one
      const currentMessage = query.message.text;

      // If the new message content is identical, do not update the message
      if (formattedMessage === currentMessage) {
        console.log("No update needed. Data is the same.");
        return; // Skip the update
      }

      // Edit the message with the updated content and refresh button
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🔄 Refresh Data',
              callback_data: `refresh_${tokenAddress}`
            }
          ]
        ]
      };

      // Edit the existing message with updated holder data
      bot.editMessageText(formattedMessage, {
        chat_id: chatId,
        message_id: query.message.message_id, // Use the original message ID
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
        disable_web_page_preview: true // Prevents URL preview

      });

      console.log(`📤 Refreshed data for token: ${tokenAddress}`);
    } catch (error) {
      console.error("Error handling refresh:", error);
      bot.sendMessage(chatId, "❌ An error occurred while refreshing data. Please try again later.");
    }
  }
});




// Start the bot
console.log("🚀 Telegram Bot is running...");
