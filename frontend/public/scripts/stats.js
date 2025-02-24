// stats.js

// Helper function to format date to string
function formatDate(date) {
    return new Date(date).toLocaleString();
}

// Helper function to filter scan data based on the selected timeframe
function filterDataByTimeframe(scanHistoryData, timeframe) {
    const now = new Date();

    // Calculate the start of the timeframe
    let timeframeStart;
    if (timeframe === '1d') {
        timeframeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    } else if (timeframe === '7d') {
        timeframeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    } else if (timeframe === '30d') {
        timeframeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    }

    // Filter data to include only those scans that are within the selected timeframe
    return scanHistoryData.filter(item => new Date(item.scan_timestamp) >= timeframeStart);
}

// Function to update the chart based on the selected timeframe
// Function to update the chart based on the selected timeframe
function updateChart(timeframe) {
    // Fetch token scan history from your API
    fetch('/api/get-token-scan-history')
        .then(response => response.json())
        .then(data => {
            let scanHistoryData = data.history;

            // Filter data based on selected timeframe
            scanHistoryData = filterDataByTimeframe(scanHistoryData, timeframe);

            // Group scan data by symbol and timestamp
            const symbolScanData = {};
            const allTimestamps = new Set();

            scanHistoryData.forEach(item => {
                const timestamp = new Date(item.scan_timestamp).toLocaleString(); // Convert to string for grouping
                const symbol = item.symbol;
                const tokenAddress = item.token_address; // Extract token address

                // Initialize symbol entry if not exists
                if (!symbolScanData[symbol]) {
                    symbolScanData[symbol] = { timestamps: {}, tokenAddress };
                }

                // Count occurrences of scans for each timestamp per symbol
                if (symbolScanData[symbol].timestamps[timestamp]) {
                    symbolScanData[symbol].timestamps[timestamp]++;
                } else {
                    symbolScanData[symbol].timestamps[timestamp] = 1;
                }

                // Collect all unique timestamps across all symbols for continuous x-axis
                allTimestamps.add(timestamp);
            });

            // Convert the set of all timestamps to an array and sort it
            const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => new Date(a) - new Date(b));

            // Determine the fixed interval for the x-axis based on the timeframe
            let tickInterval;
            if (timeframe === '1d') {
                // For 1 day, set the interval to 1 minute
                tickInterval = 60 * 1000; // 1 minute in milliseconds
            } else if (timeframe === '7d') {
                // For 7 days, set the interval to 1 hour
                tickInterval = 60 * 60 * 1000; // 1 hour in milliseconds
            } else if (timeframe === '30d') {
                // For 30 days, set the interval to 1 day
                tickInterval = 24 * 60 * 60 * 1000; // 1 day in milliseconds
            }

            // Generate timestamps with fixed intervals
            const startTime = new Date(sortedTimestamps[0]).getTime();
            const endTime = new Date(sortedTimestamps[sortedTimestamps.length - 1]).getTime();
            const fixedIntervals = [];
            for (let time = startTime; time <= endTime; time += tickInterval) {
                fixedIntervals.push(new Date(time).toLocaleString());
            }

            // Prepare the data for the Plotly chart
            const chartData = Object.keys(symbolScanData).map(symbol => {
                const timestamps = sortedTimestamps;  // Use all sorted timestamps
                const scanCounts = timestamps.map(timestamp => symbolScanData[symbol].timestamps[timestamp] || null); // Fill with null for missing data
                const tokenAddress = symbolScanData[symbol].tokenAddress; // Get the token address

                return {
                    x: timestamps,  // timestamps as x-axis labels
                    y: scanCounts,  // counts of scans as y-axis
                    type: 'scatter',
                    mode: 'lines',  // Line chart with smooth lines
                    name: symbol,  // Set symbol as line name in the legend
                    line: { width: 1 }, // Line styling
                    hoverinfo: 'y+name',  // Only show scan count ('y') and symbol name in hover tooltip
                    hovertemplate: `${symbol}<br>Scans: %{y}<br>Token Address: ${tokenAddress}<extra></extra>`,  // Add token address to hover
                };
            });

            // Layout configuration for the Plotly chart
            const layout = {
                title: {
                    text: `Number of Token Scans Over Time (Grouped by Symbol) Timeframe: ${timeframe}`,
                    font: { size: 16 },
                },
                xaxis: {
                    title: 'Timestamp',
                    tickangle: -45,
                    tickmode: 'array',
                    showgrid: true,
                },
                yaxis: {
                    title: 'Number of Scans',
                    showgrid: true,
                },
                showlegend: true,  // Show the legend to differentiate symbols
                margin: { t: 40, b: 80, l: 60, r: 40 },
            };

            // Plot the chart
            Plotly.newPlot('scan-history-chart', chartData, layout);
        })
        .catch(error => {
            console.error('Error fetching scan history:', error);
        });
}

// Initial chart render with a default timeframe (e.g., 1 Day)
updateChart('1d');

// Add event listeners for time range selection buttons
document.querySelector('#timeframe-1d').addEventListener('click', () => updateChart('1d'));
document.querySelector('#timeframe-7d').addEventListener('click', () => updateChart('7d'));
document.querySelector('#timeframe-30d').addEventListener('click', () => updateChart('30d'));
