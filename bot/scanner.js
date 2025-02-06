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
    return data.data.items
      .filter(holder =>
        holder.owner !== "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
      ).map(holder => ({
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

async function fetchSolTransfers(walletAddress) {

  try {
    const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${walletAddress}&activity_type[]=ACTIVITY_SPL_TRANSFER&value[]=5&token=So11111111111111111111111111111111111111111&page=1&page_size=50&sort_by=block_time&sort_order=desc`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const data = await response.json();

    if (data.success) {
      return data.data;
    }
    return []
  } catch (error) {
    console.error(`❌ Error fetching token creation history for ${walletAddress}:`, error.message);
    return [];
  }
}

async function getFundingMap(topHolders) {
  const fundingMap = {}; // Map to group funding wallets for clustering

  // Use a map to fetch transactions for all holders concurrently
  const fetchPromises = topHolders.map(holder => fetchSolTransfers(holder.Address));
  const allSolTransactions = await Promise.all(fetchPromises); // Wait for all transactions to be fetched

  // Now iterate over the transactions and group them into fundingMap
  for (let i = 0; i < topHolders.length; i++) {
    const holder = topHolders[i].Address;
    const solTransactions = allSolTransactions[i]; // Get the transactions for this holder

    // Iterate through transactions and populate the funding map
    for (const transaction of solTransactions) {
      const recipient = transaction.to_address;
      const sender = transaction.from_address;

      // If the recipient is the current holder, add sender to funding map
      if (recipient === holder) {
        if (!fundingMap[sender]) {
          fundingMap[sender] = new Set();
        }
        fundingMap[sender].add(holder);
      }
    }
  }

  return fundingMap;
}



async function fetchTokenCreationHistory(walletAddress) {
  try {
    const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${encodeURIComponent(walletAddress)}&activity_type[]=ACTIVITY_SPL_INIT_MINT&page=1&page_size=100&sort_by=block_time&sort_order=desc`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const activities = (await response.json())?.data || [];
    // Map through transactions and fetch metadata for each created token
    const tokensCreated = await Promise.all(
      activities.flatMap(tx => {
        const routers = Array.isArray(tx.routers) ? tx.routers : [tx.routers];
        return routers
          .filter(router => router.token1) // Ensure token1 exists
          .map(async router => {
            const metadata = await fetchTokenMetadata(router.token1);
            return {
              tokenAddress: router.token1,
              metadata,
            };
          });
      })
    );
    return tokensCreated.filter(Boolean); // Remove any undefined/null values

  } catch (error) {
    console.error(`❌ Error fetching token creation history for ${walletAddress}:`, error.message);
    return [];
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
function formatMarketCap(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`; // Billions
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`; // Millions
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`; // Thousands
  return value.toFixed(2); // Less than 1,000
}
function formatHolderData(holdersData, tokenAddress, metadata, tokenHistory, clusterPercentages) {
  if (!holdersData.length) return "❌ No data available for this token.";
  let alertEmojiCount = 0;  // Counter for alert emojis
  let top20Mfers = "\n"
  top20Mfers += "🔎 *Top 20 Mfers*\n";
  holdersData.forEach((holder, index) => {
    let alertEmoji = "";
    let clusterInfo = "";

    // Check for the conditions
    if (holder["Total Buys"] === 0 && parseFloat(holder["Current Holding (%)"]) > 0) {
      alertEmoji = "⚠️"; // Alert if the wallet has 0 buys but has received supply
      alertEmojiCount++;  // Increment alert emoji count

    } else if (parseFloat(holder["Total Sold (%)"]) > parseFloat(holder["Total Bought (%)"])) {
      alertEmoji = "⚠️"; // Alert if the wallet has sold more than bought
      alertEmojiCount++;  // Increment alert emoji count
    } else if (parseFloat(holder["Total Bought (%)"]) !== parseFloat(holder["Current Holding (%)"]) && holder["Total Sells"] === 0) {
      alertEmoji = "⚠️"; // Add an additional alert emoji for this case
      alertEmojiCount++;  // Increment alert emoji count
    }

    // Check if part of a cluster
    const cluster = clusterPercentages.find(cluster => cluster.recipients.includes(holder.Address));
    if (cluster) {
      clusterInfo = ` (Cluster #${clusterPercentages.indexOf(cluster) + 1})`;
    }

    // Add the formatted message with alert and cluster info
    top20Mfers += `#${index + 1} *${holder["Current Holding (%)"]}%* [${holder.Address.slice(0, 4)}...${holder.Address.slice(-4)}](https://solscan.io/account/${holder.Address})${clusterInfo}\n\t\t\t\t⬆️ ${holder["Total Buys"]}/\u200B${holder["Total Sells"]} ⬇️ \t|\t 🟢 ${holder["Total Bought (%)"]}%/\u200B${holder["Total Sold (%)"]}% 🔴 ${alertEmoji}\n`;
  });

  top20Mfers += `_Current Holding (%) Address\nt\t\t\t\t⬆️ Buys/\u200BSells ⬇️ \t|\t 🟢 Total Bought (%)/\u200BTotal Sold (%) 🔴_\n\n`;

  let message = `🔹*MF Analysis:* [$${metadata.symbol}](https://solscan.io/token/${tokenAddress})\n`
  message += `\`${tokenAddress}\`\n\n`
  const firstMintDate = formatTimestamp(metadata.first_mint_time);
  message += `🛠️ Token created by: [${metadata.creator.slice(0, 6)}](https://solscan.io/token/${tokenAddress})\n`
  message += `📅 On ${firstMintDate}\n\n`
  message += `⚠️ *${alertEmojiCount} Sus Wallet${alertEmojiCount === 1 ? '' : 's'} in Top 20 Holders* ⚠️\n\n`;

  // 🏷️ List previously created tokens with market cap flag
  // 🏷️ List previously created tokens with market cap flag
  message += `🏷️ *Previous Tokens Created: ${tokenHistory.length - 1}*\n`;
  if (tokenHistory.length > 1) {
    // Sort by market_cap (tokens with market_cap come first, sorted in descending order)
    const sortedTokens = [...tokenHistory].sort((a, b) => {
      const mcA = a.metadata?.market_cap || 0;
      const mcB = b.metadata?.market_cap || 0;
      return mcB - mcA; // Descending order
    });

    sortedTokens.forEach(token => {

      if (token.metadata.address === tokenAddress) {
        return;
      }
      const flag = token.metadata?.market_cap
        ? `:_${formatMarketCap(token.metadata.market_cap)}_`
        : "";
      message += `[$${token.metadata.symbol}](https://solscan.io/token/${tokenAddress})${flag}\t`;
    });

    message += "\n";
  }
  message += "\n"

  message += `🧩 *Bundle Analysis - ${clusterPercentages.length} bundles found*\n`;

  // Add cluster data
  clusterPercentages.forEach((cluster, index) => {
    // Add sender and total holdings with sliced address and clickable
    const senderData = holdersData.find(item => item.Address === cluster.sender);
    const senderHolding = senderData ? senderData.holding : "N/A"; // Get sender holding
    message += `🧑‍💼 Funding Wallet: [${cluster.sender.slice(0, 6)}...](https://solscan.io/account/${cluster.sender})`;

    // Add the funding wallet's holding percentage (if available) right next to the sender
    if (senderHolding !== "N/A") {
      message += ` - * - ${senderHolding}%*`;
    }
    message += "\n"; // New line after funding wallet

    // Calculate the total cluster holdings including the funding wallet holdings
    const totalClusterHoldings = (parseFloat(cluster.totalHoldings) + (parseFloat(senderHolding) || 0)).toFixed(2);
    message += `💼 Cluster Holdings: ${totalClusterHoldings}%\n`;

    // List the recipients and their holdings, with sliced addresses and clickable
    message += `Recipients:\n`;
    cluster.recipients.forEach((recipient) => {
      const recipientData = holdersData.find(item => item.Address === recipient);
      const holding = recipientData ? recipientData["Current Holding (%)"] : "N/A"; // Get recipient holding

      // Find ranking of the recipient in the top holders list
      const ranking = holdersData.findIndex(holder => holder.Address === recipient) + 1;
      const rankingText = ranking > 0 ? `#*${ranking}*` : ""; // Format ranking as bold number in brackets

      // Adding cleaner spacing between values
      message += `   - ${rankingText.padEnd(6)} [${recipient.slice(0, 6)}...](https://solscan.io/account/${recipient}): *${holding}%*\n`;
    });

  });


  return message + top20Mfers;
}

async function calculateClusterPercentages(holderData, fundingMap) {
  try {
    console.log(`Calculating cluster percentages...`);

    // Create a lookup map for holderData based on Address for fast access
    const holderDataMap = holderData.reduce((map, item) => {
      map[item.Address] = item;
      return map;
    }, {});

    const clusterPercentages = [];

    // Iterate through the fundingMap entries
    for (const [sender, recipients] of Object.entries(fundingMap)) {
      // Skip if there are 1 or fewer recipients
      if (recipients.size <= 1) continue;
      console.log(recipients)

      let totalHoldings = 0;

      // Iterate through each recipient and calculate the total holdings
      recipients.forEach((recipient) => {
        const data = holderDataMap[recipient]; // Fast lookup
        if (data) {
          totalHoldings += parseFloat(data["Current Holding (%)"]); // Add recipient's holding percentage
        }
      });

      // Push the cluster data to the result if totalHoldings is greater than zero
      if (totalHoldings > 0) {
        clusterPercentages.push({
          sender,
          recipients: [...recipients],
          totalHoldings: totalHoldings
        });
      }
    }

    // Sort clusters by total holdings percentage (descending)
    clusterPercentages.sort((a, b) => b.totalHoldings - a.totalHoldings);
    return clusterPercentages;
  } catch (error) {
    console.error("Error calculating cluster percentages:", error);
    return [];
  }
}


async function generateTokenDataMessage(tokenAddress) {
  const metadata = await fetchTokenMetadata(tokenAddress);
  const creator = metadata.creator;
  const tokenHistory = await fetchTokenCreationHistory(creator);
  const holderData = await getTokenHolderData(tokenAddress, metadata.supply);
  const fundingMap = await getFundingMap(holderData);
  const clusterPercentages = await calculateClusterPercentages(holderData, fundingMap);
  const formattedMessage = formatHolderData(holderData, tokenAddress, metadata, tokenHistory, clusterPercentages);
  console.log("Sent message")
  return {
    text: formattedMessage,
    replyMarkup: {
      inline_keyboard: [[{ text: "🔄 Refresh Data", callback_data: `refresh_${tokenAddress}` }]],
    },
  };
}

async function sendMessageWithButton(chatId, tokenAddress) {
  const { text, replyMarkup } = await generateTokenDataMessage(tokenAddress);
  console.log("Sent message")
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
