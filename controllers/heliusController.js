const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TG_BOT_TOKEN, { polling: true });
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Fetch the largest token accounts
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
    console.log(`Get Top ${data.result.value.length} Token Holder`)
    return data.result.value;
  } catch (error) {
    console.error("Error fetching largest token accounts:", error);
    return [];
  }
}

// Fetch account owner from token account address
async function fetchAccountOwner(tokenAccountAddress) {
  try {
    console.log(`Fetching owner for token account: ${tokenAccountAddress}`);
    const response = await fetch(process.env.HELIUS_URL, {
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

// Fetch transaction history for a given address
async function fetchTransactionHistory(address) {
  try {
    console.log(`Fetching transaction history for address: ${address}`);
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address, { "limit": 100 }]
      }),
    });
    const data = await response.json();
    if (!Array.isArray(data.result)) {
      console.error(`Unexpected transaction history response for ${address}:`, data);
      return [];
    }
    return data.result;
  } catch (error) {
    console.error(`Error fetching transaction history for ${address}:`, error);
    return [];
  }
}

// Fetch creation time of the first transaction
async function fetchCreationTime(signature) {
  try {
    console.log(`Fetching creation time for signature: ${signature}`);
    const response = await fetch(process.env.HELIUS_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [signature, { "encoding": "jsonParsed" }]
      }),
    });
    const data = await response.json();
    return data.result?.blockTime || null;
  } catch (error) {
    console.error(`Error fetching creation time for signature ${signature}:`, error);
    return null;
  }
}

async function getFreshness(tokenCa) {
  try {
    console.log(`Calculating freshness for token: ${tokenCa}`);

    // Step 1: Fetch top token accounts
    const largestAccounts = await fetchLargestTokenAccounts(tokenCa);
    if (largestAccounts.length === 0) return "No token accounts found."; // Return message if no accounts found

    // Step 2: Process each token account
    const freshnessData = await Promise.all(
      largestAccounts.map(async (tokenAccount) => {
        await delay(100); // Introduce a delay of 100ms between requests

        const tokenAccountAddress = tokenAccount.address;

        // Fetch owner address
        const owner = await fetchAccountOwner(tokenAccountAddress);
        if (!owner) {
          return { wallet: tokenAccountAddress, txCount: 0, creationTime: 'Unknown' };
        }

        // Fetch transaction history
        const transactions = await fetchTransactionHistory(owner);
        const txCount = transactions.length;

        // Fetch creation time
        const creationTime = txCount > 0
          ? await fetchCreationTime(transactions[txCount - 1].signature)
          : null;

        return {
          wallet: owner,
          txCount,
          creationTime: creationTime ? new Date(creationTime * 1000).toLocaleString() : 'Unknown',
        };
      })
    );

    // Return freshness data
    return freshnessData; // Return an array
  } catch (error) {
    console.error("Error in getFreshness:", error);
    return 'Error fetching freshness data.';
  }
}

function formatFreshnessData(freshnessData) {
  // Debugging freshnessData
  console.log('Freshness Data:', freshnessData);

  // Check if freshnessData is an array before calling .map
  if (Array.isArray(freshnessData) && freshnessData.length > 0) {
    return freshnessData
      .map((data, index) => {
        return `*Owner ${index + 1}:* \`${data.wallet}\`\n` +
               `• *Tx Count:* ${data.txCount}\n` +
               `• *Creation Time:* ${data.creationTime}\n`;
      })
      .join('\n');
  } else {
    return 'No freshness data available or data is in an unexpected format.';
  }
}

// Example response for a freshness command
bot.onText(/\/fresh (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenCa = match[1].trim();

  if (!tokenCa) {
    bot.sendMessage(chatId, "Please provide a valid token contract address (CA). Example: /fresh {tokenCa}");
    return;
  }

  bot.sendMessage(chatId, "Fetching freshness data, please wait...");
  const result = await getFreshness(tokenCa);

  // Format the response and send
  const formattedResult = formatFreshnessData(result);
  bot.sendMessage(chatId, formattedResult, { parse_mode: "Markdown" });
});

console.log("Telegram bot is running...");

module.exports = {
  fetchLargestTokenAccounts,
  fetchAccountOwner,
  fetchTransactionHistory,
  fetchCreationTime,
  getFreshness,
};
