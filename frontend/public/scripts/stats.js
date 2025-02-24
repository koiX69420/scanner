// Function to update the chart based on the selected timeframe
function updateChart(timeframe) {
    fetch(`/api/get-token-scan-history?timeframe=${encodeURIComponent(timeframe)}`)
        .then(response => response.json())
        .then(data => {
            const scanHistoryData = data.history;
            if (scanHistoryData.length === 0) {
                console.warn('No data available for the selected timeframe.');
                return;
            }

            // Group scan data by symbol and timestamp
            const symbolScanData = {};
            const allTimestamps = new Set();

            scanHistoryData.forEach(item => {
                const timestamp = new Date(item.scan_timestamp).toISOString();
                const symbol = item.symbol;

                if (!symbolScanData[symbol]) {
                    symbolScanData[symbol] = { timestamps: {}, cumulativeSum: 0 };
                }

                symbolScanData[symbol].timestamps[timestamp] = (symbolScanData[symbol].timestamps[timestamp] || 0) + 1;
                allTimestamps.add(timestamp);
            });

            // Convert timestamps to a sorted array
            const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => new Date(a) - new Date(b));

            // Prepare the data for the Plotly chart
            let chartData = Object.keys(symbolScanData).map(symbol => {
                let cumulativeSum = 0;
                const scanCounts = sortedTimestamps.map(ts => {
                    cumulativeSum += symbolScanData[symbol].timestamps[ts] || 0;
                    return cumulativeSum;
                });

                return {
                    x: sortedTimestamps,
                    y: scanCounts,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${symbol} (Scans: ${cumulativeSum})`, // Append total scans
                    totalScans: cumulativeSum, // Store total for sorting
                    line: { width: 1 },
                    hoverinfo: 'y+name',
                    hovertemplate: `${symbol}<br>Cumulative Scans: %{y}<extra></extra>`,
                };
            });

            // Sort chartData by totalScans in descending order
            chartData.sort((a, b) => b.totalScans - a.totalScans);

            // Layout configuration with range slider
            const layout = {
                title: { text: `Cumulative Token Scans Over Time (${timeframe})`, font: { size: 16 } },
                xaxis: {
                    title: 'Timestamp',
                    type: 'date',
                    showgrid: true,
                    rangeselector: {
                        buttons: [
                            { count: 1, label: '1d', step: 'day', stepmode: 'backward' },
                            { count: 7, label: '7d', step: 'day', stepmode: 'backward' },
                            { count: 30, label: '30d', step: 'day', stepmode: 'backward' },
                            { step: 'all' }
                        ]
                    },
                    rangeslider: { visible: true }
                },
                yaxis: { title: 'Cumulative Number of Scans', showgrid: true },
                showlegend: true,
                margin: { t: 40, b: 80, l: 60, r: 40 },
            };

            // Plot the chart
            Plotly.newPlot('scan-history-chart', chartData, layout);
        })
        .catch(error => console.error('Error fetching scan history:', error));
}

// Initial chart render with default timeframe
updateChart('30 days');
