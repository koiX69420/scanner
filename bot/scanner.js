require("dotenv").config();
const bot = require("../tg/tg");

const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function fetchTopHolders(tokenAddress) {
  console.log(`🔄 Fetching top holders for token: ${tokenAddress}`);
  if (!tokenAddress) return [];

  try {
    const url = `https://pro-api.solscan.io/v2.0/token/holders?address=${encodeURIComponent(tokenAddress)}&page=1&page_size=20`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const data = await response.json();

    if (!data.success || !data.data || !data.data.items) {
      console.error("⚠️ Unexpected API response format:", data);
      return [];
    }

    return data.data.items.map(holder => ({
      address: holder.address,
      amount: holder.amount,
      decimals: holder.decimals,
      owner: holder.owner,
      rank: holder.rank,
    }));
  } catch (error) {
    console.error(`❌ Error fetching holders for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function fetchTokenMetadata(tokenAddress) {
  try {
    const url = `https://pro-api.solscan.io/v2.0/token/meta?address=${encodeURIComponent(tokenAddress)}`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const data = await response.json();
    return data.data; // Default supply to 1 to prevent division errors
  } catch (error) {
    console.error(`❌ Error fetching token metadata:`, error.message);
    return { supply: 1 };
  }
}

async function fetchDefiActivities(walletAddress, tokenAddress) {
  try {
    const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${encodeURIComponent(walletAddress)}&activity_type[]=ACTIVITY_TOKEN_SWAP&activity_type[]=ACTIVITY_AGG_TOKEN_SWAP&page=1&page_size=100&sort_by=block_time&sort_order=desc`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const activities = (await response.json())?.data || [];

    let buys = 0, sells = 0, totalBought = 0, totalSold = 0;
    activities.forEach(tx => {
      (Array.isArray(tx.routers) ? tx.routers : [tx.routers]).forEach(router => {
        if (router.token1 === tokenAddress) {
          sells++;
          totalSold += router.amount1 || 0;
        } else if (router.token2 === tokenAddress) {
          buys++;
          totalBought += router.amount2 || 0;
        }
      });
    });

    return { buys, sells, totalBought, totalSold };
  } catch (error) {
    console.error(`❌ Error fetching activity for ${walletAddress}:`, error.message);
    return { buys: 0, sells: 0, totalBought: 0, totalSold: 0 };
  }
}

async function getTokenHolderData(tokenAddress, supply) {
  console.log(`🔄 Fetching token holder data for: ${tokenAddress}`);
  const holders = await fetchTopHolders(tokenAddress);
  if (!holders.length) return [];

  return await Promise.all(
    holders.map(async holder => {
      const { buys, sells, totalBought, totalSold } = await fetchDefiActivities(holder.owner, tokenAddress);
      return {
        Rank: holder.rank,
        Address: holder.owner,
        "Current Holding (%)": ((holder.amount / supply) * 100).toFixed(2),
        "Total Buys": buys,
        "Total Sells": sells,
        "Total Bought (%)": ((totalBought / supply) * 100).toFixed(2),
        "Total Sold (%)": ((totalSold / supply) * 100).toFixed(2),
      };
    })
  );
}
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function formatHolderData(holdersData, tokenAddress,metadata) {
  if (!holdersData.length) return "❌ No data available for this token.";

  let message = `🔹*MF Analysis:* [$${metadata.symbol}](https://solscan.io/token/${tokenAddress})\n`
  message+= `\`${tokenAddress}\`\n\n`
  const firstMintDate = formatTimestamp(metadata.first_mint_time);
  message+=`🛠️ Token created by: [${metadata.creator.slice(0,6)}](https://solscan.io/token/${tokenAddress})\n`
  message+=`📅 On ${firstMintDate}\n\n`
  message+="🔎 *Top 20 Mfers*\n"
  holdersData.forEach(holder => {
    message += `• *${holder["Current Holding (%)"]}%* [${holder.Address.slice(0, 4)}](https://solscan.io/account/${holder.Address}) \t|\t ⬆️ ${holder["Total Buys"]}/\u200B${holder["Total Sells"]} ⬇️ \t|\t 🟢 ${holder["Total Bought (%)"]}%/\u200B${holder["Total Sold (%)"]}% 🔴\n`;
  });
  message += `_Current Holding (%) Address \t|\t ⬆️ Buys/\u200BSells ⬇️ \t|\t 🟢 Total Bought (%)/\u200BTotal Sold (%) 🔴_\n\n`;


  return message;
}

async function generateTokenDataMessage(tokenAddress) {
  const metadata = await fetchTokenMetadata(tokenAddress);
  const holderData = await getTokenHolderData(tokenAddress, metadata.supply);
  const formattedMessage = formatHolderData(holderData, tokenAddress,metadata);

  return {
    text: formattedMessage,
    replyMarkup: {
      inline_keyboard: [[{ text: "🔄 Refresh Data", callback_data: `refresh_${tokenAddress}` }]],
    },
  };
}

async function sendMessageWithButton(chatId, tokenAddress) {
  const { text, replyMarkup } = await generateTokenDataMessage(tokenAddress);
  return bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

bot.on("message", async msg => {
  if (!msg.text) return;

  const tokenAddress = msg.text.trim();
  if (!SOLANA_ADDRESS_REGEX.test(tokenAddress)) {
    bot.sendMessage(msg.chat.id, "Send me a valid Solana token address", { parse_mode: "Markdown" });
    return;
  }

  const chatId = msg.chat.id;
  const loadingMessage = await bot.sendMessage(chatId, `🔍 Fetching data for *${tokenAddress}*...\nPlease wait...`, { parse_mode: "Markdown" });

  try {
    const sentMessage = await sendMessageWithButton(chatId, tokenAddress);
    await bot.deleteMessage(chatId, loadingMessage.message_id);
    console.log(`📤 Sent data to user for token: ${tokenAddress}`);
  } catch (error) {
    bot.sendMessage(chatId, "❌ An error occurred while processing the request. Please try again later.");
    console.error("Error in /fresh command:", error.message);
  }
});

bot.on("callback_query", async query => {
  if (!query.data.startsWith("refresh_")) return;

  const tokenAddress = query.data.split("_")[1];
  const chatId = query.message.chat.id;
  bot.answerCallbackQuery(query.id, { text: "Refreshing data...", show_alert: false });

  try {
    const { text, replyMarkup } = await generateTokenDataMessage(tokenAddress);
    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error("Error handling refresh:", error);
    bot.sendMessage(chatId, "❌ An error occurred while refreshing data. Please try again later.");
  }
});

console.log("🚀 Telegram Bot is running...");
