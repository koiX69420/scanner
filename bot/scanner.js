require("dotenv").config();
const bot = require("../tg/tg");

const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOP_HOLDERS = 20
const PAGE_SIZE = 20

async function fetchTopHolders(tokenAddress, maxHolders, pageSize) {
  console.log(`🔄 Fetching top ${maxHolders} holders for token: ${tokenAddress}`);
  if (!tokenAddress) return [];

  let allHolders = [];
  let currentPage = 1;
  let totalFetched = 0;

  try {
    while (totalFetched < maxHolders) {
      const url = `https://pro-api.solscan.io/v2.0/token/holders?address=${encodeURIComponent(tokenAddress)}&page=${currentPage}&page_size=${pageSize}`;

      const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
      const data = await response.json();

      if (!data.success || !data.data || !data.data.items || data.data.items.length === 0) {
        console.error("⚠️ Unexpected API response format or no more holders:", data);
        break;
      }

      const filteredHolders = data.data.items
        .filter(holder => holder.owner !== "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1")
        .map(holder => ({
          address: holder.address,
          amount: holder.amount,
          decimals: holder.decimals,
          owner: holder.owner,
          rank: holder.rank,
        }));

      allHolders = [...allHolders, ...filteredHolders];
      totalFetched = allHolders.length;

      if (data.data.items.length < pageSize) break; // Stop if API returned fewer results than pageSize
      currentPage++;
    }

    return allHolders.slice(0, maxHolders);
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
    const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${walletAddress}&activity_type[]=ACTIVITY_SPL_TRANSFER&value[]=5&token=So11111111111111111111111111111111111111111&page=1&page_size=40&sort_by=block_time&sort_order=desc`;
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
async function fetchTokenMarkets(tokenAddress) {
  try {
    const url = `https://pro-api.solscan.io/v2.0/token/markets?token[]=${tokenAddress}&page=1&page_size=10`;
    const response = await fetch(url, { method: "get", headers: { token: SOLSCAN_API_KEY } });
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    return []
  } catch (error) {
    console.error(`❌ Error fetching fetchTokenMarkets for ${tokenAddress}:`, error.message);
    return [];
  }
}

async function fetchDexSocials(pools) {
  try {
    const chainId = "solana"; // Set the chain ID if it's constant

    // Fetch data for all pool IDs in parallel
    const dexSocials = await Promise.all(
      pools.map(async (pool) => {
        const pairId = pool.pool_id;
        const { token_1, token_2 } = pool;

        // Check if either the base or quote token is Solana (SOL)
        if (token_1 !== 'So11111111111111111111111111111111111111112' && token_2 !== 'So11111111111111111111111111111111111111112') {
          return { pool_id: pairId, socials: [], websites: [] };
        }

        const url = `https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairId}`;

        try {
          const response = await fetch(url, { method: "GET" });
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          
          const result = await response.json();

          // Get the first valid pair from the response
          const pairData = result.pair;
          if (!pairData) return { pool_id: pairId, socials: [], websites: [] };

          const dexId = pairData.dexId; // Extract dexId

          const socials = (pairData.info?.socials || [])
            .map(social => ({
              type: social.type.toLowerCase(),
              url: social.url
            }));

          const websites = (pairData.info?.websites || [])
            .map(website => ({
              label: website.label.toLowerCase(),
              url: website.url
            }));

          return { pool_id: pairId, socials, websites, dexId };
        } catch (error) {
          console.error(`⚠️ Error fetching data for pair ${pairId}:`, error.message);
          return { pool_id: pairId, socials: [], websites: [] };
        }
      })
    );

    return dexSocials;
  } catch (error) {
    console.error("❌ Error fetching Dexscreener socials:", error.message);
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

async function fetchDexPay(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenAddress}`, {
      method: 'GET',
      headers: {},
    });
    const data = await response.json();
    if (data.length > 0) {
      return data
    } else {
      return {
        type: "tokenProfile",
        status: "unreceived",
        paymentTimestamp: 0
      }
    }
  } catch (error) {
    console.error(`❌ Error fetching dex pa for ${tokenAddress}:`, error.message);
    return {
      type: "tokenProfile",
      status: "unreceived",
      paymentTimestamp: 0
    }
  }

}

async function getTokenHolderData(tokenAddress, supply,maxHolders,pageSize) {
  console.log(`🔄 Fetching token holder data for: ${tokenAddress}`);
  const holders = await fetchTopHolders(tokenAddress, maxHolders, pageSize);
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

function formatTimestamp(timestamp) {

  if (!timestamp || isNaN(timestamp)) return "❌ Invalid Time"; // Handle bad data

  let correctedTimestamp;

  if (timestamp < 1e12) {
    // Seconds (10-digit)
    correctedTimestamp = timestamp * 1000;
  } else if (timestamp < 1e15) {
    // Milliseconds (13-digit)
    correctedTimestamp = timestamp;
  } else if (timestamp < 1e18) {
    // Microseconds (16-digit) → Convert to milliseconds
    correctedTimestamp = Math.floor(timestamp / 1e3);
  } else {
    // Nanoseconds (19-digit) → Convert to milliseconds
    correctedTimestamp = Math.floor(timestamp / 1e6);
  }

  const date = new Date(correctedTimestamp);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
function formatMarketCap(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`; // Billions
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`; // Millions
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`; // Thousands
  return value.toFixed(2); // Less than 1,000
}
function formatHolderData(holdersData, tokenAddress, metadata, tokenHistory, clusterPercentages, dexPay, dexSocials, isSummary = false) {
  if (!holdersData.length) return "❌ No data available for this token.";

  let alertEmojiCount = 0; // Counter for alert emojis

  holdersData.slice(0,20).forEach(holder => {
    const cluster = clusterPercentages.find(cluster => cluster.recipients.includes(holder.Address));
    if (
      cluster ||
      holder["Total Buys"] === 0 && parseFloat(holder["Current Holding (%)"]) > 0 ||
      parseFloat(holder["Total Sold (%)"]) > parseFloat(holder["Total Bought (%)"]) ||
      (parseFloat(holder["Total Bought (%)"]) !== parseFloat(holder["Current Holding (%)"]) && holder["Total Sells"] === 0)
    ) {
      alertEmojiCount++;
    }
  });

  let message = generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials);

  message += generateClusterAnalysis(holdersData, clusterPercentages, isSummary);
  // **Only include Top 20 holders for the detailed report**
  if (!isSummary) {
    message += generateTop20Holders(holdersData.slice(0,20), clusterPercentages);
  }


  // **Only include Tooltip in the detailed report**
  if (!isSummary) {
    message += generateTooltip();
  }

  return message;
}

// Generates the common message structure
function generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials) {
  const firstMintDate = formatTimestamp(metadata.created_time || metadata.first_mint_time);

  let message = `🔹*MF Analysis:* [$${metadata.symbol}](https://solscan.io/token/${tokenAddress})\n`;
  message += `\`${tokenAddress}\`\n\n`;
  message += `🛠️ Token created by: [${metadata.creator.slice(0, 4)}...${metadata.creator.slice(-4)}](https://solscan.io/token/${tokenAddress})\n`;
  message += `📅 On ${firstMintDate}\n`;
  message += `🗣️ `
  // Extract socials from metadata
// Extract socials from metadata
const socials = {
  website: metadata.metadata.website ? `[Web](${metadata.metadata.website})` : null,
  twitter: metadata.metadata.twitter ? `[𝕏](${metadata.metadata.twitter})` : null,
  telegram: metadata.metadata.telegram ? `[TG](${metadata.metadata.telegram})` : null,
};

let isBonded = false;
let raydiumSocialsExtracted = false;

// Extract socials from dexSocials if available
if (Array.isArray(dexSocials)) {
  dexSocials.forEach(pool => {
    // If dexId is not "pumpfun", mark as bonded
    if (pool.dexId !== "pumpfun") {
      isBonded = true;
    }

    // Process Raydium pool if not already processed
    if (pool.dexId === "raydium" && !raydiumSocialsExtracted) {
      // Extract website and socials from Raydium
      if (Array.isArray(pool.websites)) {
        pool.websites.forEach(website => {
          if (website && typeof website.url === "string") {
            socials.website = `[Web](${website.url})`;
          }
        });
      }

      if (Array.isArray(pool.socials)) {
        pool.socials.forEach(({ type, url }) => {
          if (type && url) {
            const lowerPlatform = type.toLowerCase();
            if (lowerPlatform === "twitter" && !socials.twitter) {
              socials.twitter = `[𝕏](${url})`;
            }
            if (lowerPlatform === "telegram" && !socials.telegram) {
              socials.telegram = `[TG](${url})`;
            }
          }
        });
      }

      // Mark Raydium socials as extracted
      raydiumSocialsExtracted = true;
    } else if (raydiumSocialsExtracted) {
      // Extract socials from other pools after Raydium has been processed
      if (Array.isArray(pool.websites)) {
        pool.websites.forEach(website => {
          if (website && typeof website.url === "string") {
            socials.website = socials.website || `[Web](${website.url})`;
          }
        });
      }

      if (Array.isArray(pool.socials)) {
        pool.socials.forEach(({ type, url }) => {
          if (type && url) {
            const lowerPlatform = type.toLowerCase();
            if (lowerPlatform === "twitter" && !socials.twitter) {
              socials.twitter = `[𝕏](${url})`;
            }
            if (lowerPlatform === "telegram" && !socials.telegram) {
              socials.telegram = `[TG](${url})`;
            }
          }
        });
      }
    }
  });
}


  // Add available social links
  message += Object.values(socials).filter(Boolean).join(" | ") + " | ";
  message += `[Dex](https://dexscreener.com/solana/${tokenAddress})`;
  message += "\n"; // Add spacing before the next section
  message += isBonded ? "🪢 Bonded\n\n" : "\n";

  const statusEmojis = {
    approved: "✅",
    processing: "⏳",
    unreceived: "❌"
  };

  if (dexPay.length > 0) {
    message += `🦅 *Dexscreener Updates*\n`;

    dexPay.forEach(order => {
      const paymentTime = formatTimestamp(order.paymentTimestamp)
      const emoji = statusEmojis[order.status] || "❓";

      message += `  • ${order.type}: ${emoji} on ${paymentTime}\n`;
    });

    message += "\n"; // Add spacing after listing orders
  } else {
    message += `🦅 Dexscreener Updates: ❌ No orders found\n\n`;
  }
  message += `⚠️ *${alertEmojiCount} Sus Wallet${alertEmojiCount === 1 ? '' : 's'} in Top ${TOP_HOLDERS} Holders* ⚠️\n\n`;

  message += `🏷️ *Previous Tokens Created: ${tokenHistory.length - 1}*\n`;
  if (tokenHistory.length > 1) {
    const sortedTokens = [...tokenHistory].sort((a, b) => (b.metadata?.market_cap || 0) - (a.metadata?.market_cap || 0));

    sortedTokens.forEach(token => {
      if (token.metadata.address !== tokenAddress) {
        const flag = token.metadata?.market_cap ? `:_${formatMarketCap(token.metadata.market_cap)}_` : "";
        message += `[$${token.metadata.symbol}](https://solscan.io/token/${token.metadata.address})${flag}\t`;
      }
    });

    message += "\n";
  }

  return message + "\n";
}

// Generates the Top 20 Holders section
function generateTop20Holders(holdersData, clusterPercentages) {
  let top20Mfers = "\n🔎 *Top 20 Mfers*\n";

  holdersData.forEach((holder, index) => {
    let alertEmoji = "";
    let clusterInfo = "";

    const cluster = clusterPercentages.find(cluster => cluster.recipients.includes(holder.Address));
    if (
      holder["Total Buys"] === 0 && parseFloat(holder["Current Holding (%)"]) > 0 ||
      parseFloat(holder["Total Sold (%)"]) > parseFloat(holder["Total Bought (%)"]) ||
      (parseFloat(holder["Total Bought (%)"]) !== parseFloat(holder["Current Holding (%)"]) && holder["Total Sells"] === 0)) {
      alertEmoji = "⚠️";
    }

    if (cluster) {
      clusterInfo = ` (Bundle #${clusterPercentages.indexOf(cluster) + 1})`;
      alertEmoji = "⚠️";
    }

    // Determine which emoji to use at the end (🟢 if bought more, 🔴 if sold more)
    const trendEmoji = parseFloat(holder["Total Sold (%)"]) > 0 ? "🔴" : "🟢";

    top20Mfers += `#${index + 1} *${holder["Current Holding (%)"]}%* [${holder.Address.slice(0, 4)}...${holder.Address.slice(-4)}](https://solscan.io/account/${holder.Address})${alertEmoji}${clusterInfo}\n`;
    top20Mfers += `\t\t\t\t⬆️ ${holder["Total Buys"]}/\u200B${holder["Total Sells"]} ⬇️ \t|\t ${holder["Total Bought (%)"]}%/\u200B${holder["Total Sold (%)"]}% ${trendEmoji}\n\n`;
  });

  return top20Mfers + "\n";
}


// Generates the Cluster Analysis section
function generateClusterAnalysis(holdersData, clusterPercentages, isSummary) {
  const totalBundleHoldings = clusterPercentages.reduce(
    (sum, cluster) => sum + parseFloat(cluster.totalHoldings || 0),
    0
  ).toFixed(2);

  let message = `🧩 *Bundle Analysis - ${clusterPercentages.length} bundles with ${totalBundleHoldings}% supply*\n`;
  message+=`_Showing only top 4 recipients per bundle_\n`
  const top5Clusters = clusterPercentages.slice(0, 3);

  top5Clusters.forEach((cluster, index) => {
    const senderData = holdersData.find(item => item.Address === cluster.sender);
    const senderHolding = senderData ? senderData.holding : "N/A";

    const totalClusterHoldings = (parseFloat(cluster.totalHoldings) + (parseFloat(senderHolding) || 0)).toFixed(2);
    message += `*#${index + 1}* Bundle Holdings: ${totalClusterHoldings}%\n`;
    message += `    🕵️‍♂️ Funding Wallet: [${cluster.sender.slice(0, 4)}...${cluster.sender.slice(-4)}](https://solscan.io/account/${cluster.sender})`;
    if (senderHolding !== "N/A") {
      message += ` - *${senderHolding}%*`;
    }
    message += "\n";


    // **Only include recipient breakdown in detailed report**
    // if (!isSummary) {
    if (true) {
      message += `  Recipients: ${cluster.recipients.length}\n`;
      cluster.recipients.slice(0,4).forEach(recipient => {
        const recipientData = holdersData.find(item => item.Address === recipient);
        const holding = recipientData ? recipientData["Current Holding (%)"] : "N/A";
        const ranking = holdersData.findIndex(holder => holder.Address === recipient) + 1;
        const rankingText = ranking > 0 ? `#*${ranking}*` : "";

        message += `   - ${rankingText.padEnd(6)} [${recipient.slice(0, 6)}...](https://solscan.io/account/${recipient}): *${holding}%*\n`;
      });
    }
  });

  return message;
}

// Generates the Tooltip section (only for the detailed report)
function generateTooltip() {
  let tooltip = "\n*Tooltip*\n";
  tooltip += `_Current Holding (%) Address\n\t\t\t\t⬆️ Buys/\u200BSells ⬇️ \t|\t Total Bought (%)/\u200BTotal Sold (%)_ (🟢: hasn't sold) (🔴:has sold) \n\n`;
  tooltip += "🔍 _What is a Sus Wallet?\n";
  tooltip += "⚠️ A wallet is flagged as suspicious if:\n";
  tooltip += "  - It received tokens but has 0 buys.\n";
  tooltip += "  - It has sold more tokens than it bought.\n";
  tooltip += "  - Its Part of a Bundle._\n\n";
  return tooltip;
}




async function generateTokenMessage(tokenAddress, isSummary = true) {
  // First, fetch metadata (independent), then fetch tokenHistory (dependent on metadata)
  const metadata = await fetchTokenMetadata(tokenAddress);
  const tokenHistory = await fetchTokenCreationHistory(metadata.creator);

  // Fetch remaining data in parallel (which doesn't depend on metadata or tokenHistory)
  const moreHolderDataPromise = getTokenHolderData(tokenAddress, metadata.supply, 200, 40);
  const fundingMapPromise = moreHolderDataPromise.then(data => getFundingMap(data));
  const dexPayPromise = fetchDexPay(tokenAddress);
  const poolsPromise = fetchTokenMarkets(tokenAddress);

  // Wait for all the independent data to finish fetching
  const [moreHolderData, fundingMap, dexPay, pools] = await Promise.all([moreHolderDataPromise, fundingMapPromise, dexPayPromise, poolsPromise]);

  // Calculate cluster percentages after fetching the required data
  const clusterPercentages = await calculateClusterPercentages(moreHolderData, fundingMap);

  // Fetch Dex Socials (which also can run in parallel)
  const dexSocials = await fetchDexSocials(pools);

  // Format the message based on all the fetched data
  const formattedMessage = formatHolderData(moreHolderData, tokenAddress, metadata, tokenHistory, clusterPercentages, dexPay, dexSocials, isSummary);

  console.log("Sent message");

  // Create buttons based on the summary flag
  const buttons = isSummary
    ? [
        [{ text: "🔎 Show Details", callback_data: `showDetails_${tokenAddress}` }],
        [{ text: "🔄 Refresh Summary", callback_data: `refresh_${tokenAddress}` }],
      ]
    : [
        [{ text: "🔄 Refresh Details", callback_data: `showDetails_${tokenAddress}` }],
        [{ text: "🔎 Show Summary", callback_data: `refresh_${tokenAddress}` }],
      ];

  return {
    text: formattedMessage,
    replyMarkup: { inline_keyboard: buttons },
  };
}

async function sendMessageWithButton(chatId, tokenAddress) {
  const { text, replyMarkup } = await generateTokenMessage(tokenAddress);
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
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  if (data.startsWith("refresh_") || data.startsWith("showDetails_")) {
    const tokenAddress = data.split("_")[1];
    const isSummary = !data.startsWith("showDetails_"); // If it's "showDetails_", set isSummary to false

    bot.answerCallbackQuery(query.id, {
      text: isSummary ? "Refreshing data..." : "Fetching details...",
      show_alert: false,
    });

    try {
      const { text, replyMarkup } = await generateTokenMessage(tokenAddress, isSummary);
      bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error("Error handling callback query:", error);
      bot.sendMessage(chatId, "❌ An error occurred while processing your request. Please try again later.");
    }
  }
});

console.log("🚀 Telegram Bot is running...");
