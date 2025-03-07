const express = require('express');
const nacl = require("tweetnacl");
const { PublicKey } = require('@solana/web3.js');
const pool = require('../db/db');

const router = express.Router();

router.post("/link", async (req, res) => {
  const { tgId, walletAddress, signedMessage} = req.body;

  if (!tgId || !walletAddress || !signedMessage) {
    return res.status(400).json({ success: false, error: "❌ Missing required fields." });
  }

  const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
  const encodedMessage = new TextEncoder().encode(message);

  try {
    const publicKey = new PublicKey(walletAddress);
    const signature = new Uint8Array(signedMessage.signature.data);

    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBuffer());

    if (!isValid) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    const query = `
    INSERT INTO users (tg_id, wallet_address)
    VALUES ($1, $2)
    ON CONFLICT (tg_id) 
    DO UPDATE SET wallet_address = EXCLUDED.wallet_address
    RETURNING *;
  `;

  const { rowCount } = await pool.query(query, [tgId, walletAddress]);

  if (rowCount > 0) {
    return res.json({ success: true, message: "✅ Wallet linked successfully!" });
  } else {
    return res.status(400).json({ success: false, error: "❌ Failed to link wallet." });
  }
} catch (error) {
  console.error("❌ Error linking wallet:", error);
  res.status(500).json({ success: false, error: "🚨 Internal server error. Please try again later." });
}
});


router.post("/subscribe", async (req, res) => {
  const { tgId, walletAddress, signedMessage,hardwareConcurrency,deviceMemory,language,userAgent } = req.body;

  if (!tgId || !walletAddress || !signedMessage) {
    return res.status(400).json({ success: false, error: "❌ Missing required fields." });
  }

  const message = `Sign this message to subscribe this wallet for Telegram ID: ${tgId}`;
  const encodedMessage = new TextEncoder().encode(message);

  try {
    const publicKey = new PublicKey(walletAddress);
    const signature = new Uint8Array(signedMessage.signature.data);

    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBuffer());

    if (!isValid) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    // Get the current timestamp for valid_until (e.g., 1 year from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30); // Add 30 days to the current date

    // Insert or do nothing if tgId already exists
    const insertQuery = `
      INSERT INTO subscribed_users (tg_id, wallet_address, valid_until, hardware_concurrency, device_memory, language, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tg_id) 
      DO NOTHING;  -- Do nothing if tg_id already exists
    `;
    const result = await pool.query(insertQuery, [tgId,walletAddress, validUntil, hardwareConcurrency, deviceMemory, language, userAgent]);

    if (result.rowCount === 0) {
      // If no row was inserted (i.e., conflict occurred), notify the user
      return res.status(400).json({ success: false, error: "You are already subscribed." });
    }
    // Return success if new row was inserted
    res.json({ success: true, message: "✅ Wallet successfully subscribed!" });

  } catch (error) {
    console.error("❌ Error subscribe wallet:", error);
    res.status(500).json({ success: false, error: "🚨 Internal server error. Please try again later." });
  }
});
// Endpoint to update device data
router.post("/update-device", async (req, res) => {
  const { tgId, walletAddress, hardwareConcurrency, deviceMemory, language, userAgent } = req.body;

  // Validate input parameters
  if (!tgId || !walletAddress) {
    return res.status(400).json({ success: false, error: "❌ Missing tgId or wallet address." });
  }

  try {
    // Query to check if the user exists with the same tgId and walletAddress
    const checkQuery = `
      SELECT * FROM subscribed_users
      WHERE tg_id = $1 AND wallet_address = $2
    `;
    const { rows } = await pool.query(checkQuery, [tgId, walletAddress]);

    // If no matching entry exists, respond with an error
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "❌ User not found or verification not done." });
    }

    // Update device data for the existing user
    const updateQuery = `
      UPDATE subscribed_users
      SET hardware_concurrency = $3, device_memory = $4, language = $5, user_agent = $6
      WHERE tg_id = $1 AND wallet_address = $2
      RETURNING *;
    `;
    
    const updateResult = await pool.query(updateQuery, [tgId, walletAddress, hardwareConcurrency, deviceMemory, language, userAgent]);

    // If update successful, send success response
    if (updateResult.rowCount > 0) {
      return res.json({ success: true, message: "✅ Device data updated successfully!" });
    }

    // If update fails, send failure response
    return res.status(400).json({ success: false, error: "❌ Failed to update device data. Please try again." });

  } catch (error) {
    console.error("❌ Error updating device data:", error);
    res.status(500).json({ success: false, error: "🚨 Internal server error. Please try again later." });
  }
});

module.exports = router;
