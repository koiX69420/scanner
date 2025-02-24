const express = require('express');
const nacl = require("tweetnacl");
const { PublicKey } = require('@solana/web3.js');
const pool = require('../db/db');

const router = express.Router();

router.post("/verify", async (req, res) => {
  const { tgId, walletAddress, signedMessage,hardwareConcurrency,deviceMemory,language,userAgent } = req.body;
  const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
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
      INSERT INTO validated_users (wallet_address, tg_id, valid_until, hardware_concurrency, device_memory, language, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tg_id) 
      DO NOTHING;  -- Do nothing if tg_id already exists
    `;
    const result = await pool.query(insertQuery, [walletAddress, tgId, validUntil, hardwareConcurrency, deviceMemory, language, userAgent]);

    if (result.rowCount === 0) {
      // If no row was inserted (i.e., conflict occurred), notify the user
      return res.status(400).json({ success: false, error: "You are already verified." });
    }
    // Return success if new row was inserted
    res.json({ success: true });

  } catch (error) {
    console.error("❌ Error verifying wallet:", error);
    res.status(400).json({ success: false, error: "Error verifying wallet" });
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
      SELECT * FROM validated_users
      WHERE tg_id = $1 AND wallet_address = $2
    `;
    const { rows } = await pool.query(checkQuery, [tgId, walletAddress]);

    // If no matching entry exists, respond with an error
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "❌ User not found or verification not done." });
    }

    // Update device data for the existing user
    const updateQuery = `
      UPDATE validated_users
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
