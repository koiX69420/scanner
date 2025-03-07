const express = require('express');
const pool = require('../db/db');

const router = express.Router();

// Check if wallet address is validated
router.get("/check-wallet", async (req, res) => {
  const { walletPublicKey } = req.query;
  if (!walletPublicKey) return res.status(400).json({ success: false, error: "Missing wallet address" });

  try {
    const result = await pool.query(
      `SELECT valid_until FROM subscribed_users WHERE wallet_address = $1`,
      [walletPublicKey]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, error: "Wallet not validated" });
    }

    const validUntil = new Date(result.rows[0].valid_until);
    const now = new Date();
    const daysLeft = Math.floor((validUntil - now) / (1000 * 60 * 60 * 24));

    return res.json({
      success: daysLeft > 0,
      valid_until: result.rows[0].valid_until,
      daysLeft: daysLeft
    });

  } catch (error) {
    console.error("Error checking wallet:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// Check if Telegram ID is validated
router.get("/sub/check-tgid", async (req, res) => {
    const { tgId } = req.query;
    if (!tgId) {
        return res.status(400).json({ success: false, error: "Missing Telegram ID" });
    }
  
    try {
        const result = await pool.query(
            `SELECT valid_until, wallet_address FROM subscribed_users WHERE tg_id = $1`,
            [tgId]
        );
  
        if (result.rows.length === 0) {
            return res.json({ success: false, error: "Telegram ID not validated" });
        }
  
        const validUntil = new Date(result.rows[0].valid_until);
        const now = new Date();
        const daysLeft = Math.floor((validUntil - now) / (1000 * 60 * 60 * 24));

        return res.json({
            success: daysLeft > 0, 
            valid_until: result.rows[0].valid_until,
            daysLeft: daysLeft,
            publicKey: result.rows[0].wallet_address
        });
    } catch (error) {
        console.error("Error checking Telegram ID validation:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});

// Check if Telegram ID is validated
router.get("/link/check-tgid", async (req, res) => {
  const { tgId } = req.query;
  if (!tgId) {
      return res.status(400).json({ success: false, error: "Missing Telegram ID" });
  }

  try {
      const result = await pool.query(
          `SELECT tg_id, wallet_address FROM users WHERE tg_id = $1`,
          [tgId]
      );

      if (result.rows.length === 0) {
          return res.json({ success: false, error: "Telegram ID not linked with wallet" });
      }

      return res.json({
          success: true, 
          tg_id:tgId,
          publicKey: result.rows[0].wallet_address
      });
  } catch (error) {
      console.error("Error checking Telegram ID linking:", error);
      return res.status(500).json({ success: false, error: "Server error" });
  }
});
module.exports = router;
