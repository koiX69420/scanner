const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
const MAX_SUPPLY_DEFAULT = 1000000000
const SOL_AMOUNT_THRESHOLD = 0.1
const FRESH_THRESHHOLD = 30
const MAX_TX_LIMIT = 20
const maxRequestsPerSecond = 9; // Max requests per second
const delayBetweenRequests = 1000 / maxRequestsPerSecond; // Delay between requests to stay within the rate limit
// Create a rate-limited delay function
function rateLimitRequest(delayTime, fn) {
  return new Promise(resolve => {
    setTimeout(() => resolve(fn()), delayTime); // Delay the request based on rate limit
  });
}

// Function to limit the request rate
async function fetchWithRateLimit(fn, delayTime = 100) {
  return await rateLimitRequest(delayTime, fn);
}


// Fetching largest token accounts
async function fetchLargestTokenAccounts(tokenCa) {
  try {
    console.log(`Fetching largest token accounts for: ${tokenCa}`);
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenLargestAccounts",
        "params": [tokenCa]
      }),
    });
    const data = await response.json();

    if (!data.result || !data.result.value) {
      console.error("Unexpected response for getTokenLargestAccounts:", data);
      return [];
    }
    console.log(`Fetched ${data.result.value.length} largest token holders`);
    return data.result.value;
  } catch (error) {
    console.error("Error fetching largest token accounts:", error);
    return [];
  }
}

// Fetch token supply
async function getSupply(tokenCa) {
  try {
    console.log(`Fetching supply for token: ${tokenCa}`);
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenSupply",
        "params": [tokenCa]
      }),
    });

    const data = await response.json();
    if (!data.result || !data.result.value) {
      console.error("Unexpected response for getTokenSupply:", data);
      return MAX_SUPPLY_DEFAULT;
    }

    console.log(`Token ${tokenCa} has supply: ${data.result.value.uiAmount}`);
    return data.result.value.uiAmount;
  } catch (error) {
    console.error("Error fetching token supply:", error);
    return MAX_SUPPLY_DEFAULT;
  }
}

// Fetch account owner from token account address
async function fetchAccountOwner(tokenAccountAddress) {
  try {
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [tokenAccountAddress, { "encoding": "jsonParsed" }]
      }),
    });

    const data = await response.json();
    const owner = data.result?.value?.data?.parsed?.info?.owner;
    if (!owner) {
      console.error(`Owner not found for token account: ${tokenAccountAddress}`);
    }
    return owner;
  } catch (error) {
    console.error(`Error fetching account owner for ${tokenAccountAddress}:`, error);
    return null;
  }
}

// Fetch transaction history for an address
async function fetchTransactionHistory(address) {
  try {
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address, { "limit": MAX_TX_LIMIT }] // You can adjust the limit based on your needs
      }),
    });

    const data = await response.json();
    if (!Array.isArray(data.result)) {
      console.error(`Unexpected response for transaction history:`, data);
      return { txCount: 0, solTransactions: [] }; // Return 0 count and empty list
    }

    const solTransactions = [];
    const txCount = data.result.length; // Total number of transactions

    if (txCount > FRESH_THRESHHOLD) {
      return { txCount, solTransactions };
    }

    // Extract SOL transfer details
    for (const tx of data.result) {
      // Introduce rate limiting by delaying requests
      await fetchWithRateLimit(async () => {
        const txResponse = await fetch(process.env.HELIUS_URL, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [tx.signature, { "encoding": "jsonParsed" }]
          }),
        });

        const txData = await txResponse.json();
        const transaction = txData.result;
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

    return { txCount, solTransactions };
  } catch (error) {
    console.error(`Error fetching transaction history for ${address}:`, error);
    return { txCount: 0, solTransactions: [], mostRecentSolTx: null }; // Return 0 count and empty list on error
  }
}

// Separate function for fetching and processing token accounts
async function fetchAndProcessTokenAccounts(tokenCa) {
  try {
    console.log(`Fetching and processing token accounts for token: ${tokenCa}`);

    // Fetch top token accounts
    const largestAccounts = await fetchLargestTokenAccounts(tokenCa);
    if (largestAccounts.length === 0) {
      console.log("No token accounts found.");
      return [];
    }

    const maxSupply = await getSupply(tokenCa);

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

      const transactions = await fetchTransactionHistory(freshness.address);
      const { txCount, solTransactions } = transactions;

      freshness.txCount = txCount;

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
function getTransactionColor(txCount, maxTxCount = MAX_TX_LIMIT) {
  // Calculate the percentage based on txCount and maxTxCount
  const percentage = Math.min(100, Math.max(0, (txCount / maxTxCount) * 100)); // Ensure it's between 0 and 100

  let color;

  // Use the percentage to determine the color
  if (percentage === 0) {
    color = "🔴"; // Red for 0% activity
  } else if (percentage <= 10) {
    color = "🔴"; // Red for 0-10%
  } else if (percentage <= 40) {
    color = "🟠"; // Orange for 11-30%
  } else if (percentage <= 90) {
    color = "🟡"; // Yellow for 31-70%
  } else if (percentage <= 99) {
    color = "🟢"; // Green for 71-99%
  } else {
    color = "🟢"; // Dark Green for 100%
  }

  return color;
}
function formatClusterMessage(clusterPercentages, freshnessData, tokenCa) {
  // Create the message header
  let message = `🔹 *Top 20 Token Holders for* [${tokenCa}](https://solscan.io/token/${tokenCa})\n`;

  // Add info about the possible pumpfun bonding curve
  message += "ℹ️ The top token holder may represent the pumpfun bonding curve.\n\n";
  // Sort freshness data by holdings in descending order and get the top 20
  const topHolders = freshnessData
    .sort((a, b) => parseFloat(b.holding) - parseFloat(a.holding))
    .slice(0, 20);

  // Add top holders to the message
  topHolders.forEach((holder, index) => {
    const txCount = holder.txCount === 100 ? `>100 txs` : `${holder.txCount} txs`;

    // Get the color based on txCount as percentage
    const txColor = getTransactionColor(holder.txCount);

    // Check if this is the top holder
    let pumpfunFlag = "";
    if (index === 0) {
      pumpfunFlag = "🔹 *Possible Pumpfun Bonding Curve*"; // Add the flag to the top holder
    }

    message += `#*${String(index + 1).padEnd(3, ' ')}* [${holder.address.slice(0, 6)}](https://solscan.io/account/${holder.address})` + `- *${holder.holding}%* (${txColor} ${txCount}) ${pumpfunFlag}\n`;
  });
  message += "\n---\n\n";
  message += "🔹 *Who funded whom?*\n\n";

  // Add cluster data
  clusterPercentages.forEach((cluster, index) => {
    // Add sender and total holdings with sliced address and clickable
    message += `🧑‍💼 *Funding Wallet*: [${cluster.sender.slice(0, 6)}...](https://solscan.io/account/${cluster.sender})\n`;
    message += `💼 *Cluster Holdings*: ${cluster.totalHoldings}%\n`;

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
      if (txCount !== "N/A" && txCount > 100) {
        txCount = `>${txCount} txs`;
      } else {
        txCount = `${txCount} txs`;
      }
      // Adding cleaner spacing between values
      message += `   - ${rankingText.padEnd(6)} [${recipient.slice(0, 6)}...](https://solscan.io/account/${recipient}): *${holding}%*  (${txColor} ${txCount} txs)\n`;
    });

    message += "\n";
  });

  return message;
}
function getDummyData() {
  // Dummy Freshness Data
  const freshnessData = [
    {
      holding: "3.43",
      address: "7vCeEL6ZctkVvkQwv6YKhUhddAf9DyhDno9G3nsLW8Qq",
      txCount: 100
    },
    {
      holding: "2.78",
      address: "3owCzTNUQiWpatuvbM5r2AXuaRtyRtuB4tcV2YKvoCqM",
      txCount: 100
    },
    {
      holding: "2.43",
      address: "Zwz9WaxNG5Zznzkn4DfHQmgsDzLxnDuUZH2N4hEA4rH",
      txCount: 20
    },
    {
      holding: "2.05",
      address: "HYPGwv2oXjSJoxVVje6gQzxQommHBUifTjm9jdMuz5Hq",
      txCount: 100
    },
    {
      holding: "1.94",
      address: "3P3wkehtoa3qRmXoqHM9vFEDd2dYjkeNoqPti8zcL4eZ",
      txCount: 100
    },
    {
      holding: "1.78",
      address: "2XdT6g584P2LFaabypHETy2dpfE6SWhz3iUFX7FhSn5H",
      txCount: 84
    },
    {
      holding: "1.67",
      address: "MkRm3woqkB32iHUB61FcjeGSzjvXbTyDyxvf2U9zcxZ",
      txCount: 100
    },
    {
      holding: "1.49",
      address: "9UJZvtzi9ag5uRWiREhvqQLRiFGuKpNFMFu6B866saok",
      txCount: 9
    },
    {
      holding: "1.11",
      address: "wG3oVqKRB5NHQA8RLdmtTrV5Qe8uF55vt7G14ZDtALo",
      txCount: 52
    },
    {
      holding: "0.99",
      address: "5Nj9BwqNueJYXaiEK2JYVa1WgQpuBEid3CQjtPb61p8V",
      txCount: 100
    },
    {
      holding: "0.71",
      address: "65pYPcNhoSmcj6GqTh5nCqA2MneBRZx4DsmX6nj81Qy1",
      txCount: 100
    },
    {
      holding: "0.65",
      address: "Aqp17mzbSDxf4zXQFrW1QBWduNHN16Zshwuaj6mWXnuz",
      txCount: 100
    },
    {
      holding: "0.51",
      address: "AtTjQKXo1CYTa2MuxPARtr382ZyhPU5YX4wMMpvaa1oy",
      txCount: 100
    },
    {
      holding: "0.11",
      address: "DbNV5QDSXAV8iadfo32vXCUa9raeWkdi7HtF7rD2hrdu",
      txCount: 100
    },
    {
      holding: "0.02",
      address: "3z97cs9ZEBvdCCyucMa98M8gyLuXhcj1QSUpYVauTaqB",
      txCount: 65
    },
    {
      holding: "0.00",
      address: "JCDvFoTA1rqS1hqd5tieBg2Kgeit6nNnHnpzR3TSEq9e",
      txCount: 85
    },
    {
      holding: "0.00",
      address: "GR3Q7nJYY27Fi99Kb2u7ejZKaSiZuaWrno7F68xsMXnK",
      txCount: 100
    },
    {
      holding: "0.00",
      address: "7PgipsZSLCESptBvyBuGWXZKVWaTYFQ4Xh2Q7ECjy2Gc",
      txCount: 66
    },
    {
      holding: "0.00",
      address: "6uCKkAQ5qgWrEj7Mh5UGPtVeEKV6zCEiHRMGRUU37EjV",
      txCount: 37
    }
    // Add more dummy addresses and holdings as needed
  ];

  // Dummy Cluster Percentages
  const clusterPercentages = [
    {
      sender: "7vCeEL6ZctkVvkQwv6YKhUhddAf9DyhDno9G3nsLW8Qq",
      recipients: [
        "Zwz9WaxNG5Zznzkn4DfHQmgsDzLxnDuUZH2N4hEA4rH",
        "MkRm3woqkB32iHUB61FcjeGSzjvXbTyDyxvf2U9zcxZ",
        "wG3oVqKRB5NHQA8RLdmtTrV5Qe8uF55vt7G14ZDtALo",
        "65pYPcNhoSmcj6GqTh5nCqA2MneBRZx4DsmX6nj81Qy1"
      ],
      totalHoldings: 5.92
    },
    {
      sender: "8Czzjeh2igeE7gSsbuuXVZUmZZ42yZTCNUZoZcCGRKdr",
      recipients: [
        "2XdT6g584P2LFaabypHETy2dpfE6SWhz3iUFX7FhSn5H",
        "DbNV5QDSXAV8iadfo32vXCUa9raeWkdi7HtF7rD2hrdu",
        "JCDvFoTA1rqS1hqd5tieBg2Kgeit6nNnHnpzR3TSEq9e",
        "7PgipsZSLCESptBvyBuGWXZKVWaTYFQ4Xh2Q7ECjy2Gc"
      ],
      totalHoldings: 1.89
    },
    {
      sender: "Axy3zQPSRWre6FhQefp58jhFuBdhMgZMKPVjdaa6eTdv",
      recipients: [
        "5Nj9BwqNueJYXaiEK2JYVa1WgQpuBEid3CQjtPb61p8V",
        "Aqp17mzbSDxf4zXQFrW1QBWduNHN16Zshwuaj6mWXnuz"
      ],
      totalHoldings: 1.64
    },
    {
      sender: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
      recipients: [
        "9UJZvtzi9ag5uRWiREhvqQLRiFGuKpNFMFu6B866saok"
      ],
      totalHoldings: 1.49
    },
    {
      sender: "DhEsUaJkT1DzkFUWLCkU21VruJQZk1es4zBRhU9QjK9R",
      recipients: [
        "3z97cs9ZEBvdCCyucMa98M8gyLuXhcj1QSUpYVauTaqB"
      ],
      totalHoldings: 0.02
    },
    {
      sender: "Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6",
      recipients: [
        "3z97cs9ZEBvdCCyucMa98M8gyLuXhcj1QSUpYVauTaqB"
      ],
      totalHoldings: 0.02
    },
    {
      sender: "AeBwztwXScyNNuQCEdhS54wttRQrw3Nj1UtqddzB4C7b",
      recipients: [
        "3z97cs9ZEBvdCCyucMa98M8gyLuXhcj1QSUpYVauTaqB"
      ],
      totalHoldings: 0.02
    },
    {
      sender: "8hZ6CQfWQJg6bGnBKPizBwuSa1WYv9aACKHesHBdeEiJ",
      recipients: [
        "JCDvFoTA1rqS1hqd5tieBg2Kgeit6nNnHnpzR3TSEq9e"
      ],
      totalHoldings: 0
    },
    {
      sender: "GR3Q7nJYY27Fi99Kb2u7ejZKaSiZuaWrno7F68xsMXnK",
      recipients: [
        "GR3Q7nJYY27Fi99Kb2u7ejZKaSiZuaWrno7F68xsMXnK"
      ],
      totalHoldings: 0
    },
    {
      sender: "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD",
      recipients: [
        "GR3Q7nJYY27Fi99Kb2u7ejZKaSiZuaWrno7F68xsMXnK"
      ],
      totalHoldings: 0
    },
    {
      sender: "GQRnJS3sRP87igAyt6SR3EXEAfKHse8Gf15uStGpQjV4",
      recipients: [
        "6uCKkAQ5qgWrEj7Mh5UGPtVeEKV6zCEiHRMGRUU37EjV"
      ],
      totalHoldings: 0
    }
    // Add more dummy clusters as needed
  ];

  return { freshnessData, clusterPercentages };
}

// Telegram bot command
bot.onText(/\/fresh (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenAddress = match[1];

  bot.sendMessage(chatId, `Fetching freshness and cluster data for token: ${tokenAddress}...\n Give me a minute or two`);
  const { freshnessData, fundingMap } = await fetchAndProcessTokenAccounts(tokenAddress)
  const clusterPercentages = await calculateClusterPercentages(freshnessData, fundingMap)
  // Dummy data generation (for debugging)

  const telegramMessage = formatClusterMessage(clusterPercentages, freshnessData, tokenAddress);

  bot.sendMessage(chatId, telegramMessage, { parse_mode: "Markdown" });
});


// // Main execution
// (async () => {
//   try {
//     const tokenCa = "8FRVErrkZx3s9WNEY7u8GTyWUJpgGx8JyWtuF428pump";
//     const { freshnessData, fundingMap } = await fetchAndProcessTokenAccounts(tokenCa);

//     console.log("Freshness Data:", JSON.stringify(freshnessData, null, 2));

//     const clusterPercentages = await calculateClusterPercentages(freshnessData, fundingMap);

//     console.log("Cluster Percentages:", JSON.stringify(clusterPercentages, null, 2));


//   } catch (error) {
//     console.error("Error during analysis:", error);
//   }
// })();
