const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY; // Ensure you use your actual API key

// Global variable to track the number of API calls made
let apiCallCount = 0;

async function makeApiCall(url) {
  try {
    apiCallCount++; // Increment API call count
    // console.log(apiCallCount)
    // console.log(url)
    const response = await fetch(url, { method: "GET", headers: { token: SOLSCAN_API_KEY } });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`❌ Failed to fetch data. Status: ${response.status} Response: ${responseText}`);
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
  if (!activities) return { buys: 0, sells: 0, totalBought: 0, totalSold: 0 };

  let buys = 0, sells = 0, totalBought = 0, totalSold = 0;
  activities.forEach(tx => {
    transactionCount+=1;
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
  return { buys, sells, totalBought, totalSold,transactionCount };
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

// Function to fetch token markets for a token address
async function fetchTokenMarkets(tokenAddress) {
  const url = `https://pro-api.solscan.io/v2.0/token/markets?token[]=${tokenAddress}&page=1&page_size=10`;
  return await makeApiCall(url) || [];
}

// Function to fetch token creation history for a wallet address
async function fetchTokenCreationHistory(walletAddress) {
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

// Export the functions and api call count
module.exports = {
  fetchTopHolders,
  fetchDefiActivities,
  fetchTokenMetadata,
  fetchTokenMarkets,
  fetchTokenCreationHistory,
  fetchSolTransfers,
  getApiCallCount, // Export the API call counter
};
