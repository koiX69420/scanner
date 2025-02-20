const express = require('express');
const pool = require('../db/db');

const router = express.Router();

router.get("/check-wallet", async (req, res) => {
  const { walletPublicKey } = req.query;
  if (!walletPublicKey) return res.status(400).json({ success: false, error: "Missing wallet address" });

  try {
    const result = await pool.query(
      `SELECT last_updated FROM validated_users WHERE wallet_address = $1`,
      [walletPublicKey]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, error: "Wallet not validated" });
    }

    const lastUpdated = new Date(result.rows[0].last_updated);
    const now = new Date();
    const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));

    return res.json({
      success: daysSinceUpdate < 30,
      last_updated: result.rows[0].last_updated,
      daysLeft: 30 - daysSinceUpdate
    });

  } catch (error) {
    console.error("Error checking wallet:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/check-tgid", async (req, res) => {
    const { tgId } = req.query;
    if (!tgId) {
        return res.status(400).json({ success: false, error: "Missing Telegram ID" });
    }
  
    try {
        const result = await pool.query(
            `SELECT last_updated,wallet_address FROM validated_users WHERE tg_id = $1`,
            [tgId]
        );
  
        if (result.rows.length === 0) {
            return res.json({ success: false, error: "Telegram ID not validated" });
        }
  
        const lastUpdated = new Date(result.rows[0].last_updated);
        const now = new Date();
        const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
  
        return res.json({
            success: daysSinceUpdate < 30, 
            last_updated: result.rows[0].last_updated,
            daysLeft: 30 - daysSinceUpdate,
            publicKey:result.rows[0].wallet_address
        });
    } catch (error) {
        console.error("Error checking Telegram ID validation:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
  });

module.exports = router;
