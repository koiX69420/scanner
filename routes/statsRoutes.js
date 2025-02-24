const express = require('express');
const router = express.Router();
const pool = require('../db/db');
router.get('/get-token-scan-history', async (req, res) => {
  try {
    const query = 'SELECT * FROM token_scan_history ORDER BY scan_timestamp DESC';
    const result = await pool.query(query);

    // Send the scan history data to the frontend
    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching token scan history:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});


module.exports = router;