const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });

async function getFreshness(tokenCa) {
  try {
    console.log("Starting the getFreshness function...");
    console.log(`Token CA: ${tokenCa}`);
    
    // Step 1: Get top token accounts
    console.log("Fetching top token accounts...");
    const holdersResponse = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenLargestAccounts",
        "params": [tokenCa]
      }),
    });
    const holdersData = await holdersResponse.json();
    console.log("Top token accounts fetched:", holdersData);

    if (!holdersData.result || !holdersData.result.value) {
      console.error("Error: Unexpected response for getTokenLargestAccounts", holdersData);
      return "Error: Unable to fetch token holders.";
    }

    const largestAccounts = holdersData.result.value;

    // Step 2: Analyze each owner account
    console.log(`Analyzing ${largestAccounts.length} token accounts for owner freshness...`);
    const freshnessData = await Promise.all(
      largestAccounts.map(async (tokenAccount, index) => {
        const tokenAccountAddress = tokenAccount.address;
        console.log(`Processing token account ${index + 1}/${largestAccounts.length}: ${tokenAccountAddress}`);

        // Fetch token account info to get the owner
        console.log(`Fetching token account info for ${tokenAccountAddress}...`);
        const accountInfoResponse = await fetch(process.env.HELIUS_URL, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [
              tokenAccountAddress,
              { "encoding": "jsonParsed" }
            ]
          }),
        });
        const accountInfoData = await accountInfoResponse.json();
        console.log(`Account info for token account ${tokenAccountAddress}:`, accountInfoData);

        const owner = accountInfoData.result?.value?.data?.parsed?.info?.owner;
        if (!owner) {
          console.error(`No owner found for token account ${tokenAccountAddress}`);
          return { wallet: tokenAccountAddress, txCount: 0, creationTime: 'Unknown' };
        }

        console.log(`Owner of token account ${tokenAccountAddress}: ${owner}`);

        // Fetch owner transaction history
        console.log(`Fetching transaction history for owner ${owner}...`);
        const txResponse = await fetch(process.env.HELIUS_URL, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [
              owner,
              { "limit": 100 }
            ]
          }),
        });
        const txData = await txResponse.json();
        console.log(`Transaction history for owner ${owner}:`, txData);

        if (!txData.result) {
          console.error(`Error fetching transaction history for owner ${owner}`, txData);
          return { wallet: owner, txCount: 0, creationTime: 'Unknown' };
        }

        const transactions = txData.result;

        // Fetch first transaction to determine account creation time
        const creationTime = transactions.length > 0
          ? (await fetch(process.env.HELIUS_URL, {
              method: 'POST',
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTransaction",
                "params": [transactions[transactions.length - 1].signature, { "encoding": "jsonParsed" }]
              }),
            }))
              .json()
              .then(res => res.result?.blockTime || null)
          : null;

        console.log(`Processed owner ${owner}:`, {
          txCount: transactions.length,
          creationTime: creationTime ? new Date(creationTime * 1000).toLocaleString() : 'Unknown',
        });

        return {
          wallet: owner,
          txCount: transactions.length,
          creationTime: creationTime ? new Date(creationTime * 1000).toLocaleString() : 'Unknown',
        };
      })
    );

    // Step 3: Format response
    console.log("Formatting the response...");
    const response = freshnessData
      .map(data => {
        return `Owner: ${data.wallet}\nTx Count: ${data.txCount}\nCreation Time: ${data.creationTime}\n`;
      })
      .join('\n');

    console.log("Final response:", response);
    return response;
  } catch (error) {
    console.error("An error occurred in getFreshness:", error);
    return 'Error fetching freshness data.';
  }
}

// Debug example
getFreshness("8FRVErrkZx3s9WNEY7u8GTyWUJpgGx8JyWtuF428pump")
  .then(console.log)
  .catch(console.error);

module.exports = {
  getFreshness,
};
