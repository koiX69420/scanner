async function calculateClusterPercentages(holderData, fundingMap) {
  try {
    console.log(`Calculating cluster percentages...`);
    // Create a lookup map for holderData based on Address for fast access
    const holderDataMap = holderData.reduce((map, item) => {
      map[item.Address] = item;
      return map;
    }, {});

    const clusterPercentages = [];
    const ignoreAddresses = ["BmrLoL9jzYo4yiPUsFhYFU8hgE3CD3Npt8tgbqvneMyB"]
    // Iterate through the fundingMap entries
    for (const [sender, recipients] of Object.entries(fundingMap)) {
      // Skip if there are 1 or fewer recipients
      if (recipients.size <= 1) continue;
      if(ignoreAddresses.includes(sender)) continue;
      let totalHoldings = 0;

      // Iterate through each recipient and calculate the total holdings
      recipients.forEach((recipient) => {
        const data = holderDataMap[recipient]; // Fast lookup
        if (data) {
          totalHoldings += parseFloat(data["Current Holding (%)"]); // Add recipient's holding percentage
        }
      });

      // Push the cluster data to the result if totalHoldings is greater than zero
      if (totalHoldings > 0) {
        clusterPercentages.push({
          sender,
          recipients: [...recipients],
          totalHoldings: totalHoldings
        });
      }
    }

    // Sort clusters by total holdings percentage (descending)
    clusterPercentages.sort((a, b) => b.totalHoldings - a.totalHoldings);

    return clusterPercentages;
  } catch (error) {
    console.error("Error calculating cluster percentages:", error);
    return [];
  }
}

function formatTimestamp(timestamp) {

    if (!timestamp || isNaN(timestamp)) return "❌ Invalid Time"; // Handle bad data
  
    let correctedTimestamp;
  
    if (timestamp < 1e12) {
      // Seconds (10-digit)
      correctedTimestamp = timestamp * 1000;
    } else if (timestamp < 1e15) {
      // Milliseconds (13-digit)
      correctedTimestamp = timestamp;
    } else if (timestamp < 1e18) {
      // Microseconds (16-digit) → Convert to milliseconds
      correctedTimestamp = Math.floor(timestamp / 1e3);
    } else {
      // Nanoseconds (19-digit) → Convert to milliseconds
      correctedTimestamp = Math.floor(timestamp / 1e6);
    }
  
    const date = new Date(correctedTimestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
  function formatMarketCap(value,commas=2) {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(commas)}B`; // Billions
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(commas)}M`; // Millions
    if (value >= 1_000) return `${(value / 1_000).toFixed(commas)}K`; // Thousands
    return value.toFixed(commas); // Less than 1,000
  }

module.exports = {
    calculateClusterPercentages,
    formatMarketCap,
    formatTimestamp
  };