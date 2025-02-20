const express = require('express');
const { generateTokenMessage } = require('../bot/scanner');
const pool = require('../db/db');

const router = express.Router();

router.post("/token-message", async (req, res) => {
  const { tokenAddress, walletPublicKey, isSummary = false } = req.body;

  if (!walletPublicKey) {
      return res.status(400).json({ success: false, error: "❌ Missing wallet public key" });
  }

  try {
      const validationQuery = `
          SELECT * FROM validated_users
          WHERE wallet_address = $1 
          AND last_updated > NOW() - INTERVAL '30 days'
      `;

      const { rows } = await pool.query(validationQuery, [walletPublicKey]);

      if (rows.length === 0) {
          return res.status(403).json({ 
              success: false, 
              error: `⛔ Wallet not validated. Verify via <a href="https://t.me/ManDogMFbot">@ManDogMFbot</a>` 
          });
      }

      const response = await generateTokenMessage(tokenAddress, isSummary);
      res.json(response);

  } catch (error) {
      console.error("❌ Error validating wallet:", error);
      res.status(500).json({ success: false, error: "🚨 Internal server error." });
  }
});

module.exports = router;
