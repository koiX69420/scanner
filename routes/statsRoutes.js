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

module.exports = router;
