const SOLSCAN_API_KEYS = process.env.SOLSCAN_API_KEYS?.split(",") || []; // Load multiple API keys
if (SOLSCAN_API_KEYS.length === 0) throw new Error("No SOLSCAN API keys provided");
let currentApiKeyIndex = 0; // Track which API key to use

let apiCallCount = 0;

// Function to get the next API key in round-robin fashion
function getNextApiKey() {
  const apiKey = SOLSCAN_API_KEYS[currentApiKeyIndex]; // Get the current key
  currentApiKeyIndex = (currentApiKeyIndex + 1) % SOLSCAN_API_KEYS.length; // Move to next key
  return apiKey;
}

async function makeApiCall(url) {
  try {
    apiCallCount++; // Increment API call count
    const apiKey = getNextApiKey(); // Get next available API key
    
    const response = await fetch(url, { method: "GET", headers: { token: apiKey } });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`❌ Failed to fetch data. Status: ${response.status} Response: ${responseText} ${url}`);
      return null; // Return null if the call fails
    }

    const data = await response.json();
    return data.success ? data.data : null; // Return the data if success, else null
  } catch (error) {
    console.error(`❌ Error during API request: ${error.message}`);
    return null; // Return null if the call fails
  }
}

// Function to fetch top holders for a token concurrently
async function fetchTopHolders(tokenAddress, maxHolders, pageSize) {
  if (!tokenAddress) return [];

  let allHolders = [];
  const fetchPromises = [];
  let totalFetched = 0;

  try {
    // Parallel requests for pages
    while (totalFetched < maxHolders) {
      const url = `https://pro-api.solscan.io/v2.0/token/holders?address=${encodeURIComponent(tokenAddress)}&page=${Math.ceil((totalFetched + 1) / pageSize)}&page_size=${pageSize}`;
      fetchPromises.push(makeApiCall(url)); // Use makeApiCall helper function
      totalFetched += pageSize;
    }

    const responses = await Promise.all(fetchPromises); // Fetch all pages concurrently
    const holderPromises = responses.map((data) => {
      if (!data || !data.items) return [];
      return data.items
        .filter(holder => holder.owner !== "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1")
        .map(holder => ({
          address: holder.address,
          amount: holder.amount,
          decimals: holder.decimals,
          owner: holder.owner,
          rank: holder.rank,
        }));
    });

    allHolders = (await Promise.all(holderPromises)).flat();
    return allHolders.slice(0, maxHolders);
  } catch (error) {
    console.error(`❌ Error fetching holders for ${tokenAddress}:`, error.message);
    return [];
  }
}

// Function to fetch Defi activities for a wallet address and token address
async function fetchDefiActivities(walletAddress, tokenAddress) {
  const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${encodeURIComponent(walletAddress)}&activity_type[]=ACTIVITY_TOKEN_SWAP&activity_type[]=ACTIVITY_AGG_TOKEN_SWAP&page=1&page_size=100&sort_by=block_time&sort_order=desc`;
  const activities = await makeApiCall(url);
  let transactionCount = 0;
  if (!activities) return { buys: 0, sells: 0, totalBought: 0, totalSold: 0, lastSell: "" };

  let buys = 0, sells = 0, totalBought = 0, totalSold = 0;
  let lastSell = ""; // Store the most recent sell transaction

  activities.forEach(tx => {
    transactionCount+=1;
    (Array.isArray(tx.routers) ? tx.routers : [tx.routers]).forEach(router => {
      if (router.token1 === tokenAddress) {
        sells++;
        totalSold += router.amount1 || 0;
        if (!lastSell || tx.block_time > lastSell.block_time) {
          lastSell = {
            trans_id: tx.trans_id,
            block_time: tx.block_time,
            value: router.amount1,
            time: tx.time,
            token1: router.token1,
            token2: router.token2,
          };
        }
      } else if (router.token2 === tokenAddress) {
        buys++;
        totalBought += router.amount2 || 0;
      }
    });
  });
  return { walletAddress,buys, sells, totalBought, totalSold,transactionCount, lastSell: lastSell ? lastSell.time : ""
  };
}

// Function to fetch token metadata
async function fetchTokenMetadata(tokenAddress) {
  const url = `https://pro-api.solscan.io/v2.0/token/meta?address=${encodeURIComponent(tokenAddress)}`;
  const metadata = await makeApiCall(url);
  return metadata || { supply: 1 }; // Default to 1 supply to prevent division errors
}

// Function to fetch Sol transfers for a wallet address
async function fetchSolTransfers(walletAddress) {
  const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${walletAddress}&activity_type[]=ACTIVITY_SPL_TRANSFER&value[]=10&token=So11111111111111111111111111111111111111111&page=1&page_size=40&sort_by=block_time&sort_order=desc`;
  return await makeApiCall(url) || [];
}

// Function to fetch Sol transfers for a wallet address
async function fetchTokenAccounts(walletAddress) {
  const url = `https://pro-api.solscan.io/v2.0/account/token-accounts?address=${walletAddress}&type=token&page=1&page_size=40`;
  return await makeApiCall(url) || [];
}

// Function to fetch token markets for a token address
async function fetchTokenMarkets(tokenAddress) {
  const url = `https://pro-api.solscan.io/v2.0/token/markets?token[]=${tokenAddress}&page=1&page_size=10`;
  return await makeApiCall(url) || [];
}

// Function to fetch token creation history for a wallet address
async function fetchTokenCreationHistory(walletAddress) {
  if(!walletAddress){
    return []
  }
  const url = `https://pro-api.solscan.io/v2.0/account/defi/activities?address=${encodeURIComponent(walletAddress)}&activity_type[]=ACTIVITY_SPL_INIT_MINT&page=1&page_size=100&sort_by=block_time&sort_order=desc`;
  const activities = await makeApiCall(url) || [];

  const tokensCreated = await Promise.all(
    activities.flatMap(tx => {
      const routers = Array.isArray(tx.routers) ? tx.routers : [tx.routers];
      return routers
        .filter(router => router.token1)
        .map(async router => {
          const metadata = await fetchTokenMetadata(router.token1);
          return { tokenAddress: router.token1, metadata };
        });
    })
  );
  return tokensCreated.filter(Boolean); // Remove undefined/null values
}

// Function to get the number of API calls made
function getApiCallCount() {
  const temp = apiCallCount;
  apiCallCount=0;
  return temp;
}

// Refactored main function to fetch all token holder data and related activities concurrently
async function getTokenHolderData(tokenAddress, supply, maxHolders, pageSize) {
  console.log(`🔄 Fetching token holder data for: ${tokenAddress}`);
  const holders = await fetchTopHolders(tokenAddress, maxHolders, pageSize);
  if (!holders.length) return [];

  const defiResults = await Promise.all(holders.map(holder => fetchDefiActivities(holder.owner, tokenAddress)));
  // Directly map defiResults to the final return format
  return defiResults.map(({ walletAddress, buys, sells, totalBought, totalSold, transactionCount,lastSell }, index) => ({
    Address: walletAddress,
    "Current Holding (%)": ((holders[index].amount / supply) * 100).toFixed(2),
    "Total Buys": buys,
    "Total Sells": sells,
    "Total Bought (%)": ((totalBought / supply) * 100).toFixed(2),
    "Total Sold (%)": ((totalSold / supply) * 100).toFixed(2),
    "Transaction Count": transactionCount,
    "Last Sell": lastSell
  }));
}

async function getFundingMap(topHolders) {
  const fundingMap = {}; // Map to group funding wallets for clustering
  const recipientFunding = new Map(); // Tracks recipient -> { sender, count }

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

          // Track which sender provided funds to each recipient
          if (!recipientFunding.has(recipient) || recipientFunding.get(recipient).count < solTransactions.length) {
            recipientFunding.set(recipient, { sender, count: solTransactions.length });
          }
        }
      });
    });
  });
  // **Filtering Step: Remove recipients appearing in multiple senders**
  Object.keys(fundingMap).forEach(sender => {
    fundingMap[sender] = new Set([...fundingMap[sender]].filter(holder => recipientFunding.get(holder).sender === sender));
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

// Export the functions and api call count
module.exports = {
  fetchDefiActivities,
  fetchTokenMetadata,
  fetchTokenMarkets,
  fetchTokenCreationHistory,
  fetchSolTransfers,
  getApiCallCount,
  getTokenHolderData,
  getFundingMap,
  fetchTokenAccounts
};
