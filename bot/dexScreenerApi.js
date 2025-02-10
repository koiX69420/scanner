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

async function fetchDexSocials(pools) {
    try {
        const chainId = "solana"; // Set the chain ID if it's constant

        // Fetch data for all pool IDs in parallel
        const dexSocials = await Promise.all(
            pools.map(async (pool) => {
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

module.exports = {
    fetchDexPay,
    fetchDexSocials
  };