const bot = require("../tg/tg")
const { SOL_AMOUNT_THRESHOLD, MAX_TX_LIMIT, delayBetweenRequests, FRESH_THRESHHOLD } = require('../config/config');

const { fetchLargestTokenAccounts, getSupply, fetchAccountOwner, fetchWithRateLimit, fetchTransactionHistory, getTransactionColor, getTransaction,formatFreshnessMessage } = require("../util/util"); // Adjust the path as needed

// Fetch transaction history for an address
async function getSolTransactions(transactions, address) {

  try {
    const solTransactions = []

    // Extract SOL transfer details
    for (const tx of transactions) {
      // Introduce rate limiting by delaying requests
      await fetchWithRateLimit(async () => {
        const transaction = await getTransaction(tx);

        if (transaction && transaction.meta) {
          const { preBalances, postBalances } = transaction.meta;
          const accountKeys = transaction.transaction.message.accountKeys;
          // Calculate SOL transferred to the address
          const recipientIndex = accountKeys.findIndex(key => key.pubkey === address);
          if (recipientIndex !== -1 && preBalances && postBalances) {
            const solTransferred = (postBalances[recipientIndex] - preBalances[recipientIndex]) / 1000000000; // Convert lamports to SOL

            if (solTransferred > SOL_AMOUNT_THRESHOLD) {
              solTransactions.push({
                signature: tx.signature,
                blockTime: transaction.blockTime,
                sender: accountKeys[0], // Typically, the first key is the sender
                recipient: address,
                solAmount: solTransferred,
              });
            }
          }
        }
      }, delayBetweenRequests); // Control the rate of requests
    }
    return solTransactions;
  } catch (error) {
    console.error(`Error fetching transaction history for ${address}:`, error);
    return { txCount: 0, transaction: [], mostRecentSolTx: null }; // Return 0 count and empty list on error
  }
}

// Separate function for fetching and processing token accounts
async function fetchAndProcessTokenAccounts(tokenCa) {
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
    const fundingMap = {}; // Map to group funding wallets for clustering

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

      let transactions = []
      await fetchWithRateLimit(async () => {
        transactions = await fetchTransactionHistory(freshness.address, MAX_TX_LIMIT);
        if (transactions) {
          freshness.txCount = transactions.length;
        }
      }, delayBetweenRequests);

      let solTransactions = []
      if(freshness.txCount<FRESH_THRESHHOLD){
        await fetchWithRateLimit(async () => {
          solTransactions = await getSolTransactions(transactions, freshness.address);
        }, delayBetweenRequests);
      }


      // Populate funding map for clustering
      if (solTransactions.length > 0) {
        for (const transaction of solTransactions) {
          const sender = transaction.sender.pubkey;

          if (!fundingMap[sender]) {
            fundingMap[sender] = new Set();
          }
          fundingMap[sender].add(freshness.address);
        }
      }

      freshnessData.push(freshness);
    }

    return { freshnessData, fundingMap };
  } catch (error) {
    console.error("Error fetching and processing token accounts:", error);
    return { freshnessData: [], fundingMap: {} };
  }
}

// Separate function for calculating cluster percentages
async function calculateClusterPercentages(freshnessData, fundingMap) {
  try {
    console.log(`Calculating cluster percentages...`);

    const clusterPercentages = [];
    const totalWallets = freshnessData.length;

    // Calculate percentage for each sender
    for (const [sender, recipients] of Object.entries(fundingMap)) {

      let totalHoldings = 0;

      // Calculate the sum of holdings for all recipients
      recipients.forEach((recipient) => {
        const freshness = freshnessData.find((item) => item.address === recipient);
        if (freshness) {
          totalHoldings += parseFloat(freshness.holding); // Add recipient's holding percentage
        }
      });

      clusterPercentages.push({
        sender,
        recipients: [...recipients],
        totalHoldings: totalHoldings.toFixed(2)
      });
    }

    // Sort clusters by total holdings percentage (descending)
    clusterPercentages.sort((a, b) => b.totalHoldings - a.totalHoldings);

    return clusterPercentages;
  } catch (error) {
    console.error("Error calculating cluster percentages:", error);
    return [];
  }
}
function formatClusterMessage(clusterPercentages, freshnessData, tokenCa) {
  let message = ""
  const {freshnessMessage,topHolders} = formatFreshnessMessage(freshnessData,tokenCa,MAX_TX_LIMIT)
  // Add info about the possible pumpfun bonding curve
  message += freshnessMessage

  message += "\n---\n\n";
  message += "🔹 *Who funded whom?*\n\n";

  // Add cluster data
  clusterPercentages.forEach((cluster, index) => {
    // Add sender and total holdings with sliced address and clickable
    const senderData = freshnessData.find(item => item.address === cluster.sender);
    const senderHolding = senderData ? senderData.holding : "N/A"; // Get sender holding
    message += `🧑‍💼 *Funding Wallet*: [${cluster.sender.slice(0, 6)}...](https://solscan.io/account/${cluster.sender})`;

    // Add the funding wallet's holding percentage (if available) right next to the sender
    if (senderHolding !== "N/A") {
      message += ` - * - ${senderHolding}%*`;
    }
    message += "\n"; // New line after funding wallet

    // Calculate the total cluster holdings including the funding wallet holdings
    const totalClusterHoldings = (parseFloat(cluster.totalHoldings) + (parseFloat(senderHolding) || 0)).toFixed(2);
    message += `💼 *Cluster Holdings*: ${totalClusterHoldings}%\n`;

    // List the recipients and their holdings, with sliced addresses and clickable
    message += `Recipients:\n`;
    cluster.recipients.forEach((recipient) => {
      const recipientData = freshnessData.find(item => item.address === recipient);
      const holding = recipientData ? recipientData.holding : "N/A"; // Get recipient holding
      let txCount = recipientData ? recipientData.txCount : "N/A"; // Get recipient tx count

      // Find ranking of the recipient in the top holders list
      const ranking = topHolders.findIndex(holder => holder.address === recipient) + 1;
      const rankingText = ranking > 0 ? `#*${ranking}*` : ""; // Format ranking as bold number in brackets

      // Get the color for the recipient's txCount as percentage
      const txColor = getTransactionColor(txCount);
      // Add '>' for txCount > 100
      if (txCount !== "N/A" && txCount >= MAX_TX_LIMIT) {
        txCount = `more than ${txCount}`;
      } else {
        txCount = `${txCount}`;
      }

      // Adding cleaner spacing between values
      message += `   - ${rankingText.padEnd(6)} [${recipient.slice(0, 6)}...](https://solscan.io/account/${recipient}): *${holding}%*  (${txColor} ${txCount} txs)\n`;
    });

    message += "\n";
  });

  return message;
}

// Function to send the message with the refresh button
async function sendFundingWithButton(chatId, tokenAddress) {
  // Fetch the latest data
  const { freshnessData, fundingMap } = await fetchAndProcessTokenAccounts(tokenAddress);
  const clusterPercentages = await calculateClusterPercentages(freshnessData, fundingMap);
  // Format the message for clusters and freshness
  const telegramMessage = formatClusterMessage(clusterPercentages, freshnessData, tokenAddress);
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '🔄 Refresh Data', // Text of the button
          callback_data: `refreshfunding_${tokenAddress}` // Unique identifier for the button
        }
      ]
    ]
  };

  bot.sendMessage(chatId, telegramMessage, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  });
}

bot.onText(/\/funding (.+)/, async (msg, match) => {
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
    sendFundingWithButton(chatId, tokenAddress); // Send the data along with the refresh button
  } catch (error) {
    bot.sendMessage(chatId, "❌ An error occurred while processing the request. Please try again later.");
    console.error("Error in /fresh command:", error.message);
  }
});

// Handle the "Refresh Data" button press
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const tokenAddress = query.data.split('_')[1]; // Extract the token address from the callback data

  if (query.data.startsWith('refreshfunding_')) {
    try {
      // Answer the callback query to acknowledge the press
      bot.answerCallbackQuery(query.id, { text: 'Refreshing data...', show_alert: false });
      bot.sendMessage(chatId, "Refreshing Data...");

      // Re-fetch and send the updated data with the refresh button again
      sendFundingWithButton(chatId, tokenAddress);

    } catch (error) {
      console.error("Error handling refresh:", error);
      bot.sendMessage(chatId, "❌ An error occurred while refreshing data. Please try again later.");
    }
  }
});


