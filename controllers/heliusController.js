const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });

// Function to fetch freshness data
async function getFreshness(tokenCa) {
  try {
    console.log(`Fetching freshness data for token: ${tokenCa}`);

    // Step 1: Get top token accounts
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

    if (!holdersData.result || !holdersData.result.value) {
      console.error("Error: Unexpected response for getTokenLargestAccounts", holdersData);
      return "Error: Unable to fetch token holders.";
    }

    const largestAccounts = holdersData.result.value;

    // Step 2: Analyze each holder for owner freshness
    const freshnessData = await Promise.all(
      largestAccounts.map(async (tokenAccount) => {
        const tokenAccountAddress = tokenAccount.address;

        // Fetch token account info to get owner
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
        const owner = accountInfoData.result?.value?.data?.parsed?.info?.owner;

        if (!owner) return { wallet: tokenAccountAddress, txCount: 0, creationTime: 'Unknown' };

        // Fetch owner transaction history
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
        const transactions = txData.result;

        // Fetch first transaction for creation time
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

        return {
          wallet: owner,
          txCount: transactions.length,
          creationTime: creationTime ? new Date(creationTime * 1000).toLocaleString() : 'Unknown',
        };
      })
    );

    // Step 3: Format the response
    return freshnessData
      .map(data => `Owner: ${data.wallet}\nTx Count: ${data.txCount}\nCreation Time: ${data.creationTime}\n`)
      .join('\n');
  } catch (error) {
    console.error("Error in getFreshness:", error);
    return 'Error fetching freshness data.';
  }
}

// Telegram bot command handler
bot.onText(/\/fresh (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenCa = match[1].trim();

  if (!tokenCa) {
    bot.sendMessage(chatId, "Please provide a valid token contract address (CA). Example: /fresh {tokenCa}");
    return;
  }

  bot.sendMessage(chatId, "Fetching freshness data, please wait...");
  const result = await getFreshness(tokenCa);

  bot.sendMessage(chatId, result);
});

console.log("Telegram bot is running...");


module.exports = {getFreshness};
