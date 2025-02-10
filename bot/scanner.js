require("dotenv").config();
const bot = require("../tg/tg");


const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_HOLDERS = 60
const MAX_API_CALLS_PER_MINUTE = 1000;
// we have holders*2+15 calls, we need double the amount as buffer to never error
const API_CALLS_PER_REQUEST = MAX_HOLDERS * 2 + 30;
const REFILL_RATE = MAX_API_CALLS_PER_MINUTE / 60; // ≈ 16.67 per second

let availableApiCalls = MAX_API_CALLS_PER_MINUTE; // Start with full quota
const {
  fetchTopHolders,
  fetchDefiActivities,
  fetchTokenMetadata,
  fetchTokenMarkets,
  fetchTokenCreationHistory,
  fetchSolTransfers,
  getApiCallCount
} = require('./solscanApi');
// Refactored main function to fetch all token holder data and related activities concurrently
async function getTokenHolderData(tokenAddress, supply, maxHolders, pageSize) {
  console.log(`🔄 Fetching token holder data for: ${tokenAddress}`);
  const holders = await fetchTopHolders(tokenAddress, maxHolders, pageSize);
  if (!holders.length) return [];

  const defiResults = await Promise.all(holders.map(holder => fetchDefiActivities(holder.owner, tokenAddress)));

  // Directly map defiResults to the final return format
  return defiResults.map(({ walletAddress, buys, sells, totalBought, totalSold, transactionCount }, index) => ({
    Address: walletAddress,
    "Current Holding (%)": ((holders[index].amount / supply) * 100).toFixed(2),
    "Total Buys": buys,
    "Total Sells": sells,
    "Total Bought (%)": ((totalBought / supply) * 100).toFixed(2),
    "Total Sold (%)": ((totalSold / supply) * 100).toFixed(2),
    "Transaction Count": transactionCount
  }));
}


async function fetchDexSocials(pools) {
  try {
    const chainId = "solana"; // Set the chain ID if it's constant

    // Fetch data for all pool IDs in parallel
    const dexSocials = await Promise.all(
      pools.map(async (pool) => {
        console.log(pool)
        const pairId = pool.pool_id;
        const { token_1, token_2 } = pool;

        // Check if either the base or quote token is Solana (SOL)
        if (token_1 !== 'So11111111111111111111111111111111111111112' && token_2 !== 'So11111111111111111111111111111111111111112') {
          return { pool_id: "N/A", socials: [], websites: [] };
        }

        const url = `https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairId}`;

        try {
          const response = await fetch(url, { method: "GET" });
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

          const result = await response.json();
          console.log(result)
          // Get the first valid pair from the response
          const pairData = result.pair;
          if (!pairData) return { pool_id: "N/A", socials: [], websites: [] };

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

  const batchSize = 10; // Adjust based on API limits and network conditions
  const batches = [];

  // Split topHolders into batches for better concurrency
  for (let i = 0; i < topHolders.length; i += batchSize) {
    batches.push(topHolders.slice(i, i + batchSize));
  }

  // Fetch transactions for each batch of holders concurrently
  const fetchPromises = batches.map(batch => {
    const holderAddresses = batch.map(holder => holder.Address);
    return fetchTransactionsForBatch(holderAddresses);
  });

  // Wait for all batches to be fetched
  const allSolTransactions = await Promise.all(fetchPromises);

  // Iterate over the fetched transactions and populate the funding map
  allSolTransactions.forEach((batchTransactions, batchIndex) => {
    const batchHolders = batches[batchIndex]; // Get holders for the current batch

    batchTransactions.forEach((solTransactions, holderIndex) => {
      const holder = batchHolders[holderIndex].Address;

      // Iterate through transactions and populate the funding map
      solTransactions.forEach(transaction => {
        const recipient = transaction.to_address;
        const sender = transaction.from_address;

        // If the recipient is the current holder, add sender to funding map
        if (recipient === holder) {
          if (!fundingMap[sender]) {
            fundingMap[sender] = new Set();
          }
          fundingMap[sender].add(holder); // Add holder to sender's list
        }
      });
    });
  });

  return fundingMap;
}
// Fetch transactions for a batch of holders
async function fetchTransactionsForBatch(holderAddresses) {
  // Create a batch of promises for fetching transactions
  const fetchPromises = holderAddresses.map(walletAddress => fetchSolTransfers(walletAddress));

  // Wait for all transactions to be fetched concurrently for the batch
  return await Promise.all(fetchPromises);
}



async function fetchDexPay(tokenAddress) {
  const url = `https://api.dexscreener.com/orders/v1/solana/${tokenAddress}`;

  try {
    const response = await fetch(url, { method: 'GET', headers: {} });

    // Check for valid response status
    if (!response.ok) {
      console.error(`❌ Error fetching data for ${tokenAddress}: Status ${response.status}`);
      return {
        type: "tokenProfile",
        status: "unreceived",
        paymentTimestamp: 0
      };
    }

    const data = await response.json();

    // Return data if found; otherwise, return default value
    return data.length > 0 ? data : {
      type: "tokenProfile",
      status: "unreceived",
      paymentTimestamp: 0
    };
  } catch (error) {
    console.error(`❌ Error fetching dex pay for ${tokenAddress}:`, error.message);
    return {
      type: "tokenProfile",
      status: "unreceived",
      paymentTimestamp: 0
    };
  }
}


"BX5AntN3EvDFNeZiNzMtyoHtoNqX7smZ3DErEkzpump"
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
  const top20Data = holdersData.slice(0, 20);
  const alertEmojiCount = countSuspiciousWallets(top20Data, clusterPercentages);
  
  let message = generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials, top20Data, clusterPercentages);
  message += generateClusterAnalysis(holdersData, clusterPercentages, isSummary);
  if (!isSummary) {
    message += generateTop20Holders(top20Data, clusterPercentages);
    message += generateTooltip();
  }
  
  return message;
}

function countSuspiciousWallets(holderData, clusterPercentages) {
  return holderData.reduce((count, holder) => {
    return count + (isSuspicious(holder, clusterPercentages) ? 1 : 0);
  }, 0);
}

function isSuspicious(holder, clusterPercentages) {
  const inCluster = clusterPercentages.some(cluster => cluster.recipients.includes(holder.Address));
  return (
    inCluster ||
    holder["Transaction Count"] < 10 ||
    (holder["Total Buys"] === 0 && parseFloat(holder["Current Holding (%)"]) > 0) ||
    parseFloat(holder["Total Sold (%)"]) > parseFloat(holder["Total Bought (%)"]) ||
    (parseFloat(holder["Total Bought (%)"]) !== parseFloat(holder["Current Holding (%)"]) && holder["Total Sells"] === 0)
  );
}

function analyzeWallets(top20Data, clusterPercentages) {
  let sellingWallets = 0, zeroBuyWallets = 0;
  let freshWallets = new Set(), bundledWallets = new Set();
  
  top20Data.forEach(holder => {
    if (parseFloat(holder["Total Sold (%)"]) > 0) sellingWallets++;
    if (holder["Total Buys"] === 0) zeroBuyWallets++;
    if (holder["Transaction Count"] < 10) freshWallets.add(holder.Address);
  });

  clusterPercentages.forEach(cluster => {
    cluster.recipients.forEach(recipient => {
      if (top20Data.some(holder => holder.Address === recipient) && !bundledWallets.has(recipient)) {
        bundledWallets.add(recipient);
      }
    });
  });
  
  const bundledFreshWallets = [...bundledWallets].filter(wallet => freshWallets.has(wallet)).length;
  const freshNotBundled = [...freshWallets].filter(wallet => !bundledWallets.has(wallet)).length;
  
  return { sellingWallets, zeroBuyWallets, bundledWallets: bundledWallets.size, bundledFreshWallets, freshNotBundled };
}
function formatDexUpdates(dexPay) {
  if (!dexPay.length) return `🦅 Dexscreener Updates: ❌ No orders found\n\n`;
  let message = `🦅 *Dexscreener Updates*\n`;
  dexPay.forEach(order => {
    message += `  • ${order.type}: ${order.status} on ${formatTimestamp(order.paymentTimestamp)}\n`;
  });
  return message + "\n";
}

function formatSocials(metadata, dexSocials, tokenAddress) {
  const {socials,isBonded} = extractSocialLinks(metadata, dexSocials);
  let message =  `🗣️ ` + Object.values(socials).filter(Boolean).join(" | ") + ` | [Dex](https://dexscreener.com/solana/${tokenAddress})\n`;
  message += isBonded ? "🪢 Bonded\n\n" : "\n";
  return message
}

function extractSocialLinks(metadata, dexSocials) {
  console.log(metadata)
  console.log(dexSocials)
  let socials = {
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
      if (pool.dexId !== "pumpfun" && pool.dexId) {
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
        raydiumSocialsExtracted=true;
      }
    });
  }
  return {socials,isBonded};
}

function formatHolderSummary(alertCount, bundled, freshBundled, freshNotBundled, zeroBuys, selling) {
  return `*📊 Top 20 Holder Summary*\n`
    + `    ⚠️ \t*${alertCount}* Sus Wallet${alertCount === 1 ? '' : 's'}\n`
    + `    🧩 \t*${bundled}* Bundled Wallets\n`
    + `    🆕 \t*${freshBundled}* Bundled Fresh Wallets\n`
    + `    🌿 \t*${freshNotBundled}* Fresh Wallets (Not Bundled)\n`
    + `    ❌ \t*${zeroBuys}* No Purchase Transactions\n`
    + `    🔴 \t*${selling}* Selling Wallets\n\n`;
}
function generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials, top20Data, clusterPercentages) {
  let message = `🔹*MF Analysis:* [$${metadata.symbol}](https://solscan.io/token/${tokenAddress})`;
  if (metadata.market_cap) {
    message += ` *(${formatMarketCap(metadata.market_cap)} MC)*`;
  }
  message += `\n\`${tokenAddress}\`[🔎](https://x.com/search?q=${tokenAddress})\n\n`;
  
  // Guard against undefined metadata.creator
  if (metadata.creator) {
    message += `🛠️ Token created by: [${metadata.creator.slice(0, 4)}...${metadata.creator.slice(-4)}](https://solscan.io/token/${tokenAddress})\n`;
  }
  
  message += `📅 On ${formatTimestamp(metadata.created_time || metadata.first_mint_time)}\n`;
  message += formatSocials(metadata, dexSocials, tokenAddress);
  
  // Guard against undefined tokenHistory
  message += `🏷️ *Previous Tokens Created: *`;

  if (tokenHistory && tokenHistory.length > 1) {
    message += `${tokenHistory.length - 1}\n`;
  
    const sortedTokens = [...tokenHistory].sort((a, b) => (b.metadata?.market_cap || 0) - (a.metadata?.market_cap || 0));
    
    sortedTokens.forEach(token => {
      if (token.metadata?.address && token.metadata.address !== tokenAddress) {
        const flag = token.metadata?.market_cap ? `:_${formatMarketCap(token.metadata.market_cap)}_` : "";
        message += `[$${token.metadata.symbol}](https://solscan.io/token/${token.metadata.address})${flag}\t`;
      }
    });
  
    message += "\n";
  }else{
    message += "0\n";

  }
  message += "\n";
  const { sellingWallets, zeroBuyWallets, bundledWallets, bundledFreshWallets, freshNotBundled } = analyzeWallets(top20Data, clusterPercentages);
  message += formatHolderSummary(alertEmojiCount, bundledWallets, bundledFreshWallets, freshNotBundled, zeroBuyWallets, sellingWallets);
  
  message += formatDexUpdates(dexPay);

  return message + "\n";
}

// Generates the Top 20 Holders section
function generateTop20Holders(holdersData, clusterPercentages) {
  let top20Mfers = "\n🔎 *Top 20 Mfers*\n";

  holdersData.forEach((holder, index) => {
    let alertEmoji = "";
    let clusterInfo = "";
    let freshEmoji = "";

    const cluster = clusterPercentages.find(cluster => cluster.recipients.includes(holder.Address));
    if (
      holder["Total Buys"] === 0 && parseFloat(holder["Current Holding (%)"]) > 0 ||
      holder["Transaction Count"] < 10 ||
      parseFloat(holder["Total Sold (%)"]) > parseFloat(holder["Total Bought (%)"]) ||
      (parseFloat(holder["Total Bought (%)"]) !== parseFloat(holder["Current Holding (%)"]) && holder["Total Sells"] === 0)) {
      alertEmoji = "⚠️";
    }

    if (cluster) {
      clusterInfo = ` (Bundle #${clusterPercentages.indexOf(cluster) + 1})`;
      alertEmoji = "⚠️";
    }
    if (holder["Transaction Count"] < 10) {
      freshEmoji = "🌿";
    }

    // Determine which emoji to use at the end (🟢 if bought more, 🔴 if sold more)
    const trendEmoji = parseFloat(holder["Total Sold (%)"]) > 0 ? "🔴" : "🟢";

    top20Mfers += `#${index + 1} *${holder["Current Holding (%)"]}%* [${holder.Address.slice(0, 4)}...${holder.Address.slice(-4)}](https://solscan.io/account/${holder.Address})${alertEmoji}${freshEmoji}${clusterInfo}\n`;
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
  message += `_Showing only top 4 recipients per bundle_\n`
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
      cluster.recipients.slice(0, 4).forEach(recipient => {
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
  tooltip += `Current Holding (%) Address\n\t\t\t\t⬆️ Buys/\u200BSells ⬇️ \t|\t Total Bought (%)/\u200BTotal Sold (%) (🟢: hasn't sold) (🔴:has sold) \n\n`;
  tooltip += "🔍 What is a Sus Wallet?\n";
  tooltip += "⚠️ A wallet is flagged as suspicious if:\n";
  tooltip += "  - It received tokens but has 0 buys.\n";
  tooltip += "  - It has sold more tokens than it bought.\n";
  tooltip += "  - It is part of a bundle.\n";
  tooltip += "  - It has less than 10 defi swap transactions 🌿\n";
  return tooltip;
}




async function generateTokenMessage(tokenAddress, isSummary = true) {
  const timeLabel = `generateTokenMessage_${tokenAddress}_${Date.now()}`; // Create a unique label based on the tokenAddress and timestamp
  console.time(timeLabel); // Start the timer with a unique label

  // First, fetch metadata (independent), then fetch tokenHistory (dependent on metadata)
  const metadata = await fetchTokenMetadata(tokenAddress);
  // Fetch remaining data in parallel (which doesn't depend on metadata or tokenHistory)
  const moreHolderDataPromise = getTokenHolderData(tokenAddress, metadata.supply, MAX_HOLDERS, 40);
  const fundingMapPromise = moreHolderDataPromise.then(data => getFundingMap(data));
  const dexPayPromise = fetchDexPay(tokenAddress);
  const poolsPromise = fetchTokenMarkets(tokenAddress);
  const tokenHistoryPromise = fetchTokenCreationHistory(metadata.creator);

  // Wait for all the independent data to finish fetching
  const [moreHolderData, fundingMap, dexPay, pools, tokenHistory] = await Promise.all([moreHolderDataPromise, fundingMapPromise, dexPayPromise, poolsPromise, tokenHistoryPromise]);

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
  console.timeEnd(timeLabel);
  const apiCalls = await getApiCallCount()
  console.log(`Api Calls: ${apiCalls}`)
  return {
    text: formattedMessage,
    replyMarkup: { inline_keyboard: buttons },
  };
}

async function sendMessageWithButton(chatId, tokenAddress) {
  const { text, replyMarkup } = await generateTokenMessage(tokenAddress);
  console.log("Sent message");
  return bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}



// Automatically refill tokens every second
setInterval(() => {
  availableApiCalls = Math.min(MAX_API_CALLS_PER_MINUTE, availableApiCalls + REFILL_RATE);
}, 1000);

const globalQueue = []; // Request queue
const PROCESSING = Symbol("processing"); // Mark requests being processed

async function processGlobalQueue() {
  if (globalQueue.length === 0) return; // No requests to process

  const { chatId, msg, callbackQuery } = globalQueue[0];

  // Ensure enough API tokens are available before proceeding
  if (availableApiCalls < API_CALLS_PER_REQUEST) {
    console.log(`⏳ Not enough API calls available. Waiting... (${availableApiCalls} left and ${API_CALLS_PER_REQUEST} to go)`);
    setTimeout(processGlobalQueue, 1000); // Check again in 1 sec
    return;
  }

  // Mark the request as being processed
  if (msg) msg[PROCESSING] = true;
  if (callbackQuery) callbackQuery[PROCESSING] = true;

  try {
    // Deduct API calls
    availableApiCalls -= API_CALLS_PER_REQUEST;
    console.log(`🔄 Processing request... Remaining API calls: ${availableApiCalls}`);

    if (msg) {
      await processRequest(chatId, msg);
    }
    if (callbackQuery) {
      await processCallbackQuery(chatId, callbackQuery);
    }
  } catch (error) {
    console.error("❌ Error processing request:", error.message);
  }

  // Remove processed request from queue
  globalQueue.shift();

  // Process the next request
  processGlobalQueue();
}

const userCooldowns = new Map(); // Store last request timestamp per user
const COOLDOWN_TIME = 5000; // 5 seconds in milliseconds

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const now = Date.now();

  // Validate if the message contains a Solana address
  if (!text || !SOLANA_ADDRESS_REGEX.test(text)) {
    return; // Ignore messages that are not valid Solana addresses
  }

  // Check if user is on cooldown
  if (userCooldowns.has(chatId)) {
    const lastRequestTime = userCooldowns.get(chatId);
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < COOLDOWN_TIME) {
      return bot.sendMessage(chatId, `⏳ Please wait ${(COOLDOWN_TIME - timeSinceLastRequest) / 1000}s before sending another request.`);
    }
  }

  // Update user cooldown timestamp
  userCooldowns.set(chatId, now);

  // Add to queue and process if it's the first request
  globalQueue.push({ chatId, msg });

  if (globalQueue.length === 1) processGlobalQueue();
});

bot.on("callback_query", async (query) => {
  globalQueue.push({ chatId: query.message.chat.id, callbackQuery: query });
  if (globalQueue.length === 1) processGlobalQueue();
});

// Function to process each message (from the global queue)
async function processRequest(chatId, msg) {
  const tokenAddress = msg.text.trim();

  if (!SOLANA_ADDRESS_REGEX.test(tokenAddress)) {
    return bot.sendMessage(chatId, "Send me a valid Solana token address", { parse_mode: "Markdown" });
  }

  const loadingMessage = await bot.sendMessage(chatId, `🔍 Fetching data for *${tokenAddress}*...\nPlease wait...`, { parse_mode: "Markdown" });

  try {
    // Process the request (calling the function to generate message with buttons, etc.)
    const sentMessage = await sendMessageWithButton(chatId, tokenAddress);
    await bot.deleteMessage(chatId, loadingMessage.message_id);
    console.log(`📤 Sent data to user for token: ${tokenAddress}`);
  } catch (error) {
    bot.sendMessage(chatId, "❌ An error occurred while processing the request. Please try again later.");
    console.error("Error in /fresh command:", error.message);
  }
}

// Function to handle callback queries (from the global queue)
async function processCallbackQuery(chatId, query) {
  const data = query.data;
  const messageId = query.message.message_id;

  if (data.startsWith("refresh_") || data.startsWith("showDetails_")) {
    const tokenAddress = data.split("_")[1];
    const isSummary = !data.startsWith("showDetails_"); // If it's "showDetails_", set isSummary to false

    // Answer the callback query immediately to acknowledge it
    bot.answerCallbackQuery(query.id, {
      text: isSummary ? "Refreshing data..." : "Fetching details...",
      show_alert: false,
    });

    try {
      // Edit the message to show loading status and remove the buttons
      await bot.editMessageText("🔄 Loading , please wait...", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔄 Loading... (No action)", callback_data: "noop" }]] }
      });

      // Generate the token message with buttons after processing
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
}