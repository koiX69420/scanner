const express = require('express');
const { generateTokenMessage } = require('../bot/scanner');
const pool = require('../db/db');

const router = express.Router();

router.post("/token-message", async (req, res) => {
  const { tokenAddress, walletAddress, isSummary = false, hardwareConcurrency, deviceMemory, language, userAgent } = req.body;

  if (!walletAddress) {
      return res.status(400).json({ success: false, error: "❌ Missing wallet public key" });
  }

  try {
      // Query to check if wallet is validated and device data matches
      const validationQuery = `
          SELECT * FROM validated_users
          WHERE wallet_address = $1
      `;

      const { rows } = await pool.query(validationQuery, [walletAddress]);

// If no row is returned, it means the wallet is not validated
if (rows.length === 0) {
    return res.status(403).json({ 
        success: false, 
        error: `⛔ Wallet not validated. Please complete the verification process via <a href="https://t.me/ManDogMFbot?start=verify" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>` 
    });
}

const user = rows[0];

// Check if validation has expired
if (new Date(user.valid_until) < new Date()) {
    return res.status(403).json({ 
        success: false, 
        error: `⛔ Validation expired. Please renew your validation via <a href="https://t.me/ManDogMFbot?start=verify" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>` 
    });
}

// Check if device data matches
if (
    user.hardware_concurrency !== hardwareConcurrency ||
    user.device_memory !== deviceMemory ||
    user.language !== language ||
    user.user_agent !== userAgent
) {
    return res.status(403).json({ 
        success: false, 
        error: `⛔ Device mismatch detected. Please update your device information via <a href="https://t.me/scannerdevtemp_bot?start=deviceupdate" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>` 
    });
}

      // If all checks pass, generate the token message
      const response = await generateTokenMessage(tokenAddress, isSummary);
      res.json(response);

  } catch (error) {
      console.error("❌ Error validating wallet:", error);
      res.status(500).json({ success: false, error: "🚨 Internal server error." });
  }
});

module.exports = router;
