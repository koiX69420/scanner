const express = require('express');
const nacl = require("tweetnacl");
const { PublicKey } = require('@solana/web3.js');
const pool = require('../db/db');

const router = express.Router();

router.post("/verify-wallet", async (req, res) => {
  const { tgId, walletAddress, signedMessage } = req.body;
  const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
  const encodedMessage = new TextEncoder().encode(message);

  try {
    const publicKey = new PublicKey(walletAddress);
    const signature = new Uint8Array(signedMessage.signature.data);

    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBuffer());

    if (!isValid) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    const userUpsertQuery = `
      INSERT INTO validated_users (wallet_address, tg_id, last_updated)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) DO UPDATE
      SET tg_id = EXCLUDED.tg_id, last_updated = CURRENT_TIMESTAMP
      RETURNING id;
    `;

    const { rows } = await pool.query(userUpsertQuery, [walletAddress, tgId]);

    res.json({ success: true, wallet: walletAddress, userId: rows[0].id });

  } catch (error) {
    console.error("❌ Error verifying wallet:", error);
    res.status(400).json({ success: false, error: "Error verifying signature" });
  }
});

module.exports = router;
