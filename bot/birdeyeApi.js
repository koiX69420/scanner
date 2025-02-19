const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY
async function fetchAth(tokenAddress,created_time) {
    const granularityType = getGranularityType(created_time);

    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            'x-chain': 'solana',
            'X-API-KEY': BIRDEYE_API_KEY
        }
    };

    const url = `https://public-api.birdeye.so/defi/history_price?address=${tokenAddress}&address_type=token&type=${granularityType}&time_from=${created_time}&time_to=10000000000`;
    try {
        // Fetch data from Birdeye API
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.success) {
            // Find the all-time high (max value) from the items array
            const allTimeHigh = data.data.items.reduce((max, item) => {
                return item.value > max ? item.value : max;
            }, 0);

            return { allTimeHigh };
        } else {
            throw new Error("Failed to fetch data from Birdeye API.");
        }
    } catch (error) {
        console.error(`❌ Error fetching all-time high for ${tokenAddress}:`, error.message);
        return {
            allTimeHigh: 0
        };
    }
}

function getGranularityType(created_time) {
    // Get current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Calculate the time difference (in seconds)
    const timeDiff = currentTime - created_time;
    
    // Define the time thresholds for each granularity (in seconds)
    const ONE_DAY = 24 * 60 * 60;      // 1 day = 86400 seconds
    const SEVEN_DAYS = 7 * ONE_DAY;    // 7 days = 604800 seconds
    const THIRTY_DAYS = 30 * ONE_DAY;  // 30 days = 2592000 seconds

    // Decide granularity based on the time difference
    if (timeDiff <= ONE_DAY) {
        return "5m";   // 15 minutes for the most recent data
    }else if (timeDiff <= SEVEN_DAYS) {
        return "15m";    // 6 hours for tokens created within the last 30 days
    } else if (timeDiff <= THIRTY_DAYS) {
        return "1H";    // 6 hours for tokens created within the last 30 days
    } else if (timeDiff <= 2 * THIRTY_DAYS) {
        return "12H";   // 12 hours for tokens older than 30 days, up to 90 days
    } else {
        return "1D";    // 1 day for tokens older than 90 days
    }
}

module.exports = {
    fetchAth
  };