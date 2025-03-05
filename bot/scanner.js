require("dotenv").config();
const bot = require("../tg/tg");
const pool = require('../db/db');

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_HOLDERS = 200
const MAX_HOLDERS_PAGE_SIZE = 40 // 10,20,30,40 MAX holders should be restles dividable by the page
const MAX_API_CALLS_PER_MINUTE = 3000;
// we have holders*2+15 calls, we need double the amount as buffer to never error
const API_CALLS_PER_REQUEST = MAX_HOLDERS * 3 + 30;
const REFILL_RATE = MAX_API_CALLS_PER_MINUTE / 60; // ≈ 16.67 per second

let availableApiCalls = MAX_API_CALLS_PER_MINUTE; // Start with full quota
const {
  fetchDefiActivities,
  fetchTokenMetadata,
  fetchTokenMarkets,
  fetchTokenCreationHistory,
  getApiCallCount,
  getTokenHolderData,
  getFundingMap,
  fetchTokenAccounts
} = require('./solscanApi');

const {
  fetchDexPay,
  fetchDexSocials
} = require('./dexScreenerApi');

const {
  fetchAth
} = require('./birdeyeApi');

const {
  calculateClusterPercentages,
  formatMarketCap,
  formatTimestamp,
  generateTooltip,
  timeAgo
} = require('./util');



function formatHolderData(holdersData, tokenAddress, metadata, tokenHistory, clusterPercentages, dexPay, dexSocials, devTokenAccounts,ath, isSummary = false) {
  // if (!holdersData.length) return "❌ No data available for this token.";
  const top20Data = holdersData.slice(0, 20);
  const alertEmojiCount = countSuspiciousWallets(top20Data, clusterPercentages);
  let message = generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials, top20Data, clusterPercentages, devTokenAccounts,ath);
  message += generateClusterAnalysis(holdersData, clusterPercentages, isSummary);

  if (!isSummary) {
    message += generateTop20Holders(top20Data, clusterPercentages, metadata);
    message += generateTooltip();
  }

  return message;
}

function countSuspiciousWallets(holderData, clusterPercentages) {
  return holderData.reduce((count, holder) => count + (isSuspicious(holder, clusterPercentages) ? 1 : 0), 0);
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
  let holdingAmount = 0
  top20Data.forEach(holder => {
    holdingAmount += parseFloat(holder["Current Holding (%)"]);
    if (parseFloat(holder["Total Sold (%)"]) > 0) sellingWallets++;
    if (holder["Total Buys"] === 0) zeroBuyWallets++;
    if (holder["Transaction Count"] < 10) freshWallets.add(holder.Address);
  });
  holdingAmount = Math.min(holdingAmount, 100);
  clusterPercentages.forEach(cluster => {
    cluster.recipients.forEach(recipient => {
      if (top20Data.some(holder => holder.Address === recipient) && !bundledWallets.has(recipient)) {
        bundledWallets.add(recipient);
      }
    });
  });

  const bundledFreshWallets = [...bundledWallets].filter(wallet => freshWallets.has(wallet)).length;
  const freshNotBundled = [...freshWallets].filter(wallet => !bundledWallets.has(wallet)).length;

  return { sellingWallets, zeroBuyWallets, bundledWallets: bundledWallets.size, bundledFreshWallets, freshNotBundled, holdingAmount };
}
function formatDexUpdates(dexPay) {
  if (!dexPay.length) return `🦅 Dexscreener Updates: ❌ No orders found\n\n`;
  let dp = false
  let ret = `🦅 *Dexscreener Updates*\n` +
    dexPay.map(order => {
      if(order.status === "approved"){
        dp=true;
      }
      let statusEmoji = order.status === "approved" ? "✅" :
        order.status === "processing" ? "⏳" :
          "❌"; // cancelled

      return `  ${statusEmoji} ${order.type}: ${order.status} on ${formatTimestamp(order.paymentTimestamp)}`;
    }).join("\n") + "\n\n";

  return {dp:dp,msg:ret}
}

function formatSocials(metadata, dexSocials, tokenAddress) {
  const { socials, isBonded, totalVolume, priceChange } = extractSocialLinks(metadata, dexSocials);

  const formattedVolume = `💰 Vol. USD: _24h_:*${formatMarketCap(totalVolume.h24, 0)}*  | _1h_:*${formatMarketCap(totalVolume.h1, 0)}*  | _5m_:*${formatMarketCap(totalVolume.m5, 0)}* `;
  const formattedPriceChange = `💹 Chg. %: _24h_:*${formatMarketCap(priceChange.h24, 0)}*  | _1h_:*${formatMarketCap(priceChange.h1, 0)}*  | _5m_:*${formatMarketCap(priceChange.m5, 0)}* `;

  return `🗣️ ${Object.values(socials).filter(Boolean).join(" | ")} | [Dex](https://dexscreener.com/solana/${tokenAddress})\n` +
    `${formattedVolume}\n` +
    `${formattedPriceChange}\n` +
    (isBonded ? "🪢 Bonded\n\n" : "\n");
}

function extractSocialLinks(metadata, dexSocials) {

  const socials = {
    website: metadata.metadata && metadata.metadata.website ? `[Web](${metadata.metadata.website})` : null,
    twitter: metadata.metadata && metadata.metadata.twitter ? `[𝕏](${metadata.metadata.twitter})` : null,
    telegram: metadata.metadata && metadata.metadata.telegram ? `[TG](${metadata.metadata.telegram})` : null,
  };

  let isBonded = dexSocials.some(pool => pool.dexId !== "pumpfun" && pool.dexId);
  let raydiumSocialsExtracted = false;
  let totalVolume = { h24: 0, h6: 0, h1: 0, m5: 0 };
  let priceChange = { m5: -0.29, h1: 1.49, h6: -1.05, h24: -8.79 };

  dexSocials.forEach(pool => {
    if (pool.volume) {
      totalVolume.h24 += pool.volume.h24 || 0;
      totalVolume.h6 += pool.volume.h6 || 0;
      totalVolume.h1 += pool.volume.h1 || 0;
      totalVolume.m5 += pool.volume.m5 || 0;
    }

    if (pool.priceChange) {
      priceChange.h24 += pool.priceChange.h24 || 0;
      priceChange.h6 += pool.priceChange.h6 || 0;
      priceChange.h1 += pool.priceChange.h1 || 0;
      priceChange.m5 += pool.priceChange.m5 || 0;
    }

    if (pool.dexId === "raydium" && !raydiumSocialsExtracted) {
      pool.websites?.forEach(website => {
        if (website?.url) socials.website = `[Web](${website.url})`;
      });

      pool.socials?.forEach(({ type, url }) => {
        if (type && url) {
          const lowerPlatform = type.toLowerCase();
          if (lowerPlatform === "twitter" && !socials.twitter) socials.twitter = `[𝕏](${url})`;
          if (lowerPlatform === "telegram" && !socials.telegram) socials.telegram = `[TG](${url})`;
        }
      });
      raydiumSocialsExtracted = true;
    }
  });

  return { socials, isBonded, totalVolume, priceChange };
}

function generateTwitterIntent(message) {
  const twitterBaseUrl = "https://x.com/intent/tweet";
  const encodedMessage = encodeURIComponent(message); // Properly encode the message
  return `${twitterBaseUrl}?text=${encodedMessage}`;
}

function formatHolderSummary(alertCount, bundled, freshBundled, freshNotBundled, zeroBuys, selling, holdingAmount) {
  return `*📊 Top 20 Holder Summary (${holdingAmount.toFixed(2)}%)*\n`
    + `    ⚠️ \t*${alertCount}* Sus Wallet${alertCount === 1 ? '' : 's'}\n`
    + `    🧩 \t*${bundled}* Bundled Wallets\n`
    + `    🆕 \t*${freshBundled}* Bundled Fresh Wallets\n`
    + `    🌿 \t*${freshNotBundled}* Fresh Wallets (Not Bundled)\n`
    + `    ❌ \t*${zeroBuys}* No Purchase Transactions\n`
    + `    🔴 \t*${selling}* Selling Wallets\n\n`;
}

function formatHolderSummaryIntent(alertCount, bundled, freshBundled, freshNotBundled, zeroBuys, selling, holdingAmount) {
  return `📊 Top 20 \[${holdingAmount.toFixed(2)}\%\] Wallet Alerts:\n`
    + `⚠️ ${alertCount} Sus\n`
    + `🧩 ${bundled} Bundled\n`
    + `🆕 ${freshBundled} Fresh Bundled\n`
    + `🌿 ${freshNotBundled} Fresh - No Bundle\n`
    + `❌ ${zeroBuys} No Purchase Txs\n`
    + `🔴 ${selling} Selling\n`;
}


function generateBaseMessage(tokenAddress, metadata, tokenHistory, alertEmojiCount, dexPay, dexSocials, top20Data, clusterPercentages, devTokenAccounts,ath) {
  let message = `🔹 *MDTT Analysis:* [$${metadata.symbol}](https://solscan.io/token/${tokenAddress})\n`;
  
  let twitterIntent =`@MandogMF Analysis: $${metadata.symbol}\n`
  twitterIntent+=`${tokenAddress}\n`
  const totalBundleHoldings = clusterPercentages.reduce(
    (sum, cluster) => sum + parseFloat(cluster.totalHoldings || 0),
    0
  ).toFixed(2);

  twitterIntent+= `🧩 Bundles: ${clusterPercentages.length} \[${totalBundleHoldings}%\]\n`;

  let currentMarketCap = metadata.market_cap; // Default to metadata value
  const raydiumPool = dexSocials.find(pool => pool.dexId === 'raydium');
  const pumpfunPool = dexSocials.find(pool => pool.dexId === 'pumpfun');
  
  if (raydiumPool?.marketCap) {
    currentMarketCap = raydiumPool.marketCap;
  } else if (pumpfunPool?.marketCap) {
    currentMarketCap = pumpfunPool.marketCap;
  }else{
    currentMarketCap=0
  }

  // Format the selected market cap
  const formattedMarketCap = formatMarketCap(currentMarketCap);

  let athMarketCap = "N/A"; // Default to "N/A" if ATH is 0 or not available
  
// Check if ATH is available and non-zero
if (ath.allTimeHigh > 0) {
  athMarketCap = formatMarketCap((ath.allTimeHigh * metadata.supply) / 1e6);

  // Calculate percentage difference
  const athMarketCapValue = (ath.allTimeHigh * metadata.supply) / 1e6;
  const marketCapDifference = ((currentMarketCap - athMarketCapValue) / athMarketCapValue) * 100;
  const percentageDifference = marketCapDifference.toFixed(0); // Rounded percentage

  // Format time ago
  const timeSinceAth = timeAgo(ath.timestamp);

  // Final formatted message
  message += `💎 MC: *${formattedMarketCap}* ⇨ ATH: *${athMarketCap}* (${timeSinceAth}) *${percentageDifference}*% `;
} else {
  // If ATH is 0 or not available, just show the current market cap
  message += `💎 MC: ${formattedMarketCap}`;
}

  message += `\n\`${tokenAddress}\`[🔎](https://x.com/search?q=${tokenAddress})\n\n`;
  let devHolds = "(0.00%)";

  if (metadata.supply) {
    // Find the developer's token account holding the token
    const devTokenAccount = devTokenAccounts.find(acc => acc.token_address === tokenAddress);
    if (devTokenAccount) {
      devHolds = `(${((devTokenAccount.amount / metadata.supply) * 100).toFixed(2)}%)`;
    }
  }

  if (metadata.creator) {
    message += `🛠️ *Deployer ${devHolds}*\n\`${metadata.creator}\`\n`;
  }

  message += `📅 On ${formatTimestamp(metadata.created_time || metadata.first_mint_time)}\n`;
  message += formatSocials(metadata, dexSocials, tokenAddress);

  // Guard against undefined tokenHistory
  message += `🏷️ *Previous Tokens Created: *`;
  twitterIntent += `🏷️ Prev. Launches: `;

  if (tokenHistory && tokenHistory.length > 1) {
    message += `${tokenHistory.length - 1}\n`;
    twitterIntent += `${tokenHistory.length - 1}\n`;

    const sortedTokens = [...tokenHistory].sort((a, b) => (b.metadata?.market_cap || 0) - (a.metadata?.market_cap || 0));

    // Only add the first 10 tokens
    const topTokens = sortedTokens.slice(0, 10);

    topTokens.forEach(token => {
        if (token.metadata?.address && token.metadata.address !== tokenAddress) {
            const flag = token.metadata?.market_cap ? `:${formatMarketCap(token.metadata.market_cap)}` : "";
            message += `[$${token.metadata.symbol}](https://solscan.io/token/${token.metadata.address})${flag}\t`;
        }
    });

    message += "\n";
  } else {
    message += "0\n";
    twitterIntent += `0\n`;
  }
  message += "\n";
  const { sellingWallets, zeroBuyWallets, bundledWallets, bundledFreshWallets, freshNotBundled, holdingAmount } = analyzeWallets(top20Data, clusterPercentages);
  


  message += formatHolderSummary(alertEmojiCount, bundledWallets, bundledFreshWallets, freshNotBundled, zeroBuyWallets, sellingWallets, holdingAmount);; 
  twitterIntent += formatHolderSummaryIntent(alertEmojiCount, bundledWallets, bundledFreshWallets, freshNotBundled, zeroBuyWallets, sellingWallets, holdingAmount);; 
  // Add the buy options links
  
  const {dp,msg} = formatDexUpdates(dexPay);
  message += msg;
  message += generateBuyOptions(dexSocials, tokenAddress);
  console.log(dp)
  if(dp){
    twitterIntent+=`✅ dp`
  }else{
    twitterIntent+=`⛔ dp`
  }
  twitterIntent+=`\nmandog.fun/` 
  message += `[💬 Share Summary on 𝕏 ](${generateTwitterIntent(twitterIntent)})\n\n`;
  return message;
}

function generateBuyOptions(dexSocials, tokenAddress) {
  // Find Raydium and Pumpfun pools
  const raydiumPool = dexSocials.find(pool => pool.dexId === 'raydium' && pool.pool_id !== 'N/A');
  const pumpfunPool = dexSocials.find(pool => pool.dexId === 'pumpfun' && pool.pool_id !== 'N/A');

  // Determine which pool ID to use for Axiom
  const axiomPoolId = raydiumPool ? raydiumPool.pool_id : pumpfunPool ? pumpfunPool.pool_id : null;

  // Define exchanges and their links
  const exchanges = [
    ["Photon", `https://photon-sol.tinyastro.io/en/r/@mandogmf/${tokenAddress}`], //bast fix
    ["BullX", `https://bullx.io/terminal?chainId=1399811149&address=${tokenAddress}&r=CCKX85ROSW8`] //bast fix
  ];

  // Insert Axiom between BullX and Bonk if pool ID exists
  if (axiomPoolId) {
    exchanges.push(["Axiom", `https://axiom.trade/meme/${axiomPoolId}`]); // no buy referral links so far
  }

  exchanges.push(
    ["Bonk", `https://t.me/bonkbot_bot?start=ref_d2qw8_ca_${tokenAddress}`], // bast fix
    ["Banana", `https://t.me/BananaGun_bot?start=snp_mandogmf_${tokenAddress}`], //bast fix
    ["Trojan", `https://t.me/paris_trojanbot?start=d-RickBot-${tokenAddress}`], // no nid
    ["Bloom", `https://t.me/BloomSolanaEU2_bot?start=ref_6QID1VN0J8_ca_${tokenAddress}`], //bast fix
    ["GMGN", `https://t.me/GMGN_sol_bot?start=i_9M3uB0qy_c_${tokenAddress}`], // no nid
    ["PepeBoost", `https://t.me/pepeboost_sol_bot?start=ref_0k10mc_ca_${tokenAddress}`], //bast fix
    ["Shuriken", `https://t.me/ShurikenTradeBot?start=qt-deegee99x-${tokenAddress}`] // bast fix
  );

  return exchanges.map(([name, url]) => `[${name}](${url})`).join(" | ") + "\n\n";

}
// Generates the Top 20 Holders section
function generateTop20Holders(holdersData, clusterPercentages, metadata) {
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
    const lastSell = holder["Last Sell"] ? `(${timeAgo(new Date(holder["Last Sell"]).getTime() / 1000)})` : "";

    let isDev = ""
    if (metadata.creator) {
      if (holder.Address === metadata.creator) isDev = `*(dev)*`;
    }
    top20Mfers += `#${index + 1} *${holder["Current Holding (%)"]}%* [${holder.Address.slice(0, 4)}...${holder.Address.slice(-4)}](https://solscan.io/account/${holder.Address})${isDev}${alertEmoji}${freshEmoji}${clusterInfo}\n`;
    top20Mfers += `\t\t\t\t⬆️ ${holder["Total Buys"]}/\u200B${holder["Total Sells"]} ⬇️ \t|\t ${holder["Total Bought (%)"]}%/\u200B${holder["Total Sold (%)"]}% ${trendEmoji} ${lastSell}\n\n`;
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
    const senderHolding = senderData ? senderData.holding : "0.00";


    const totalClusterHoldings = (parseFloat(cluster.totalHoldings) + (parseFloat(senderHolding) || 0)).toFixed(2);
    message += `*#${index + 1}* Bundle Holdings: ${totalClusterHoldings}%\n`;
    message += `    🕵️‍♂️ Funding Wallet: [${cluster.sender.slice(0, 4)}...${cluster.sender.slice(-4)}](https://solscan.io/account/${cluster.sender})`;
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
        const trendEmoji = parseFloat(recipientData["Total Sold (%)"]) > 0 ? "🔴" : "🟢";
        const lastSell = recipientData["Last Sell"] ? `(${timeAgo(new Date(recipientData["Last Sell"]).getTime() / 1000)})` : "";
        message += `   - ${rankingText.padEnd(6)} [${recipient.slice(0, 6)}...](https://solscan.io/account/${recipient}): *${holding}%* ${trendEmoji} ${lastSell}\n`;
      });
    }
  });

  return message;
}



const cache = new Map();

function cleanCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of cache) {
    if (now - timestamp > 20000) { // 30 seconds expiration
      cache.delete(key);
      console.log(`Cache expired: ${key} removed`);
    }
  }
}
// Run cache cleanup every 30 seconds
setInterval(cleanCache, 10000);

async function getPumpFunWallet(pools) {
  const targetProgramId = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

  const foundPool = pools.find(pool => pool.program_id === targetProgramId);

  return foundPool ? { pool_id: foundPool.pool_id, program_id: foundPool.program_id } : {};
}

async function generateTokenMessage(tokenAddress, isSummary = true) {
  const cacheKey = `${tokenAddress}_${isSummary}`; // Unique key for each token
  const now = Date.now();

  // Check if cache exists and is still valid (30s TTL)
  if (cache.has(cacheKey)) {
    const { timestamp, data } = cache.get(cacheKey);
    if (now - timestamp < 30000) { // 30 seconds
      console.log("Returning cached data");
      availableApiCalls += API_CALLS_PER_REQUEST;
      const metadata = await fetchTokenMetadata(tokenAddress);
      recordTokenScanHistory(tokenAddress,metadata.symbol)
      return data; // Return cached response
    }
  }

  const timeLabel = `generateTokenMessage_${tokenAddress}_${Date.now()}`; // Create a unique label based on the tokenAddress and timestamp
  console.time(timeLabel); // Start the timer with a unique label

  // First, fetch metadata (independent), then fetch tokenHistory (dependent on metadata)
  const metadata = await fetchTokenMetadata(tokenAddress);
  // Fetch remaining data in parallel (which doesn't depend on metadata or tokenHistory)
  const moreHolderDataPromise = getTokenHolderData(tokenAddress, metadata.supply, MAX_HOLDERS, MAX_HOLDERS_PAGE_SIZE);
  const fundingMapPromise = moreHolderDataPromise.then(data => getFundingMap(data));
  const dexPayPromise = fetchDexPay(tokenAddress);
  const poolsPromise = fetchTokenMarkets(tokenAddress);
  const tokenHistoryPromise = fetchTokenCreationHistory(metadata.creator);
  const devTokenAccountsPromise = fetchTokenAccounts(metadata.creator)
  const athPromise = fetchAth(tokenAddress,metadata.created_time || metadata.first_mint_time)

  // Wait for all the independent data to finish fetching
  const [rawMoreHolderData, fundingMap, dexPay, pools, tokenHistory, devTokenAccounts,ath] = await Promise.all([moreHolderDataPromise, fundingMapPromise, dexPayPromise, poolsPromise, tokenHistoryPromise, devTokenAccountsPromise,athPromise]);
  const pumpfun = await getPumpFunWallet(pools)

  const moreHolderData = pumpfun.pool_id
    ? rawMoreHolderData.filter(holder => holder.Address !== pumpfun.pool_id)
    : rawMoreHolderData;

  const clusterPercentages = await calculateClusterPercentages(moreHolderData, fundingMap);

  // Fetch Dex Socials (which also can run in parallel)
  const dexSocials = await fetchDexSocials(pools);
  // Format the message based on all the fetched data

  const formattedMessage = formatHolderData(moreHolderData, tokenAddress, metadata, tokenHistory, clusterPercentages, dexPay, dexSocials, devTokenAccounts,ath, isSummary);

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
  const responseData = { text: formattedMessage, replyMarkup: { inline_keyboard: buttons } };

  // Store the result in the cache with a timestamp
  cache.set(cacheKey, { timestamp: now, data: responseData });
  recordTokenScanHistory(tokenAddress,metadata.symbol)
  return responseData;
}

// Function to insert a scan record for the token
async function recordTokenScanHistory(tokenAddress, symbol) {
  const query = `
    INSERT INTO token_scan_history (token_address, symbol, scan_timestamp)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
  `;
  
  try {
    await pool.query(query, [tokenAddress, symbol]);
  } catch (error) {
    console.error('Error recording token scan history:', error);
  }
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

async function saveChatRequest(chatId, tokenAddress) {
  await pool.query(`
      INSERT INTO chats (chat_id, token_address)
      VALUES ($1, $2)
      ON CONFLICT (chat_id, token_address) DO NOTHING;
  `, [chatId, tokenAddress]);
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const now = Date.now();
  // Validate if the message contains a Solana address
  if (!text || !SOLANA_ADDRESS_REGEX.test(text)) {
    return; // Ignore messages that are not valid Solana addresses
  }
  await saveChatRequest(chatId,text);

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

module.exports = {
  generateTokenMessage
};