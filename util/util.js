
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
            console.error(`Owner not found for token account, return the tokenAccount: ${tokenAccountAddress}`);
        }
        return owner;
    } catch (error) {
        console.error(`Error fetching account owner for ${tokenAccountAddress}:`, error);
        return null;
    }
}

// Fetch transaction history for an address
async function fetchTransactionHistory(address, maxTxLimit) {
    try {
        // Validate address input
        if (!address) {
            throw new Error("Address is required");
        }

        // Prepare the request payload
        const requestPayload = {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [address, { limit: maxTxLimit }],
        };

        // Make the API call to fetch transaction history
        const response = await fetch(process.env.HELIUS_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload),
        });

        // Parse the response data
        const data = await response.json();

        // Check for expected response format
        if (!data || !Array.isArray(data.result)) {
            throw new Error("Unexpected response format: " + JSON.stringify(data));
        }

        // Return the transaction history
        return data.result;

    } catch (error) {
        // Handle errors and provide useful feedback
        console.error("Error fetching transaction history for address:", address, error.message);
        return null; // Return null or empty array depending on your use case
    }
}
// Fetch transaction details by signature
async function getTransaction(tx) {
    try {
        // Validate input tx object
        if (!tx || !tx.signature) {
            throw new Error("Transaction signature is required");
        }

        // Prepare request payload
        const requestPayload = {
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [tx.signature, { encoding: "jsonParsed" }],
        };

        // Make the API call to fetch the transaction
        const response = await fetch(process.env.HELIUS_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload),
        });

        // Check if the response was successful
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const txData = await response.json();
        const transaction = txData.result;

        // Return the transaction details
        return transaction;

    } catch (error) {
        // Handle errors and provide useful feedback
        console.error("Error fetching transaction details:", error.message);
        return null; // Return null or an error object depending on how you want to handle failures
    }
}
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

function getTransactionColor(txCount, maxTxCount) {
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

// Format message for Telegram
function formatFreshnessMessage(freshnessData, tokenCa,maxTxLimit) {
    if (!freshnessData || freshnessData.length === 0) {
        return "❌ No freshness data found for the token.";
    }

    // Create the message header
    let freshnessMessage = `🔹 *Top 20 Token Holders for* [${tokenCa}](https://solscan.io/token/${tokenCa})\n`;

    // Add info about the possible pumpfun bonding curve
    freshnessMessage += "ℹ️ The top token holder may represent the pumpfun bonding curve.\n";
    freshnessMessage += `ℹ️ The maximun amount of transactions analyzed per holder is set to ${maxTxLimit}.\n\n`;

    // Sort freshness data by holdings in descending order and get the top 20
    const topHolders = freshnessData
        .sort((a, b) => parseFloat(b.holding) - parseFloat(a.holding))
        .slice(0, 20);

    // Add top holders to the message
    topHolders.forEach((holder, index) => {
        const txCount = holder.txCount === maxTxLimit ? `more than ${maxTxLimit} txs` : `${holder.txCount} txs`;

        // Get the color based on txCount as percentage
        const txColor = getTransactionColor(holder.txCount, maxTxLimit);

        // Check if this is the top holder
        let pumpfunFlag = "";
        if (index === 0) {
            pumpfunFlag = "🔹 *Possible Liquidity Pool*"; // Add the flag to the top holder
        }

        freshnessMessage += `#*${String(index + 1).padEnd(3, ' ')}* [${holder.address.slice(0, 6)}...](https://solscan.io/account/${holder.address})` + ` - *${holder.holding}%* (${txColor} ${txCount}) ${pumpfunFlag}\n`;
    });

    return {freshnessMessage,topHolders};
}
module.exports = { fetchLargestTokenAccounts, getSupply, fetchAccountOwner, fetchWithRateLimit, fetchTransactionHistory, getTransaction, getTransactionColor,formatFreshnessMessage };