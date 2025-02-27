const express = require('express');
const router = express.Router();
const pool = require('../db/db');

router.get('/get-token-scan-history', async (req, res) => {
  try {
    let { timeframe } = req.query;

    // Default to 30 days if no timeframe is provided
    if (!timeframe) timeframe = '30 days';

    // Validate timeframe input to prevent SQL injection
    const validTimeframeRegex = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?$/i;
    if (!validTimeframeRegex.test(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe format. Example: 1 day, 7 days, 30 days, 1 month' });
    }

    // SQL query using the user-provided interval
    const query = `
      SELECT * FROM token_scan_history 
      WHERE scan_timestamp >= NOW() - INTERVAL '${timeframe}'
      ORDER BY scan_timestamp DESC
    `;

    const result = await pool.query(query);

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching token scan history:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

// Endpoint to get top 10 most scanned tokens in the last 6 hours
router.get('/get-top-scanned-tokens', async (req, res) => {
  return     res.status(500).json({ error: 'Failed to fetch top scanned tokens' });

  try {
    const query = `
      SELECT token_address, symbol, COUNT(*) AS scan_count
      FROM token_scan_history
      WHERE scan_timestamp >= NOW() - INTERVAL '6 hours'
      GROUP BY token_address, symbol
      ORDER BY scan_count DESC
      LIMIT 10;
    `;

    const result = await pool.query(query);

    let tokenList = ""
    if (result.rows && result.rows.length > 0) {
      tokenList = result.rows.map(({ token_address, symbol, scan_count },index) => {
        return `<div class="token-entry" data-address="${token_address}"><p>${index+1}.<b>${symbol}</b> Total Scans:<b>${scan_count}</b></p></div>`;
      }).join('');
    }

    const ret = `
    <h3>Top 10 MDTT Scans (Last 6 Hours)</h3>
    <div class="token-list">
      ${tokenList}
    </div>`

    res.json({ message: ret });
  } catch (error) {
    console.error('Error fetching top scanned tokens:', error);
    res.status(500).json({ error: 'Failed to fetch top scanned tokens' });
  }
});


module.exports = router;
